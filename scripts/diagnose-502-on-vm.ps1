# Диагностика 502 на ВМ: запуск vm-diagnose-502.sh по SSH, затем подсказка по перезапуску.
# Запуск: .\scripts\diagnose-502-on-vm.ps1
# Env: 1002DOORS_SSH_KEY, 1002DOORS_STAGING_HOST, 1002DOORS_STAGING_REMOTE_PATH

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
$RemotePath = if ($env:1002DOORS_STAGING_REMOTE_PATH) { $env:1002DOORS_STAGING_REMOTE_PATH } else { "~/domeo-app" }
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ConnectTimeout=15")

$ScriptPath = Join-Path $ProjectRoot "scripts\vm-diagnose-502.sh"
if (-not (Test-Path $ScriptPath)) {
    Write-Host "Не найден: $ScriptPath" -ForegroundColor Red
    exit 1
}

Write-Host "Запуск диагностики 502 на ВМ ($StagingHost)..." -ForegroundColor Cyan
Write-Host ""
Get-Content $ScriptPath -Raw | ssh -i $KeyPath @SshOpts $StagingHost "bash -s"
Write-Host ""
Write-Host "--- Что делать при 502 ---" -ForegroundColor Yellow
Write-Host "Если на порту 3000 ничего не слушает или процесс упал:" -ForegroundColor White
Write-Host "  Production: .\scripts\restart-vm-app.ps1" -ForegroundColor Cyan
Write-Host "  Или:        .\scripts\deploy-standalone-to-vm.ps1 -AppOnly" -ForegroundColor Cyan
Write-Host "  Dev на ВМ:  .\scripts\stop-vm-production.ps1; .\scripts\start-vm-dev.ps1" -ForegroundColor Cyan
Write-Host ""
