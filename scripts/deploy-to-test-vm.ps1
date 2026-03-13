# Деплой только кода приложения на тестовую ВМ 130.193.62.116.
# Режим: разработка локально → деплой на тестовую ВМ.
# Запуск: .\scripts\deploy-to-test-vm.ps1
# Доп. параметры передаются в deploy-standalone-to-vm.ps1 (напр. -SkipBuild).

$ErrorActionPreference = 'Stop'
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir

. "$scriptDir\set-test-vm-env.ps1"
& "$scriptDir\deploy-standalone-to-vm.ps1" -AppOnly @args
