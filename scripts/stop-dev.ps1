param()

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$composeFile = Join-Path $repoRoot "docker/compose.yaml"
$stopLocalScript = Join-Path $PSScriptRoot "restart-web-worker.ps1"

Set-Location $repoRoot

Write-Host "Stopping local web/worker..."
& powershell -ExecutionPolicy Bypass -File $stopLocalScript -StopOnly
if ($LASTEXITCODE -ne 0) {
  throw "Failed to stop local web/worker"
}

Write-Host "Stopping Docker dependencies..."
& docker compose -f $composeFile down
if ($LASTEXITCODE -ne 0) {
  throw "docker compose down failed with exit code $LASTEXITCODE"
}

Write-Host "Stopped web, worker, and Docker dependencies."
