# Перезапуск приложения на ВМ: освободить порт 3000, запустить node server.js в ~/domeo-app.
# Запуск: .\scripts\restart-vm-app.ps1

$ErrorActionPreference = "Stop"
$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
$RemotePath = if ($env:1002DOORS_STAGING_REMOTE_PATH) { $env:1002DOORS_STAGING_REMOTE_PATH } else { "~/domeo-app" }
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ConnectTimeout=15")

Write-Host "Restarting app on VM (free 3000, start server.js)..." -ForegroundColor Cyan
& ssh -i $KeyPath @SshOpts $StagingHost "cd $RemotePath && fuser -k 3000/tcp 2>/dev/null; true"
Start-Sleep -Seconds 2
& ssh -i $KeyPath @SshOpts $StagingHost "cd $RemotePath && mkdir -p logs && nohup node server.js >> logs/server.log 2>&1 &"
Start-Sleep -Seconds 4
Write-Host "Done. Check: ssh $StagingHost 'tail -20 $RemotePath/logs/server.log'" -ForegroundColor Green
