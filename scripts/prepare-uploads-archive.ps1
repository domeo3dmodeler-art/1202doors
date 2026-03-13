# Собирает архив public/uploads в scripts/output/uploads_staging.tar.gz.
# Удобно, если нужно передать архив на ВМ вручную (без scp) или повторить sync без перепаковки.
# Запуск: .\scripts\prepare-uploads-archive.ps1  [ -Subfolder "final-filled/doors" ]

param([string]$Subfolder = "")

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$OutputDir = Join-Path $ProjectRoot "scripts\output"
$ArchivePath = Join-Path $OutputDir "uploads_staging.tar.gz"
$DefaultUploads = Join-Path $ProjectRoot "public\uploads"
$SourceDir = if ($env:1002DOORS_UPLOADS_PATH -and (Test-Path $env:1002DOORS_UPLOADS_PATH)) { $env:1002DOORS_UPLOADS_PATH } else { $DefaultUploads }

if (-not (Test-Path $SourceDir)) {
    Write-Host "Source not found: $SourceDir" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null }

$TarParent = if ($Subfolder) { $SourceDir } else { (Join-Path $ProjectRoot "public") }
$TarName = if ($Subfolder) { $Subfolder } else { "uploads" }

if ($Subfolder -and -not (Test-Path (Join-Path $SourceDir $Subfolder))) {
    Write-Host "Subfolder not found: $SourceDir\$Subfolder" -ForegroundColor Red
    exit 1
}

Write-Host "Packing $TarName -> $ArchivePath" -ForegroundColor Cyan
Push-Location $ProjectRoot
try {
    & tar -czf $ArchivePath -C $TarParent $TarName 2>&1
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $ArchivePath)) {
        Write-Host "tar failed." -ForegroundColor Red
        exit 1
    }
    $sizeMB = [math]::Round((Get-Item $ArchivePath).Length / 1MB, 1)
    Write-Host "Created $ArchivePath ($sizeMB MB). To sync: scp to VM then extract in ~/domeo-app/public/uploads" -ForegroundColor Green
} finally { Pop-Location }
