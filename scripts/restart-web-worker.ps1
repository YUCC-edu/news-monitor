$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Stop-DevProcesses {
  $patterns = @(
    "pnpm\s+dev:web",
    "pnpm\s+--filter\s+@news/web\s+dev",
    "pnpm\s+dev:worker",
    "pnpm\s+--filter\s+@news/worker\s+dev"
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
  $arg = "-NoExit -Command `"Set-Location '$repoRoot'; $command`""
  Start-Process powershell -ArgumentList $arg | Out-Null
  Write-Host "Started $name"
}

Set-Location $repoRoot
Stop-DevProcesses
Start-Sleep -Seconds 1
Start-DevProcess -name "web" -command "pnpm dev:web"
Start-DevProcess -name "worker" -command "pnpm dev:worker"
Write-Host "Restart completed."
