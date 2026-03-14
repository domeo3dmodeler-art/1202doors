# Sync public/uploads (final-filled, doors, handles) to VM. По умолчанию — тестовая ВМ 178.154.244.83
# Run: .\scripts\sync-uploads-to-vm.ps1  [ -Subfolder "final-filled/doors" ] [ -Rsync ] [ -ChunkFiles 50 ]
# -Rsync: sync via rsync (incremental; better for unstable network). Requires rsync in PATH.
# -ChunkFiles N: when using scp, upload subfolder in chunks of N files (smaller archives, fewer Broken pipe).
# Env: 1002DOORS_SSH_KEY, 1002DOORS_STAGING_HOST (default ubuntu@178.154.244.83)
# Source: 1002DOORS_UPLOADS_PATH if set, else public/uploads

param([string]$Subfolder = "", [switch]$Rsync = $false, [int]$ChunkFiles = 0)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) { $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..") }

$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "$env:USERPROFILE\.ssh\ssh-key-1773410153319\ssh-key-1773410153319" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@178.154.244.83" }
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

$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=60", "-o", "ConnectTimeout=30")

Write-Host ('Sync uploads to VM ' + $StagingHost + ' from: ' + $SourceDir + $(if ($Subfolder) { " ($Subfolder)" } else { "" }) + $(if ($Rsync) { " [Rsync]" } else { "" })) -ForegroundColor Cyan

if ($Rsync) {
    $rsyncExe = Get-Command rsync -ErrorAction SilentlyContinue
    $useWslRsync = $false
    if (-not $rsyncExe) {
        try { $null = wsl which rsync 2>$null; if ($LASTEXITCODE -eq 0) { $useWslRsync = $true } } catch { }
    }
    if (-not $rsyncExe -and -not $useWslRsync) {
        Write-Host "rsync not found in PATH and WSL. Install Git for Windows or WSL with rsync." -ForegroundColor Red
        exit 1
    }
    if ($Subfolder) {
        $rsyncSrcLocal = (Join-Path $SourceDir $Subfolder).TrimEnd("\").Replace("\", "/") + "/"
        $RemoteUploads = $RemoteAppPath + "/public/uploads/" + ($Subfolder -replace "/$", "") + "/"
    } else {
        $rsyncSrcLocal = $SourceDir.Replace("\", "/") + "/"
        $RemoteUploads = $RemoteAppPath + "/public/uploads/"
    }
    if ($useWslRsync) {
        if ($rsyncSrcLocal -match '^([A-Za-z]):(.+)$') {
            $rsyncSrc = "/mnt/$($Matches[1].ToLower())/" + $Matches[2].TrimStart('/').TrimStart('\').Replace("\", "/") + "/"
        } else { $rsyncSrc = $rsyncSrcLocal }
        $keyWsl = $KeyPath.Replace("\", "/")
        if ($keyWsl -match '^([A-Za-z]):(.+)$') {
            $keyWsl = "/mnt/$($Matches[1].ToLower())/" + $Matches[2].TrimStart('/').TrimStart("\").Replace("\", "/")
        }
        $wslKeyTmp = '/tmp/domeo-sync-key-' + [System.IO.Path]::GetFileName($KeyPath)
        wsl bash -c "cp '$keyWsl' '$wslKeyTmp' && chmod 600 '$wslKeyTmp'" 2>$null
        $sshCmd = "ssh -i $wslKeyTmp -o StrictHostKeyChecking=no -o ServerAliveInterval=15 -o ConnectTimeout=30"
        Write-Host "Rsync (WSL): $rsyncSrc -> ${StagingHost}:$RemoteUploads" -ForegroundColor Yellow
        & wsl rsync -avz --progress -e $sshCmd "$rsyncSrc" "${StagingHost}:$RemoteUploads" 2>&1
        wsl rm -f $wslKeyTmp 2>$null
    } else {
        $sshCmd = "ssh -i `"$KeyPath`" $($SshOpts -join ' ')"
        Write-Host "Rsync: $rsyncSrcLocal -> ${StagingHost}:$RemoteUploads" -ForegroundColor Yellow
        & $rsyncExe.Source -avz --progress -e $sshCmd "$rsyncSrcLocal" "${StagingHost}:$RemoteUploads" 2>&1
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host "rsync failed (exit $LASTEXITCODE)." -ForegroundColor Red
        exit 1
    }
    Write-Host ('Done. Uploads synced to ' + $StagingHost + ' ' + $RemoteUploads) -ForegroundColor Green
    exit 0
}

if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null }

$ScpDest = $StagingHost + ':' + $RemoteAppPath + '/uploads_staging.tar.gz'
$ExtractCmd = 'mkdir -p ' + $RemoteAppPath + '/public/uploads && cd ' + $RemoteAppPath + '/public/uploads && tar -xzf ' + $RemoteAppPath + '/uploads_staging.tar.gz'

# Chunked upload: for a subfolder, upload in small archives to avoid Broken pipe
if ($ChunkFiles -gt 0 -and $Subfolder) {
    $subPath = Join-Path $SourceDir $Subfolder
    if (-not (Test-Path $subPath)) { Write-Host "Subfolder not found: $subPath" -ForegroundColor Red; exit 1 }
    $allFiles = @(Get-ChildItem -Path $subPath -File -Recurse | ForEach-Object {
        $_.FullName.Replace($SourceDir, '').TrimStart('\').Replace('\', '/')
    })
    $total = $allFiles.Count
    $numChunks = [math]::Ceiling($total / $ChunkFiles)
    Write-Host "Chunked upload: $total files in $numChunks chunks (max $ChunkFiles per chunk)" -ForegroundColor Cyan
    Push-Location $ProjectRoot
    for ($c = 0; $c -lt $numChunks; $c++) {
        $chunk = $allFiles[($c * $ChunkFiles)..([math]::Min(($c + 1) * $ChunkFiles - 1, $total - 1))]
        $chunkArchive = Join-Path $OutputDir "uploads_chunk_$c.tar.gz"
        & tar -czf $chunkArchive -C $SourceDir @chunk 2>&1
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $chunkArchive)) {
            Write-Host "tar chunk $c failed." -ForegroundColor Red
            Pop-Location
            exit 1
        }
        $sizeMB = [math]::Round((Get-Item $chunkArchive).Length / 1MB, 1)
        Write-Host ("Chunk $($c+1)/$numChunks ($($chunk.Count) files, $sizeMB MB)...") -ForegroundColor Yellow
        $scpOk = $false
        for ($retry = 1; $retry -le 3; $retry++) {
            & scp -i $KeyPath @SshOpts $chunkArchive $ScpDest
            if ($LASTEXITCODE -eq 0) { $scpOk = $true; break }
            Start-Sleep -Seconds 5
        }
        if (-not $scpOk) {
            Write-Host "scp chunk $c failed." -ForegroundColor Red
            Remove-Item $chunkArchive -Force -ErrorAction SilentlyContinue
            Pop-Location
            exit 1
        }
        & ssh -i $KeyPath @SshOpts $StagingHost $ExtractCmd
        Remove-Item $chunkArchive -Force -ErrorAction SilentlyContinue
    }
    & ssh -i $KeyPath @SshOpts $StagingHost ('rm -f ' + $RemoteAppPath + '/uploads_staging.tar.gz')
    Pop-Location
    Write-Host ('Done. Uploads synced to ' + $StagingHost + ' ' + $RemoteAppPath + '/public/uploads') -ForegroundColor Green
    exit 0
}

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
    $scpOk = $false
    for ($retry = 1; $retry -le 3; $retry++) {
        & scp -i $KeyPath @SshOpts $ArchivePath $ScpDest
        if ($LASTEXITCODE -eq 0) { $scpOk = $true; break }
        Write-Host ('scp attempt ' + $retry + ' failed, retrying in 5s...') -ForegroundColor Yellow
        Start-Sleep -Seconds 5
    }
    if (-not $scpOk) {
        Write-Host 'scp failed after 3 attempts. Try -Subfolder final-filled/doors -ChunkFiles 50 or -Rsync (requires rsync in PATH).' -ForegroundColor Red
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
