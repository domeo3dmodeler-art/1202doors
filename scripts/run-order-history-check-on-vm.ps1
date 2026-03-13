# Запуск проверки истории заказов на ВМ (скрипт vm-order-history-check.sh).
# Требуется: 1002DOORS_SSH_KEY, 1002DOORS_STAGING_HOST (по умолчанию ubuntu@89.169.181.191).
# Запуск: .\scripts\run-order-history-check-on-vm.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
$RemotePath = if ($env:1002DOORS_STAGING_REMOTE_PATH) { $env:1002DOORS_STAGING_REMOTE_PATH } else { "~/domeo-app" }
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ConnectTimeout=15")

$ScriptPath = Join-Path $ProjectRoot "scripts\vm-order-history-check.sh"
if (-not (Test-Path $ScriptPath)) {
    Write-Host "Скрипт не найден: $ScriptPath" -ForegroundColor Red
    exit 1
}

Write-Host "Запуск проверки заказов на ВМ: $StagingHost" -ForegroundColor Cyan
Write-Host "Передаём скрипт через stdin (bash -s)..." -ForegroundColor Yellow

Get-Content $ScriptPath -Raw | ssh -i $KeyPath $SshOpts $StagingHost "cd $RemotePath && bash -s"
Write-Host "Готово." -ForegroundColor Green
