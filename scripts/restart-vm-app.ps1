# Перезапуск production на ВМ: systemd (domeo-standalone) или fallback — освободить 3000 и node server.js.
# Для режима dev на ВМ: .\scripts\stop-vm-production.ps1; .\scripts\start-vm-dev.ps1
# Запуск: .\scripts\restart-vm-app.ps1
# Важно: на ВМ должна быть уже развёрнута production-сборка (.\scripts\deploy-standalone-to-vm.ps1), иначе server.js упадёт с "no production build".

$ErrorActionPreference = "Stop"
$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
$RemotePath = if ($env:1002DOORS_STAGING_REMOTE_PATH) { $env:1002DOORS_STAGING_REMOTE_PATH } else { "~/domeo-app" }
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ConnectTimeout=15")

Write-Host "Restarting production on VM (systemd or node server.js)..." -ForegroundColor Cyan
# Сначала systemd; если юнит не настроен — освобождаем 3000, подставляем .env и запускаем node server.js
$restartCmd = "sudo systemctl restart domeo-standalone 2>/dev/null || (fuser -k 3000/tcp 2>/dev/null; true; sleep 2; cd $RemotePath && mkdir -p logs && NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 nohup node server.js >> logs/server.log 2>&1 &)"
& ssh -i $KeyPath @SshOpts $StagingHost $restartCmd 2>&1 | Out-Null
Start-Sleep -Seconds 4
Write-Host "Done. Check: ssh $StagingHost 'tail -30 $RemotePath/logs/server.log' or: sudo systemctl status domeo-standalone" -ForegroundColor Green
