# Проверка трафика на ВМ. Запуск: .\scripts\check-vm-traffic.ps1
# Ключ по умолчанию: C:\Users\petr2\.ssh\ssh-key-1773410153319\ssh-key-1773410153319 (тестовая ВМ)

param([string]$KeyPath = "C:\Users\petr2\.ssh\ssh-key-1773410153319\ssh-key-1773410153319", [string]$User = "ubuntu", [string]$VmHost = "178.154.244.83")

$key = $KeyPath
if (Test-Path "$KeyPath\id_rsa") { $key = "$KeyPath\id_rsa" }
elseif (Test-Path "$KeyPath\id_ed25519") { $key = "$KeyPath\id_ed25519" }

Write-Host "Using key: $key" -ForegroundColor Cyan
Write-Host "Connecting to ${User}@${VmHost}..." -ForegroundColor Cyan

# 1) Счётчики трафика
Write-Host "`n--- /proc/net/dev (start) ---" -ForegroundColor Yellow
& ssh -i $key -o StrictHostKeyChecking=no -o ConnectTimeout=20 "${User}@${VmHost}" "cat /proc/net/dev"

# 2) Активные соединения
Write-Host "`n--- Active connections ---" -ForegroundColor Yellow
& ssh -i $key -o StrictHostKeyChecking=no -o ConnectTimeout=20 "${User}@${VmHost}" "ss -tunap 2>/dev/null || netstat -tunap 2>/dev/null"

# 3) Топ процессов
Write-Host "`n--- Top processes (CPU) ---" -ForegroundColor Yellow
& ssh -i $key -o StrictHostKeyChecking=no -o ConnectTimeout=20 "${User}@${VmHost}" "ps aux --sort=-%cpu | head -12"

# 4) Через 5 сек — счётчики снова (прирост = активный трафик)
Write-Host "`n--- Waiting 5 sec, then /proc/net/dev again ---" -ForegroundColor Yellow
Start-Sleep -Seconds 2
& ssh -i $key -o StrictHostKeyChecking=no -o ConnectTimeout=25 "${User}@${VmHost}" "sleep 5; cat /proc/net/dev"

Write-Host "`nDone. Compare Receive/Transmit bytes between the two /proc/net/dev outputs." -ForegroundColor Green
if ($LASTEXITCODE -ne 0) { Write-Host "SSH failed. Run: ssh -i `"$key`" ${User}@${VmHost}" -ForegroundColor Red }
