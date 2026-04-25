param(
  [switch]$StopOnly,
  [switch]$StartOnly
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$webWindowTag = "news-monitor:web-shell"
$workerWindowTag = "news-monitor:worker-shell"

if ($StopOnly -and $StartOnly) {
  throw "StopOnly and StartOnly cannot be used together."
}

function Stop-DevProcesses {
  $patterns = @(
    [regex]::Escape($webWindowTag),
    [regex]::Escape($workerWindowTag),
    "corepack\s+pnpm\s+dev:web",
    "corepack\s+pnpm\s+dev:worker",
    "pnpm\s+dev:web",
    "pnpm\s+--filter\s+@news/web\s+dev",
    "pnpm\s+dev:worker",
    "pnpm\s+--filter\s+@news/worker\s+dev",
    "scripts/run-next-with-root-env\.mjs\s+dev",
    "next\s+dev\s+-H\s+127\.0\.0\.1\s+-p\s+3000",
    "tsx.*src/index\.ts",
    "src/index\.ts"
  )

  $targets = Get-CimInstance Win32_Process | Where-Object {
    $cmd = $_.CommandLine
    if (-not $cmd) { return $false }
    foreach ($pattern in $patterns) {
      if ($cmd -match $pattern) { return $true }
    }
    return $false
  }

  foreach ($proc in $targets) {
    try {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
      Write-Host "Stopped process $($proc.ProcessId)"
    } catch {
      Write-Warning "Failed to stop process $($proc.ProcessId): $($_.Exception.Message)"
    }
  }

  $listener = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($listener) {
    try {
      Stop-Process -Id $listener.OwningProcess -Force -ErrorAction Stop
      Write-Host "Freed port 3000 by killing PID $($listener.OwningProcess)"
    } catch {
      Write-Warning "Failed to free port 3000: $($_.Exception.Message)"
    }
  }
}

function Start-DevProcess([string]$name, [string]$command) {
  $windowTag = if ($name -eq "web") { $webWindowTag } else { $workerWindowTag }
  $scriptBlock = "& { `$host.UI.RawUI.WindowTitle = '$windowTag'; Set-Location '$repoRoot'; $command }"
  $arg = "-NoLogo -NoExit -Command `"$scriptBlock`""
  Start-Process powershell -ArgumentList $arg | Out-Null
  Write-Host "Started $name"
}

Set-Location $repoRoot

if (-not $StartOnly) {
  Stop-DevProcesses
}

if (-not $StopOnly) {
  Start-Sleep -Seconds 1
  Start-DevProcess -name "web" -command "corepack pnpm dev:web"
  Start-DevProcess -name "worker" -command "corepack pnpm dev:worker"
  Write-Host "Web and worker started."
} else {
  Write-Host "Web and worker stopped."
}
