# Запуск next dev на ВМ (порт 3000) для режима быстрых правок.
# После запуска используйте push-one-file-to-vm.ps1 — Next пересоберёт файл за секунды.
#
# Запуск: .\scripts\start-vm-dev.ps1
# Env: 1002DOORS_SSH_KEY, 1002DOORS_STAGING_HOST, 1002DOORS_STAGING_REMOTE_PATH

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
$RemotePath = if ($env:1002DOORS_STAGING_REMOTE_PATH) { $env:1002DOORS_STAGING_REMOTE_PATH } else { "~/domeo-app" }
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ConnectTimeout=15")

Write-Host "Starting next dev in background on VM..." -ForegroundColor Cyan
$startCmd = "cd $RemotePath && mkdir -p logs && nohup npx next dev -p 3000 -H 0.0.0.0 >> logs/next-dev.log 2>&1 &"
& ssh -i $KeyPath @SshOpts $StagingHost $startCmd 2>&1 | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Command sent. Check on VM: tail -f $RemotePath/logs/next-dev.log" -ForegroundColor Green
    Write-Host "Then use: .\scripts\push-one-file-to-vm.ps1 <path>" -ForegroundColor Cyan
} else {
    Write-Host "SSH failed. Run next dev manually on VM: cd $RemotePath && npm run dev" -ForegroundColor Yellow
}
