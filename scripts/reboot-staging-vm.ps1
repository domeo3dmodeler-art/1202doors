# Перезагрузка staging ВМ (158.160.72.3).
# Запуск: .\scripts\reboot-staging-vm.ps1
# Если по SSH не получается — перезагрузите ВМ через консоль Yandex Cloud (см. ниже).

$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771392782781\ssh-key-1771392782781" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@84.201.160.50" }
$Host = if ($StagingHost -match '@') { $StagingHost.Split('@')[1] } else { "158.160.72.3" }
$User = if ($StagingHost -match '@') { $StagingHost.Split('@')[0] } else { "petr" }

if (-not (Test-Path $KeyPath)) {
    Write-Host "SSH key not found: $KeyPath" -ForegroundColor Red
    exit 1
}

Write-Host "Sending reboot command to ${User}@${Host} (non-interactive SSH)..." -ForegroundColor Cyan
# Неинтерактивный шелл (--norc --noprofile), чтобы обойти проблему с .bashrc при «Connection closed»
$cmd = "bash --norc --noprofile -c 'sudo -n reboot 2>&1'"
$out = ssh -i $KeyPath -T -o ConnectTimeout=15 -o StrictHostKeyChecking=no "${User}@${Host}" $cmd 2>&1
$exitCode = $LASTEXITCODE

# При успешной перезагрузке сервер обрывает соединение — это нормально
if ($out -match "closed by remote host" -or $exitCode -ne 0) {
    Write-Host "Connection closed (VM may be rebooting). Wait 1-2 min, then check:" -ForegroundColor Yellow
    Write-Host "  ssh $StagingHost or http://${Host}:3000/api/health" -ForegroundColor Gray
} else {
    Write-Host $out
}

Write-Host ""
Write-Host "If VM did NOT reboot: use Yandex Cloud Console:" -ForegroundColor Cyan
Write-Host "  1. console.yandex.cloud -> Compute Cloud -> VM ($Host)" -ForegroundColor Gray
Write-Host "  2. Actions -> Reboot (or Stop, then Start)" -ForegroundColor Gray
Write-Host "  See: docs/SSH_VM_CONNECTION_CLOSED.md (Serial console)" -ForegroundColor Gray
