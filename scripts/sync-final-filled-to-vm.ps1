# Перенос всей папки public/uploads/final-filled/ на ВМ (doors, ручки, наличники и т.д.).
# Запуск: .\scripts\sync-final-filled-to-vm.ps1
# Требует: 1002DOORS_SSH_KEY, 1002DOORS_STAGING_HOST (по умолчанию ubuntu@89.169.181.191)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path $PSScriptRoot -Parent
$FinalFilled = Join-Path $ScriptDir "public\uploads\final-filled"
if (-not (Test-Path $FinalFilled)) {
    Write-Host "Папка не найдена: $FinalFilled" -ForegroundColor Red
    exit 1
}

& (Join-Path $PSScriptRoot "sync-uploads-to-vm.ps1") -Subfolder "final-filled"
