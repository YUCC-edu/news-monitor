param(
  [string]$Version = "local"
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$distDir = Join-Path $repoRoot "dist"
$stageDir = Join-Path $distDir "news-monitor-windows"
$zipPath = Join-Path $distDir ("news-monitor-windows-{0}.zip" -f $Version)

Set-Location $repoRoot

if (Test-Path $stageDir) {
  Remove-Item -LiteralPath $stageDir -Recurse -Force
}
New-Item -ItemType Directory -Path $distDir -Force | Out-Null
New-Item -ItemType Directory -Path $stageDir | Out-Null

$items = @(
  "apps",
  "packages",
  "docker",
  "scripts",
  "docs",
  ".env.example",
  ".gitignore",
  ".node-version",
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "README.md",
  "News Monitor.cmd",
  "Stop News Monitor.cmd",
  "Diagnose News Monitor.cmd"
)

foreach ($item in $items) {
  $source = Join-Path $repoRoot $item
  if (-not (Test-Path $source)) {
    continue
  }
  $dest = Join-Path $stageDir $item
  if ((Get-Item $source).PSIsContainer) {
    Copy-Item -LiteralPath $source -Destination $dest -Recurse -Force
  } else {
    New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $source -Destination $dest -Force
  }
}

$removePatterns = @(
  "node_modules",
  ".next",
  "dist",
  ".turbo",
  ".vercel",
  "coverage",
  ".data",
  "backups"
)

foreach ($pattern in $removePatterns) {
  Get-ChildItem -LiteralPath $stageDir -Recurse -Force -Directory |
    Where-Object { $_.Name -eq $pattern } |
    Sort-Object FullName -Descending |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }
}

Get-ChildItem -LiteralPath $stageDir -Recurse -Force -File |
  Where-Object {
    $_.Name -in @(".env", ".env.local") -or
    $_.Name -like "*.tsbuildinfo" -or
    $_.Name -like "*.log"
  } |
  ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }

do {
  $emptyDirs = @(Get-ChildItem -LiteralPath $stageDir -Recurse -Force -Directory |
    Where-Object { -not (Get-ChildItem -LiteralPath $_.FullName -Force -ErrorAction SilentlyContinue) } |
    Sort-Object FullName -Descending)
  foreach ($dir in $emptyDirs) {
    Remove-Item -LiteralPath $dir.FullName -Force
  }
} while ($emptyDirs.Count -gt 0)

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Compress-Archive -Path (Join-Path $stageDir "*") -DestinationPath $zipPath -Force

Write-Host "Created $zipPath" -ForegroundColor Green
Write-Host "Users can unzip it, start Docker Desktop, then double-click News Monitor.cmd."
