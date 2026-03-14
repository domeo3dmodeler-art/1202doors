# Диагностика SSH: проверка неинтерактивного доступа к ВМ при обрыве интерактивной сессии.
# Запуск: .\scripts\diagnose-ssh-vm.ps1
# См. docs/SSH_VM_CONNECTION_CLOSED.md

$KeyPath = "C:\Users\petr2\.ssh\ssh-key-1773410153319\ssh-key-1773410153319"
$Host = "178.154.244.83"
$User = "ubuntu"

if (-not (Test-Path $KeyPath)) {
    Write-Host "SSH key not found: $KeyPath" -ForegroundColor Red
    exit 1
}

Write-Host "Diagnosing SSH to ${User}@${Host} (interactive session closes immediately)..." -ForegroundColor Cyan
Write-Host ""

# 1) Простейшая команда без интерактивного шелла (bash --norc --noprofile не читает .bashrc/.profile)
Write-Host "1. Testing: ssh -T ... 'bash --norc --noprofile -c \"echo OK\"'" -ForegroundColor Yellow
$cmd1 = 'bash --norc --noprofile -c "echo OK"'
$out1 = ssh -i $KeyPath -T -o ConnectTimeout=10 -o StrictHostKeyChecking=no "${User}@${Host}" $cmd1 2>&1
$exit1 = $LASTEXITCODE
Write-Host "   Exit code: $exit1"
Write-Host "   Output: $out1"
if ($exit1 -eq 0 -and $out1 -match "OK") {
    Write-Host "   -> Non-interactive command works. Likely cause: .bashrc or .profile (exit/failing command)." -ForegroundColor Green
} else {
    Write-Host "   -> Non-interactive also fails or no OK. Check authorized_keys (command=?) or use Yandex serial console." -ForegroundColor Red
}
Write-Host ""

# 2) Попытка вывести конец .bashrc (если 1 сработал)
if ($exit1 -eq 0 -and $out1 -match "OK") {
    Write-Host "2. Fetching last 25 lines of ~/.bashrc on VM..." -ForegroundColor Yellow
    $cmd2 = 'bash --norc --noprofile -c "tail -25 /home/ubuntu/.bashrc 2>/dev/null || tail -25 ~/.bashrc 2>/dev/null || echo no-bashrc"'
    $out2 = ssh -i $KeyPath -T -o ConnectTimeout=10 -o StrictHostKeyChecking=no "${User}@${Host}" $cmd2 2>&1
    Write-Host $out2
    if ($out2 -match "exit|^\s*exit\s") {
        Write-Host "   -> Found 'exit' in .bashrc - remove or comment it on the VM (use Yandex console)." -ForegroundColor Yellow
    }
    Write-Host ""
}

# 3) Напоминание про консоль
Write-Host "3. If you cannot run commands: use Yandex Cloud VM Serial Console to log in and fix ~/.bashrc or ~/.ssh/authorized_keys." -ForegroundColor Cyan
Write-Host "   See: docs/SSH_VM_CONNECTION_CLOSED.md" -ForegroundColor Gray
