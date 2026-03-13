# Полный перенос локального проекта на тестовую ВМ: приложение + БД + фото.
# 1) Деплой приложения (сборка standalone, загрузка на ВМ, миграции).
# 2) Перенос локальной БД (дамп из .env.postgresql) и фото (public/uploads) на ВМ, restore и перезапуск.
#
# Требуется локально:
#   - PostgreSQL с полной БД, в .env.postgresql — DATABASE_URL.
#   - public/uploads с фото (если не указать -SkipPhotos).
#   - Тестовая ВМ уже один раз настроена: .\scripts\set-test-vm-env.ps1 и .\scripts\setup-new-vm.ps1
#
# Запуск:
#   .\scripts\set-test-vm-env.ps1
#   .\scripts\transfer-full-local-to-test-vm.ps1
#
# Только приложение (без перезаливки БД и фото): сначала этот скрипт, потом для обновления только кода — .\scripts\deploy-standalone-to-vm.ps1 -AppOnly

param([switch]$SkipPhotos = $false, [switch]$SkipDeploy = $false)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path $MyInvocation.MyCommand.Path -Parent

# Цель — тестовая ВМ
if (-not $env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST = "ubuntu@130.193.62.116" }
if (-not $env:1002DOORS_SSH_KEY)      { $env:1002DOORS_SSH_KEY      = "C:\Users\petr2\testdoors\ssh-key-1773299302859\ssh-key-1773299302859" }
$env:1002DOORS_REMOTE_APP_PATH = "~/domeo-app"

if (-not (Test-Path $env:1002DOORS_SSH_KEY)) {
    Write-Host "Test VM SSH key not found. Run: .\scripts\set-test-vm-env.ps1" -ForegroundColor Red
    exit 1
}

$hostOnly = if ($env:1002DOORS_STAGING_HOST -match '@') { $env:1002DOORS_STAGING_HOST.Split('@')[1] } else { $env:1002DOORS_STAGING_HOST }
Write-Host "Full transfer: local project + DB + photos -> Test VM ($hostOnly)" -ForegroundColor Cyan

# 1) Деплой приложения (код + public в составе артефакта)
if (-not $SkipDeploy) {
    Write-Host "`n=== 1/2 Deploy application (build + upload) ===" -ForegroundColor Yellow
    & "$scriptDir\deploy-standalone-to-vm.ps1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Deploy failed. Fix errors and run again, or use -SkipDeploy if app is already on VM." -ForegroundColor Red
        exit $LASTEXITCODE
    }
} else {
    Write-Host "`n=== 1/2 SkipDeploy: skipping application deploy ===" -ForegroundColor Gray
}

# 2) БД и фото с локальной машины
Write-Host "`n=== 2/2 Sync local DB + uploads to test VM ===" -ForegroundColor Yellow
& "$scriptDir\sync-local-to-test-vm.ps1" @(if ($SkipPhotos) { "-SkipPhotos" })
if ($LASTEXITCODE -ne 0) {
    Write-Host "Sync DB/uploads failed. Check .env.postgresql and pg_dump." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "`nFull transfer done. Test VM: http://${hostOnly}:3000" -ForegroundColor Green
