# Применение конфига Nginx (scripts/output/domeo-nginx.conf) на ВМ.
# Запуск: .\scripts\apply-nginx-to-vm.ps1
# Требуется: 1002DOORS_SSH_KEY, 1002DOORS_STAGING_HOST (по умолчанию ubuntu@89.169.181.191)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent

$KeyPath = $env:1002DOORS_SSH_KEY
if (-not $KeyPath) { $KeyPath = "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }
$StagingHost = $env:1002DOORS_STAGING_HOST
if (-not $StagingHost) { $StagingHost = "ubuntu@89.169.181.191" }

$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ConnectTimeout=15")

$NginxConf = Join-Path $ProjectRoot "scripts\output\domeo-nginx.conf"
if (-not (Test-Path $NginxConf)) {
    Write-Host "Config not found: $NginxConf" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $KeyPath)) {
    Write-Host "SSH key not found: $KeyPath. Set 1002DOORS_SSH_KEY." -ForegroundColor Red
    exit 1
}

Write-Host "Applying Nginx config to $StagingHost..." -ForegroundColor Cyan
& scp -i $KeyPath @SshOpts $NginxConf "${StagingHost}:~/domeo-nginx.conf"
if ($LASTEXITCODE -ne 0) {
    Write-Host "scp failed." -ForegroundColor Red
    exit 1
}
& ssh -i $KeyPath @SshOpts $StagingHost "sudo cp ~/domeo-nginx.conf /etc/nginx/sites-available/domeo && sudo nginx -t && sudo systemctl reload nginx"
if ($LASTEXITCODE -ne 0) {
    Write-Host "nginx -t or reload failed. Check on VM: sudo nginx -t" -ForegroundColor Red
    exit 1
}
Write-Host "Nginx config applied and reloaded." -ForegroundColor Green
