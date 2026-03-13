# Перенос полной БД и фото с рабочей ВМ (89.169.181.191) на тестовую (130.193.62.116).
# Товары, пользователи, заказы, фото товаров — всё копируется на тестовую ВМ.
#
# Запуск:
#   .\scripts\set-test-vm-env.ps1
#   .\scripts\sync-prod-to-test-vm.ps1
#
# Или вручную задать:
#   $env:1002DOORS_STAGING_HOST = "ubuntu@130.193.62.116"   # тестовая (куда копируем)
#   $env:1002DOORS_SSH_KEY = "C:\Users\petr2\testdoors\ssh-key-1773299302859\ssh-key-1773299302859"
#   $env:1002DOORS_PROD_HOST = "ubuntu@89.169.181.191"      # рабочая (откуда берём)
#   $env:1002DOORS_PROD_SSH_KEY = "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154"
#   .\scripts\sync-prod-to-test-vm.ps1

param([switch]$SkipPhotos = $false)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) { $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..") }

# Тестовая ВМ (назначение)
$TestHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@130.193.62.116" }
$TestKey = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\testdoors\ssh-key-1773299302859\ssh-key-1773299302859" }

# Рабочая ВМ (источник БД и фото)
$ProdHost = if ($env:1002DOORS_PROD_HOST) { $env:1002DOORS_PROD_HOST } else { "ubuntu@89.169.181.191" }
$ProdKey = if ($env:1002DOORS_PROD_SSH_KEY) { $env:1002DOORS_PROD_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }

$RemotePath = "~/domeo-app"
$OutputDir = Join-Path $ProjectRoot "scripts\output"
$DumpFile = Join-Path $OutputDir "prod_to_test.dump"
$UploadsArchive = Join-Path $OutputDir "prod_uploads.tar.gz"
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ConnectTimeout=30")

# Пароль БД на рабочей ВМ (такой же как в setup-new-vm)
$DbPass = "d0me0Stag1ngPg2025"

if (-not (Test-Path $ProdKey)) { Write-Host "Prod SSH key not found: $ProdKey. Set 1002DOORS_PROD_SSH_KEY." -ForegroundColor Red; exit 1 }
if (-not (Test-Path $TestKey)) { Write-Host "Test VM SSH key not found: $TestKey. Run .\scripts\set-test-vm-env.ps1" -ForegroundColor Red; exit 1 }
if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null }

Write-Host "Copying full DB + uploads from PROD ($ProdHost) to TEST ($TestHost)..." -ForegroundColor Cyan

# 1) Дамп БД на рабочей ВМ во временный файл, затем scp к нам
Write-Host "1. Dumping database on prod (remote file)..." -ForegroundColor Yellow
$remoteDump = "/tmp/domeo_prod_to_test_$(Get-Date -Format 'yyyyMMddHHmmss').dump"
& ssh -i $ProdKey @SshOpts $ProdHost "PGPASSWORD='$DbPass' pg_dump -h localhost -U domeo_user -d domeo -F c -f $remoteDump 2>/dev/null && ls -la $remoteDump" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "   pg_dump on prod failed. Check PostgreSQL and password (d0me0Stag1ngPg2025)." -ForegroundColor Red
    exit 1
}
Write-Host "   Downloading dump from prod..." -ForegroundColor Gray
& scp -i $ProdKey @SshOpts "${ProdHost}:${remoteDump}" $DumpFile 2>&1
& ssh -i $ProdKey @SshOpts $ProdHost "rm -f $remoteDump" 2>$null
if (-not (Test-Path $DumpFile) -or (Get-Item $DumpFile).Length -lt 1000) {
    Write-Host "   Download failed or dump empty." -ForegroundColor Red
    exit 1
}
$dumpMb = [math]::Round((Get-Item $DumpFile).Length / 1MB, 2)
Write-Host "   Dump: $dumpMb MB" -ForegroundColor Gray

