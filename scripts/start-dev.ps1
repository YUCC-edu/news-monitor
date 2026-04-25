param(
  [switch]$SkipInstall,
  [switch]$SkipMigrate,
  [switch]$NoOpenBrowser,
  [switch]$DockerApp
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$composeFile = Join-Path $repoRoot "docker/compose.yaml"
$localProcessScript = Join-Path $PSScriptRoot "restart-web-worker.ps1"
$envPath = Join-Path $repoRoot ".env"
$envExamplePath = Join-Path $repoRoot ".env.example"
$totalSteps = if ($DockerApp) { 8 } else { 9 }
$script:StepIndex = 0

function Step([string]$message) {
  $script:StepIndex += 1
  Write-Host ""
  Write-Host ("[{0}/{1}] {2}" -f $script:StepIndex, $totalSteps, $message) -ForegroundColor Cyan
}

function Info([string]$message) {
  Write-Host ("    {0}" -f $message) -ForegroundColor DarkGray
}

function Fail([string]$message, [string]$hint = "") {
  Write-Host ""
  Write-Host ("FAILED: {0}" -f $message) -ForegroundColor Red
  if ($hint) {
    Write-Host ("Hint: {0}" -f $hint) -ForegroundColor Yellow
  }
  exit 1
}

function Require-Command([string]$name, [string]$hint) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    Fail "$name was not found." $hint
  }
}

function Run-Checked([string]$label, [scriptblock]$block, [string]$hint = "") {
  Info $label
  & $block
  if ($LASTEXITCODE -ne 0) {
    Fail "$label failed with exit code $LASTEXITCODE." $hint
  }
}

function Run-Pnpm {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$PnpmArgs
  )

  & corepack pnpm @PnpmArgs
}

function Wait-ForContainer {
  param(
    [string]$Name,
    [string]$ReadyState,
    [int]$TimeoutSec = 120
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    $status = & docker inspect --format "{{.State.Status}}" $Name 2>$null
    if ($LASTEXITCODE -eq 0 -and $status) {
      $status = $status.Trim()
      $health = & docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{end}}" $Name 2>$null
      if ($LASTEXITCODE -eq 0 -and $null -ne $health) {
        $health = $health.Trim()
      } else {
        $health = ""
      }

      if ($ReadyState -eq "healthy" -and $health -eq "healthy") { return }
      if ($ReadyState -eq "running" -and $status -eq "running") { return }
      if ($ReadyState -eq "started" -and ($status -eq "running" -or $status -eq "exited")) { return }
    }
    Start-Sleep -Seconds 2
  }

  Fail "Timed out waiting for container $Name to become $ReadyState." "Run 'docker ps -a' and 'docker logs $Name' to inspect it."
}

function Wait-ForHttp {
  param(
    [string]$Url,
    [int]$TimeoutSec = 90
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try {
      $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 500) { return }
    } catch {
      # Keep polling below.
    }
    Start-Sleep -Seconds 2
  }

  Fail "Web did not answer at $Url within $TimeoutSec seconds." "Check the web PowerShell window or run 'corepack pnpm dev:web' manually."
}

Set-Location $repoRoot

Write-Host "news-monitor one-click startup" -ForegroundColor Green
Write-Host ("Root: {0}" -f $repoRoot)
if ($DockerApp) {
  Write-Host "Mode: Docker app stack (postgres, redis, rsshub, wewe-rss, migrate, web, worker)"
} else {
  Write-Host "Mode: local dev app (Docker dependencies + local web/worker)"
}

Step "Checking required tools"
Require-Command "node" "Install Node.js 22 LTS, then reopen this terminal."
Require-Command "corepack" "Corepack ships with modern Node.js. Install Node.js 22 LTS."
Require-Command "docker" "Install and start Docker Desktop."
Run-Checked "Checking Docker engine" { docker info | Out-Null } "Start Docker Desktop and wait until it says the engine is running."
Run-Checked "Checking pnpm through Corepack" { Run-Pnpm --version | Out-Null } "If Corepack cannot launch pnpm, run 'corepack prepare pnpm@9.12.0 --activate' once in a terminal, or install pnpm globally."

Step "Preparing .env"
if (-not (Test-Path $envPath)) {
  if (-not (Test-Path $envExamplePath)) {
    Fail ".env.example is missing." "Restore .env.example or create .env manually."
  }
  Copy-Item $envExamplePath $envPath
  Info "Created .env from .env.example"
} else {
  Info ".env already exists"
}

