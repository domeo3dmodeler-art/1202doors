# Останавливает production на ВМ: systemd-юнит domeo-standalone и любой процесс на порту 3000.
# Нужно перед запуском next dev, иначе порт занят или systemd перезапустит node server.js.
#
# Запуск: .\scripts\stop-vm-production.ps1
# Env: 1002DOORS_SSH_KEY, 1002DOORS_STAGING_HOST

$ErrorActionPreference = "Stop"
$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ConnectTimeout=15")

Write-Host "Stopping production on VM (systemd + port 3000)..." -ForegroundColor Cyan
$stopCmd = "sudo systemctl stop domeo-standalone 2>/dev/null; true; sleep 2; fuser -k 3000/tcp 2>/dev/null; true; sleep 1"
& ssh -i $KeyPath @SshOpts $StagingHost $stopCmd 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Production stopped. Port 3000 is free for next dev." -ForegroundColor Green
} else {
    Write-Host "SSH failed. On VM run: sudo systemctl stop domeo-standalone; fuser -k 3000/tcp" -ForegroundColor Yellow
}
