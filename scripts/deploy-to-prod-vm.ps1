# Деплой только кода приложения на рабочую ВМ 158.160.69.237.
# По умолчанию использует rsync — передаёт только изменённые файлы (быстро).
# .env и public/uploads на рабочей ВМ НЕ затрагиваются.
# Пользователи, документы, заказы — НЕ изменяются.
#
# Запуск:
#   .\scripts\deploy-to-prod-vm.ps1              # сборка + rsync дельты
#   .\scripts\deploy-to-prod-vm.ps1 -SkipBuild   # rsync без пересборки (если уже собрано)
#   .\scripts\deploy-to-prod-vm.ps1 -NoRsync     # полный архив tar+scp (fallback)
#   .\scripts\deploy-to-prod-vm.ps1 -Force        # без подтверждения

param(
    [switch]$NoRsync,
    [switch]$SkipBuild,
    [switch]$Force
)
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $Force) {
    Write-Host ""
    Write-Host "=== ДЕПЛОЙ НА РАБОЧУЮ ВМ (PRODUCTION) ===" -ForegroundColor Red
    Write-Host "Цель: 158.160.69.237" -ForegroundColor Yellow
    Write-Host ".env и public/uploads — не затрагиваются." -ForegroundColor Gray
    Write-Host ""
    $confirm = Read-Host "Вы уверены? Введите 'yes' для подтверждения"
    if ($confirm -ne 'yes') {
        Write-Host "Отменено." -ForegroundColor Yellow
        exit 0
    }
}

. "$scriptDir\set-prod-vm-env.ps1"

$splat = @{ AppOnly = $true }
if (-not $NoRsync)  { $splat.Rsync     = $true }
if ($SkipBuild)     { $splat.SkipBuild = $true }

& "$scriptDir\deploy-standalone-to-vm.ps1" @splat
