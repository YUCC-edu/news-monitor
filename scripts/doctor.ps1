param(
  [switch]$Json
)

$ErrorActionPreference = "Continue"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$composeFile = Join-Path $repoRoot "docker/compose.yaml"
$envPath = Join-Path $repoRoot ".env"
$checks = New-Object System.Collections.Generic.List[object]

function Add-Check([string]$name, [bool]$ok, [string]$detail, [string]$hint = "") {
  $checks.Add([pscustomobject]@{
    name = $name
    ok = $ok
    detail = $detail
    hint = $hint
  }) | Out-Null
}

function Test-Command([string]$name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  return $null -ne $cmd
}

function Get-DotEnvValue([string]$key) {
  if (-not (Test-Path $envPath)) { return "" }
  $line = Get-Content -LiteralPath $envPath |
    Where-Object { $_ -match ("^\s*{0}\s*=" -f [regex]::Escape($key)) } |
    Select-Object -First 1
  if (-not $line) { return "" }
  $value = ($line -split "=", 2)[1].Trim()
  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }
  return $value
}

function Sync-ComposeHostPaths {
  $obsidianVaultPath = Get-DotEnvValue "OBSIDIAN_VAULT_PATH"
  if ($obsidianVaultPath) {
    $env:NEWS_OBSIDIAN_HOST_PATH = $obsidianVaultPath
  } else {
    Remove-Item Env:\NEWS_OBSIDIAN_HOST_PATH -ErrorAction SilentlyContinue
  }
}

Set-Location $repoRoot

$dockerInstalled = Test-Command "docker"
Add-Check "Docker CLI" $dockerInstalled ($(if ($dockerInstalled) { "installed" } else { "not found" })) "Install Docker Desktop."

if ($dockerInstalled) {
  & docker info *> $null
  $dockerRunning = $LASTEXITCODE -eq 0
  Add-Check "Docker Engine" $dockerRunning ($(if ($dockerRunning) { "running" } else { "not reachable" })) "Start Docker Desktop and wait for the engine."

  if ($dockerRunning) {
    Sync-ComposeHostPaths
    & docker compose -f $composeFile ps --format json *> $null
    Add-Check "Compose project" ($LASTEXITCODE -eq 0) ($(if ($LASTEXITCODE -eq 0) { "compose file is readable" } else { "compose ps failed" })) "Run News Monitor.cmd once to create containers."

    $containers = @("news-postgres", "news-redis", "news-rsshub", "news-wewe-rss", "news-web", "news-worker")
    foreach ($container in $containers) {
      $status = (& docker inspect --format "{{.State.Status}}" $container 2>$null)
      if ($LASTEXITCODE -ne 0 -or -not $status) {
        Add-Check $container $false "missing" "Start the app, then re-run diagnostics."
        continue
      }
      $health = (& docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{end}}" $container 2>$null)
      $healthText = if ($health) { $health.Trim() } else { "no healthcheck" }
      $statusText = $status.Trim()
      $ok = $statusText -eq "running" -and ($healthText -eq "healthy" -or $healthText -eq "no healthcheck")
      Add-Check $container $ok "$statusText / $healthText" "Open Docker Desktop logs for this container."
    }
  }
}

try {
  $resp = Invoke-WebRequest -Uri "http://127.0.0.1:3000/api/system" -UseBasicParsing -TimeoutSec 3
  Add-Check "Web API" ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300) "HTTP $($resp.StatusCode)" "Wait for startup to finish or inspect news-web logs."
} catch {
  Add-Check "Web API" $false $_.Exception.Message "Open http://localhost:3000 after the app reports ready."
}

Add-Check ".env" (Test-Path $envPath) ($(if (Test-Path $envPath) { "present" } else { "missing" })) "News Monitor.cmd creates it from .env.example."

if ($Json) {
  $checks | ConvertTo-Json -Depth 4
  exit ($(if (($checks | Where-Object { -not $_.ok }).Count -eq 0) { 0 } else { 1 }))
}

Write-Host "News Monitor diagnostics" -ForegroundColor Green
foreach ($check in $checks) {
  $mark = if ($check.ok) { "OK " } else { "FAIL" }
  $color = if ($check.ok) { "Green" } else { "Red" }
  Write-Host ("[{0}] {1}: {2}" -f $mark, $check.name, $check.detail) -ForegroundColor $color
  if (-not $check.ok -and $check.hint) {
    Write-Host ("     Hint: {0}" -f $check.hint) -ForegroundColor Yellow
  }
}

$failed = ($checks | Where-Object { -not $_.ok }).Count
if ($failed -gt 0) {
  Write-Host ""
  Write-Host "$failed check(s) failed." -ForegroundColor Red
  exit 1
}

Write-Host ""
Write-Host "All checks passed. Open http://localhost:3000" -ForegroundColor Green
