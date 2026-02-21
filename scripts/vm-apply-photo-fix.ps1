# Применение правок фото на ВМ: деплой приложения, Nginx, синхронизация uploads.
# Запуск: .\scripts\vm-apply-photo-fix.ps1
# Опции: -SkipBuild — не собирать, использовать существующий .next/standalone (если уже собран).
# Требуется: 1002DOORS_SSH_KEY, 1002DOORS_STAGING_HOST (по умолчанию ubuntu@89.169.181.191)

param([switch]$SkipBuild = $false)
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) { $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..") }
Push-Location $ProjectRoot

try {
    Write-Host "`n=== 1/3 Деплой приложения на ВМ (-AppOnly, uploads на ВМ не трогаем) ===" -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "deploy-standalone-to-vm.ps1") -AppOnly @(if ($SkipBuild) { "-SkipBuild" } else { })
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Деплой завершился с ошибкой." -ForegroundColor Red
        exit $LASTEXITCODE
    }

    Write-Host "`n=== 2/3 Применение конфига Nginx (таймауты 60s для /uploads/) ===" -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "apply-nginx-to-vm.ps1")
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Применение Nginx завершилось с ошибкой." -ForegroundColor Red
        exit $LASTEXITCODE
    }

    Write-Host ("`n=== 3/3 Синхронизация фото " + "public/uploads -> VM" + " ===") -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "sync-uploads-to-vm.ps1")
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Синхронизация uploads завершилась с ошибкой." -ForegroundColor Red
        exit $LASTEXITCODE
    }

    Write-Host "`nГотово. Проверьте сайт на ВМ." -ForegroundColor Green
} finally {
    Pop-Location
}
