# Проверка наличия папки с фото товаров на ВМ (public/uploads/final-filled/doors).
# Запуск: .\scripts\check-vm-uploads.ps1

$ErrorActionPreference = "Stop"
$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
$RemotePath = if ($env:1002DOORS_STAGING_REMOTE_PATH) { $env:1002DOORS_STAGING_REMOTE_PATH } else { "~/domeo-app" }
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=15")

$checkCmd = "if [ -d $RemotePath/public/uploads/final-filled/doors ]; then find $RemotePath/public/uploads/final-filled/doors -maxdepth 1 -type f | wc -l; else echo 0; fi"
$out = & ssh -i $KeyPath @SshOpts $StagingHost $checkCmd 2>&1
$count = ($out | Select-Object -Last 1) -replace '\s', ''
Write-Host "On VM: $RemotePath/public/uploads/final-filled/doors -> $count files" -ForegroundColor $(if ([int]$count -gt 0) { "Green" } else { "Red" })
if ([int]$count -eq 0) {
    Write-Host "Run: .\scripts\sync-uploads-to-vm.ps1" -ForegroundColor Yellow
    exit 1
}
exit 0
