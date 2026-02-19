# Применение настроек безопасности на ВМ: копирование и запуск vm-security-setup.sh по SSH.
# Запуск: .\scripts\apply-vm-security.ps1
# Опционально: .\scripts\apply-vm-security.ps1 -Deploy  (сначала деплой артефактом)
#
# Требуется: 1002DOORS_SSH_KEY, 1002DOORS_STAGING_HOST

param([switch]$Deploy = $false)
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent

$KeyPath = $env:1002DOORS_SSH_KEY
if (-not $KeyPath) { $KeyPath = "C:\Users\petr2\.ssh\ssh-key-1771510238528\ssh-key-1771510238528" }
$StagingHost = $env:1002DOORS_STAGING_HOST
if (-not $StagingHost) { $StagingHost = "ubuntu@158.160.13.144" }

$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ConnectTimeout=15")

if (-not (Test-Path $KeyPath)) {
    Write-Host "SSH key not found: $KeyPath. Set 1002DOORS_SSH_KEY." -ForegroundColor Red
    exit 1
}

if ($Deploy) {
    Write-Host "Deploying standalone artifact first..." -ForegroundColor Cyan
    Push-Location $ProjectRoot
    & $ProjectRoot\scripts\deploy-standalone-to-vm.ps1
    if ($LASTEXITCODE -ne 0) { Pop-Location; exit 1 }
    Pop-Location
}

$SetupScript = Join-Path $ProjectRoot "scripts\vm-security-setup.sh"
if (-not (Test-Path $SetupScript)) {
    Write-Host "Script not found: $SetupScript" -ForegroundColor Red
    exit 1
}

Write-Host "Copying vm-security-setup.sh to VM..." -ForegroundColor Yellow
& scp -i $KeyPath @SshOpts $SetupScript "${StagingHost}:~/vm-security-setup.sh"
if ($LASTEXITCODE -ne 0) {
    Write-Host "scp failed. Check SSH access (see docs/VM_SSH_AND_TRAFFIC_ISSUES.md)." -ForegroundColor Red
    exit 1
}

Write-Host "Running vm-security-setup.sh on VM (sudo)..." -ForegroundColor Yellow
& ssh -i $KeyPath @SshOpts $StagingHost "chmod +x ~/vm-security-setup.sh && sudo bash ~/vm-security-setup.sh"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Remote script failed. You can run manually: ssh ... 'sudo bash ~/vm-security-setup.sh'" -ForegroundColor Yellow
    exit 1
}

Write-Host "Done. Next: open port 80 and close port 3000 in Yandex Cloud security group. See docs/APPLY_SECURITY_ON_VM.md" -ForegroundColor Green