# 2) Архив фото на рабочей ВМ во временный файл, затем scp к нам (если не -SkipPhotos)
if (-not $SkipPhotos) {
    Write-Host "2. Archiving uploads on prod..." -ForegroundColor Yellow
    $remoteTar = "/tmp/domeo_uploads_$(Get-Date -Format 'yyyyMMddHHmmss').tar.gz"
    & ssh -i $ProdKey @SshOpts $ProdHost "cd $RemotePath 2>/dev/null && test -d public/uploads && tar -czf $remoteTar public/uploads && ls -la $remoteTar || echo NO" 2>&1
    $tarExists = & ssh -i $ProdKey @SshOpts $ProdHost "test -f $remoteTar && echo YES" 2>$null
    if ($tarExists -match "YES") {
        & scp -i $ProdKey @SshOpts "${ProdHost}:${remoteTar}" $UploadsArchive 2>&1
        & ssh -i $ProdKey @SshOpts $ProdHost "rm -f $remoteTar" 2>$null
        if (Test-Path $UploadsArchive) {
            $archMb = [math]::Round((Get-Item $UploadsArchive).Length / 1MB, 2)
            Write-Host "   Uploads archive: $archMb MB" -ForegroundColor Gray
        }
    } else {
        Write-Host "   No uploads on prod. Skipping." -ForegroundColor Yellow
    }
} else {
    Write-Host "2. SkipPhotos: skipping uploads." -ForegroundColor Gray
}

# 3) Загрузить дамп на тестовую ВМ
Write-Host "3. Uploading dump to test VM..." -ForegroundColor Yellow
& scp -i $TestKey @SshOpts $DumpFile "${TestHost}:${RemotePath}/full_backup.dump" 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "   scp dump failed." -ForegroundColor Red; exit 1 }

# 4) Загрузить архив фото на тестовую ВМ (если есть)
if (-not $SkipPhotos -and (Test-Path $UploadsArchive)) {
    Write-Host "4. Uploading uploads to test VM..." -ForegroundColor Yellow
    & scp -i $TestKey @SshOpts $UploadsArchive "${TestHost}:${RemotePath}/uploads_staging.tar.gz" 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Host "   scp uploads failed." -ForegroundColor Red }
}

# 5) На тестовой ВМ: восстановить БД, распаковать фото, перезапустить приложение
Write-Host "5. Restoring DB and uploads on test VM..." -ForegroundColor Yellow
$remoteScript = @"
set -e
cd $RemotePath
PGPASSWORD='$DbPass'
echo 'Restoring database...'
pg_restore -h localhost -U domeo_user -d domeo --no-owner --no-acl --clean --if-exists full_backup.dump 2>/dev/null || true
pg_restore -h localhost -U domeo_user -d domeo --no-owner --no-acl full_backup.dump 2>&1 | tail -3
rm -f full_backup.dump
echo 'Database restored.'
if [ -f uploads_staging.tar.gz ]; then
  echo 'Extracting uploads...'
  mkdir -p public
  tar -xzf uploads_staging.tar.gz -C .
  rm -f uploads_staging.tar.gz
  echo 'Uploads extracted.'
fi
echo 'Restarting app...'
sudo systemctl restart domeo-standalone 2>/dev/null || true
sleep 3
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health || echo '000'
echo ''
echo 'Done.'
"@
$remoteScript = $remoteScript -replace "`r`n", "`n"
& ssh -i $TestKey @SshOpts $TestHost $remoteScript 2>&1

# Очистка локальных временных файлов
Remove-Item $DumpFile -Force -ErrorAction SilentlyContinue
if (Test-Path $UploadsArchive) { Remove-Item $UploadsArchive -Force -ErrorAction SilentlyContinue }

$TestIp = if ($TestHost -match '@') { $TestHost.Split('@')[1] } else { $TestHost }
Write-Host "Sync finished. Test VM: http://${TestIp}:3000" -ForegroundColor Green