Step "Installing dependencies"
if ($SkipInstall) {
  Info "Skipped by -SkipInstall"
} elseif (Test-Path (Join-Path $repoRoot "node_modules/.pnpm")) {
  Info "node_modules found; skipping install"
} else {
  Run-Checked "Running corepack pnpm install" { Run-Pnpm install } "Check your network, pnpm lockfile, and Node version."
}

Step "Stopping old local web/worker processes"
Run-Checked "Stopping local web/worker if present" {
  powershell -NoLogo -ExecutionPolicy Bypass -File $localProcessScript -StopOnly
} "Close any terminal windows running news-monitor and retry."

if ($DockerApp) {
  Step "Starting full Docker app stack"
  Run-Checked "docker compose up -d --build web worker" {
    docker compose -f $composeFile up -d --build web worker
  } "Inspect Docker Desktop logs. If this is first launch, image build can take several minutes."

  Step "Waiting for Docker containers"
  Wait-ForContainer -Name "news-postgres" -ReadyState "healthy" -TimeoutSec 180
  Wait-ForContainer -Name "news-redis" -ReadyState "healthy" -TimeoutSec 180
  Wait-ForContainer -Name "news-rsshub" -ReadyState "running" -TimeoutSec 180
  Wait-ForContainer -Name "news-wewe-rss" -ReadyState "running" -TimeoutSec 180
  Wait-ForContainer -Name "news-web" -ReadyState "healthy" -TimeoutSec 240
  Wait-ForContainer -Name "news-worker" -ReadyState "healthy" -TimeoutSec 240
} else {
  Step "Starting Docker dependencies"
  Run-Checked "docker compose up -d postgres redis rsshub wewe-rss" {
    docker compose -f $composeFile up -d postgres redis rsshub wewe-rss
  } "Docker compose failed. Check Docker Desktop and docker/compose.yaml."

  Step "Waiting for Docker dependencies"
  Wait-ForContainer -Name "news-postgres" -ReadyState "healthy" -TimeoutSec 180
  Wait-ForContainer -Name "news-redis" -ReadyState "healthy" -TimeoutSec 180
  Wait-ForContainer -Name "news-rsshub" -ReadyState "running" -TimeoutSec 180
  Wait-ForContainer -Name "news-wewe-rss" -ReadyState "running" -TimeoutSec 180

  Step "Running database migrations"
  if ($SkipMigrate) {
    Info "Skipped by -SkipMigrate"
  } else {
    Run-Checked "corepack pnpm --filter @news/db migrate" {
      Run-Pnpm --filter "@news/db" migrate
    } "Check DATABASE_URL in .env and whether news-postgres is healthy."
  }

  Step "Starting local web and worker"
  Run-Checked "Opening web/worker PowerShell windows" {
    powershell -NoLogo -ExecutionPolicy Bypass -File $localProcessScript -StartOnly
  } "Run 'corepack pnpm dev:web' and 'corepack pnpm dev:worker' manually to see raw errors."
}

Step "Waiting for web UI"
Wait-ForHttp -Url "http://127.0.0.1:3000" -TimeoutSec 120

Step "Printing runtime status"
Run-Checked "corepack pnpm nm -- ai status --json" {
  Run-Pnpm nm -- ai status --json
} "If this fails, the app may still be usable; check .env and Redis/Postgres connectivity."
Run-Checked "corepack pnpm nm -- queue status --json" {
  Run-Pnpm nm -- queue status --json
} "If this fails, check Redis and the worker process."

if (-not $NoOpenBrowser) {
  Step "Opening browser"
  Start-Process "http://localhost:3000" | Out-Null
  Info "Browser opened"
} else {
  Step "Skipping browser open"
  Info "Open http://localhost:3000 manually"
}

Write-Host ""
Write-Host "news-monitor is ready." -ForegroundColor Green
Write-Host "Web UI: http://localhost:3000"
Write-Host "CLI check: corepack pnpm nm -- status"
Write-Host "Stop all:  stop-dev.cmd  or  corepack pnpm stop:dev"
Write-Host "Restart web/worker only: restart-web-worker.cmd  or  corepack pnpm restart:dev"
