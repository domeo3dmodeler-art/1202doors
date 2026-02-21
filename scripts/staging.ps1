# Синхронизировать код с ВМ и запустить next dev. Один раз в начале сессии.
# Требуется rsync (Git for Windows). Правки потом: push-one-file-to-vm.ps1 путь — мгновенно.
#
# Запуск: .\scripts\staging.ps1

$ErrorActionPreference = "Stop"
$ScriptDir = $PSScriptRoot
& (Join-Path $ScriptDir "sync-to-vm.ps1")
if ($LASTEXITCODE -ne 0) { exit 1 }
& (Join-Path $ScriptDir "start-vm-dev.ps1")
Write-Host "Правка кода локально -> .\scripts\push-one-file-to-vm.ps1 путь\к\файлу" -ForegroundColor Cyan
