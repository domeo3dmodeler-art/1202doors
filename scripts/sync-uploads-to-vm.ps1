# Sync public/uploads (final-filled, doors, handles) to VM 89.169.181.191
# Run: .\scripts\sync-uploads-to-vm.ps1  [ -Subfolder "final-filled/doors" for smaller upload ]
# Env: 1002DOORS_SSH_KEY, 1002DOORS_STAGING_HOST (default ubuntu@89.169.181.191)
# Source: 1002DOORS_UPLOADS_PATH if set, else public/uploads

param([string]$Subfolder = "")

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) { $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..") }

$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "$env:USERPROFILE\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
$RemoteAppPath = "~/domeo-app"
$OutputDir = Join-Path $ProjectRoot "scripts\output"
$ArchivePath = Join-Path $OutputDir "uploads_staging.tar.gz"

$UploadsFromEnv = $env:1002DOORS_UPLOADS_PATH
$DefaultUploads = Join-Path $ProjectRoot "public\uploads"

if ($UploadsFromEnv -and (Test-Path $UploadsFromEnv)) {
    $SourceDir = $UploadsFromEnv
    $TarParent = $SourceDir
    if ($Subfolder) {
        $TarName = $Subfolder
        $ExtractOnVm = 'mkdir -p ' + $RemoteAppPath + '/public/uploads && cd ' + $RemoteAppPath + '/public/uploads && tar -xzf ' + $RemoteAppPath + '/uploads_staging.tar.gz'
    } else {
        $TarParent = Split-Path $SourceDir -Parent
        $TarName = Split-Path $SourceDir -Leaf
        $ExtractOnVm = 'mkdir -p ' + $RemoteAppPath + '/public/uploads && cd ' + $RemoteAppPath + '/public/uploads && tar -xzf ' + $RemoteAppPath + '/uploads_staging.tar.gz'
    }
} else {
    $SourceDir = $DefaultUploads
    if (-not (Test-Path $SourceDir)) {
        Write-Host "Source folder not found: $SourceDir. Set 1002DOORS_UPLOADS_PATH or add files to public/uploads." -ForegroundColor Red
        exit 1
    }
    $TarParent = if ($Subfolder) { $SourceDir } else { (Join-Path $ProjectRoot "public") }
    $TarName = if ($Subfolder) { $Subfolder } else { "uploads" }
    if ($Subfolder) {
        $ExtractOnVm = 'mkdir -p ' + $RemoteAppPath + '/public/uploads && cd ' + $RemoteAppPath + '/public/uploads && tar -xzf ' + $RemoteAppPath + '/uploads_staging.tar.gz'
    } else {
        $ExtractOnVm = 'mkdir -p ' + $RemoteAppPath + '/public && cd ' + $RemoteAppPath + '/public && tar -xzf ' + $RemoteAppPath + '/uploads_staging.tar.gz'
    }
}

if ($Subfolder -and -not (Test-Path (Join-Path $TarParent $TarName))) {
    Write-Host "Subfolder not found: $TarParent\$TarName" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $KeyPath)) {
    Write-Host "SSH key not found: $KeyPath. Set 1002DOORS_SSH_KEY." -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null }

$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=60", "-o", "ConnectTimeout=30")

Write-Host ('Sync uploads to VM ' + $StagingHost + ' from: ' + $SourceDir + $(if ($Subfolder) { " ($Subfolder)" } else { "" })) -ForegroundColor Cyan
Write-Host 'Packing...' -ForegroundColor Yellow
Push-Location $ProjectRoot
try {
    & tar -czf $ArchivePath -C $TarParent $TarName 2>&1
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $ArchivePath)) {
        Write-Host 'tar failed.' -ForegroundColor Red
        exit 1
    }
    $sizeMB = [math]::Round((Get-Item $ArchivePath).Length / 1MB, 1)
    Write-Host ('Uploading archive ' + $sizeMB + ' MB...') -ForegroundColor Yellow
    $ScpDest = $StagingHost + ':' + $RemoteAppPath + '/uploads_staging.tar.gz'
    $scpOk = $false
    for ($retry = 1; $retry -le 3; $retry++) {
        & scp -i $KeyPath @SshOpts $ArchivePath $ScpDest
        if ($LASTEXITCODE -eq 0) { $scpOk = $true; break }
        Write-Host ('scp attempt ' + $retry + ' failed, retrying in 5s...') -ForegroundColor Yellow
        Start-Sleep -Seconds 5
    }
    if (-not $scpOk) {
        Write-Host 'scp failed after 3 attempts. Try -Subfolder final-filled/doors for a smaller upload.' -ForegroundColor Red
        exit 1
    }
    Write-Host 'Extracting on VM...' -ForegroundColor Yellow
    & ssh -i $KeyPath @SshOpts $StagingHost $ExtractOnVm
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Extract on VM failed.' -ForegroundColor Red
        exit 1
    }
    & ssh -i $KeyPath @SshOpts $StagingHost ('rm -f ' + $RemoteAppPath + '/uploads_staging.tar.gz')
} finally {
    Pop-Location
    Remove-Item $ArchivePath -Force -ErrorAction SilentlyContinue
}
Write-Host ('Done. Uploads synced to ' + $StagingHost + ' ' + $RemoteAppPath + '/public/uploads') -ForegroundColor Green
