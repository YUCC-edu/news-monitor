param()

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$composeFile = Join-Path $repoRoot "docker/compose.yaml"
$envPath = Join-Path $repoRoot ".env"
$stopLocalScript = Join-Path $PSScriptRoot "restart-web-worker.ps1"

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

Write-Host "Stopping local web/worker..."
& powershell -ExecutionPolicy Bypass -File $stopLocalScript -StopOnly
if ($LASTEXITCODE -ne 0) {
  throw "Failed to stop local web/worker"
}

Write-Host "Stopping Docker dependencies..."
Sync-ComposeHostPaths
& docker compose -f $composeFile down
if ($LASTEXITCODE -ne 0) {
  throw "docker compose down failed with exit code $LASTEXITCODE"
}

Write-Host "Stopped web, worker, and Docker dependencies."
