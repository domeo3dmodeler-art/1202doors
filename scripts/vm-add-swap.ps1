# Добавляет постоянный swap 1G на ВМ. Запуск: .\scripts\vm-add-swap.ps1
$ErrorActionPreference = "Stop"
$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1773410153319\ssh-key-1773410153319" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@178.154.244.83" }
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ConnectTimeout=30")

$swapCmd = 'if [ -f /swapfile ]; then echo "Swap file exists"; sudo swapon /swapfile 2>/dev/null; free -h; exit 0; fi; sudo fallocate -l 1G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=1024 status=progress 2>/dev/null; sudo chmod 600 /swapfile; sudo mkswap /swapfile; sudo swapon /swapfile; grep -q /swapfile /etc/fstab || echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab; free -h'
Write-Host "Adding 1G swap on VM..." -ForegroundColor Cyan
& ssh -i $KeyPath @SshOpts $StagingHost $swapCmd
if ($LASTEXITCODE -eq 0) { Write-Host "Done. Swap is persistent (in /etc/fstab)." -ForegroundColor Green } else { Write-Host "Failed." -ForegroundColor Red; exit 1 }
