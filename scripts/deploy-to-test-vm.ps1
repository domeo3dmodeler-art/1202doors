# Деплой только кода приложения на тестовую ВМ 178.154.244.83.
# По умолчанию использует rsync — передаёт только изменённые файлы (быстро).
#
# Запуск:
#   .\scripts\deploy-to-test-vm.ps1              # сборка + rsync дельты
#   .\scripts\deploy-to-test-vm.ps1 -SkipBuild   # rsync без пересборки (если уже собрано)
#   .\scripts\deploy-to-test-vm.ps1 -NoRsync     # полный архив tar+scp (fallback)

param(
    [switch]$NoRsync,
    [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

. "$scriptDir\set-test-vm-env.ps1"

$splat = @{ AppOnly = $true }
if (-not $NoRsync)  { $splat.Rsync     = $true }
if ($SkipBuild)     { $splat.SkipBuild = $true }

& "$scriptDir\deploy-standalone-to-vm.ps1" @splat
