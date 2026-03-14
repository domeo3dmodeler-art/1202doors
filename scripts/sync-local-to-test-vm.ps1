# Перенос локального проекта на тестовую ВМ: БД из локального PostgreSQL + фото из local public/uploads.
# Источник: локальная машина (дамп из .env.postgresql, архив из public/uploads).
# Назначение: тестовая ВМ 178.154.244.83 (~/domeo-app).
#
# Требуется:
#   - Локально: PostgreSQL с полной БД, в .env.postgresql указан DATABASE_URL.
#   - Локально: public/uploads с фото (или только БД: -SkipPhotos).
#   - Тестовая ВМ уже настроена (setup-new-vm.ps1) и приложение задеплоено.
#
# Запуск:
#   .\scripts\sync-local-to-test-vm.ps1
#   .\scripts\sync-local-to-test-vm.ps1 -SkipPhotos   # только БД

param([switch]$SkipPhotos = $false)

$ErrorActionPreference = "Stop"
# Целевая ВМ — тестовая; каталог на ней — ~/domeo-app (как после setup-new-vm)
if (-not $env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST = "ubuntu@178.154.244.83" }
if (-not $env:1002DOORS_SSH_KEY)      { $env:1002DOORS_SSH_KEY      = "C:\Users\petr2\.ssh\ssh-key-1773410153319\ssh-key-1773410153319" }
$env:1002DOORS_REMOTE_APP_PATH = "~/domeo-app"

$scriptDir = Split-Path $MyInvocation.MyCommand.Path -Parent
& "$scriptDir\sync-staging-full.ps1" @(if ($SkipPhotos) { "-SkipPhotos" })
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$hostOnly = if ($env:1002DOORS_STAGING_HOST -match '@') { $env:1002DOORS_STAGING_HOST.Split('@')[1] } else { $env:1002DOORS_STAGING_HOST }
Write-Host "Local -> Test VM done. Open http://${hostOnly}:3000" -ForegroundColor Green
