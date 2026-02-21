# Применение мер по снижению исходящего трафика на ВМ (122 ГБ и т.п.).
# Запуск: .\scripts\apply-vm-traffic-fix.ps1
#        .\scripts\apply-vm-traffic-fix.ps1 -MyIp "ваш.и.п"   # чтобы Fail2ban не банил ваш IP
#
# Требуется: 1002DOORS_SSH_KEY, 1002DOORS_STAGING_HOST (по умолчанию ubuntu@89.169.181.191)

param([string]$MyIp = "")
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent

$KeyPath = $env:1002DOORS_SSH_KEY
if (-not $KeyPath) { $KeyPath = "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }
$StagingHost = $env:1002DOORS_STAGING_HOST
if (-not $StagingHost) { $StagingHost = "ubuntu@89.169.181.191" }

$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ConnectTimeout=15")

if (-not (Test-Path $KeyPath)) {
    Write-Host "SSH key not found: $KeyPath. Set 1002DOORS_SSH_KEY." -ForegroundColor Red
    exit 1
}

$ReduceScript = Join-Path $ProjectRoot "scripts\vm-reduce-traffic.sh"
$HardeningScript = Join-Path $ProjectRoot "scripts\vm-hardening-attack.sh"
foreach ($s in $ReduceScript, $HardeningScript) {
    if (-not (Test-Path $s)) {
        Write-Host "Script not found: $s" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Target: $StagingHost" -ForegroundColor Cyan
if ($MyIp) { Write-Host "Your IP (ignore in Fail2ban): $MyIp" -ForegroundColor Gray }

# 1. Снижение трафика (snap/apt)
Write-Host "Copying and running vm-reduce-traffic.sh..." -ForegroundColor Yellow
& scp -i $KeyPath @SshOpts $ReduceScript "${StagingHost}:~/vm-reduce-traffic.sh"
if ($LASTEXITCODE -ne 0) {
    Write-Host "scp failed. Check SSH (e.g. Fail2ban could have banned your IP)." -ForegroundColor Red
    exit 1
}
& ssh -i $KeyPath @SshOpts $StagingHost "chmod +x ~/vm-reduce-traffic.sh && sudo bash ~/vm-reduce-traffic.sh"
if ($LASTEXITCODE -ne 0) {
    Write-Host "vm-reduce-traffic.sh failed." -ForegroundColor Yellow
    exit 1
}

# 2. Жёсткие лимиты Nginx + Fail2ban
Write-Host "Copying and running vm-hardening-attack.sh..." -ForegroundColor Yellow
& scp -i $KeyPath @SshOpts $HardeningScript "${StagingHost}:~/vm-hardening-attack.sh"
if ($LASTEXITCODE -ne 0) {
    Write-Host "scp failed." -ForegroundColor Red
    exit 1
}
$runHardening = "chmod +x ~/vm-hardening-attack.sh && sudo bash ~/vm-hardening-attack.sh"
if ($MyIp) {
    $runHardening = "chmod +x ~/vm-hardening-attack.sh && export MY_IP='$MyIp' && sudo -E bash ~/vm-hardening-attack.sh"
}
& ssh -i $KeyPath @SshOpts $StagingHost $runHardening
if ($LASTEXITCODE -ne 0) {
    Write-Host "vm-hardening-attack.sh failed. You can run on VM: MY_IP=your.ip sudo bash ~/vm-hardening-attack.sh" -ForegroundColor Yellow
    exit 1
}

Write-Host "Done." -ForegroundColor Green
Write-Host "Next: in Yandex Cloud security group allow only port 80 (and 22 only from your IP). See docs/VM_TRAFFIC_REDUCTION.md and docs/VM_158_160_10_126_DEPLOY.md" -ForegroundColor Gray
