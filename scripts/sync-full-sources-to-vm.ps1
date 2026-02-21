# Синхронизация полного дерева исходников (app, lib, prisma, public, config) на ВМ.
# Не зависит от rsync: tar + scp + распаковка на ВМ. public/uploads в архив не входит — на ВМ не трогаем.
# После синхронизации на ВМ будет полный репо для next dev; затем npm install (при необходимости) и start-vm-dev.
#
# Запуск: .\scripts\sync-full-sources-to-vm.ps1
# Env: 1002DOORS_SSH_KEY, 1002DOORS_STAGING_HOST, 1002DOORS_STAGING_REMOTE_PATH

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) { $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..") }

$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
$RemotePath = if ($env:1002DOORS_STAGING_REMOTE_PATH) { $env:1002DOORS_STAGING_REMOTE_PATH } else { "~/domeo-app" }
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ConnectTimeout=15")

Write-Host "Syncing full sources to VM (tar + scp)..." -ForegroundColor Cyan

# 1) SSH
$sshTest = & ssh -i $KeyPath @SshOpts $StagingHost "echo OK" 2>&1
if ($LASTEXITCODE -ne 0 -or $sshTest -notmatch "OK") {
    Write-Host "SSH failed." -ForegroundColor Red
    exit 1
}

# 2) Create tar (app, lib, prisma, public, config). Exclude public/uploads to keep archive small (~tens MB).
$tarName = "domeo-sources.tar"
$tarPath = Join-Path $ProjectRoot $tarName

Push-Location $ProjectRoot
try {
    $items = @("app", "lib", "components", "hooks", "prisma", "public", "styles", "globals.css", "next.config.mjs", "tsconfig.json", "postcss.config.js", "tailwind.config.js", "middleware.ts", "package.json", "package-lock.json")
    $existing = $items | Where-Object { Test-Path $_ }
    if ($existing.Count -eq 0) {
        Write-Host "No source dirs found." -ForegroundColor Red
        exit 1
    }
    Write-Host "Packing: $($existing -join ', ') (excluding public/uploads)" -ForegroundColor Gray
    & tar -cf $tarName --exclude="public/uploads" $existing 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "tar failed." -ForegroundColor Red
        exit 1
    }
    $sizeMb = [math]::Round((Get-Item $tarPath).Length / 1MB, 2)
    Write-Host "Archive: $tarName ($sizeMb MB)" -ForegroundColor Gray
} finally {
    Pop-Location
}

# 3) scp to VM
$remoteTar = "$RemotePath/$tarName"
Write-Host "Uploading to ${StagingHost}:$remoteTar ..." -ForegroundColor Cyan
& scp -i $KeyPath @SshOpts $tarPath "${StagingHost}:$remoteTar" 2>&1
if ($LASTEXITCODE -ne 0) {
    Remove-Item $tarPath -ErrorAction SilentlyContinue
    Write-Host "scp failed." -ForegroundColor Red
    exit 1
}

# 4) Unpack on VM and remove archive
Write-Host "Unpacking on VM..." -ForegroundColor Cyan
& ssh -i $KeyPath @SshOpts $StagingHost "cd $RemotePath && tar xf $tarName && rm -f $tarName" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Unpack failed on VM." -ForegroundColor Red
    exit 1
}

Remove-Item $tarPath -ErrorAction SilentlyContinue
Write-Host "Done. Next: on VM run 'npm install' (if needed), then start next dev: .\scripts\start-vm-dev.ps1" -ForegroundColor Green
