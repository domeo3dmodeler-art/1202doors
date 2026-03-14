# Проверка staging после sync: health, страницы, фото.
# Запуск: .\scripts\verify-staging.ps1

$Base = "http://178.154.244.83:3000"
$checks = @()

# Health
try {
    $r = Invoke-RestMethod -Uri "$Base/api/health" -TimeoutSec 10
    $checks += @{ name = "api/health"; ok = ($r.status -eq "ok" -or $r.database); status = "OK" }
} catch { $checks += @{ name = "api/health"; ok = $false; status = $_.Exception.Message } }

# Главная
try {
    $r = Invoke-WebRequest -Uri $Base -UseBasicParsing -TimeoutSec 10
    $checks += @{ name = "/"; ok = ($r.StatusCode -eq 200); status = $r.StatusCode }
} catch { $checks += @{ name = "/"; ok = $false; status = "Error" } }

# Каталог дверей
try {
    $r = Invoke-WebRequest -Uri "$Base/doors" -UseBasicParsing -TimeoutSec 10
    $checks += @{ name = "/doors"; ok = ($r.StatusCode -eq 200); status = $r.StatusCode }
} catch { $checks += @{ name = "/doors"; ok = $false; status = "Error" } }

# Фото ручки (один пример)
$photoUrl = "$Base/uploads/final-filled/04_%D0%A0%D1%83%D1%87%D0%BA%D0%B8_%D0%97%D0%B0%D0%B2%D0%B5%D1%80%D1%82%D0%BA%D0%B8/handle_MIRA_%D0%A7%D0%95%D0%A0%D0%9D%D0%AB%D0%99_main.png"
try {
    $r = Invoke-WebRequest -Uri $photoUrl -Method Head -UseBasicParsing -TimeoutSec 15
    $checks += @{ name = "photo handle"; ok = ($r.StatusCode -eq 200); status = $r.StatusCode }
} catch {
    try {
        $r = Invoke-WebRequest -Uri $photoUrl -UseBasicParsing -TimeoutSec 15
        $checks += @{ name = "photo handle"; ok = ($r.StatusCode -eq 200); status = $r.StatusCode }
    } catch { $checks += @{ name = "photo handle"; ok = $false; status = "404/Error" } }
}

$checks | ForEach-Object {
    $s = if ($_.ok) { "OK" } else { "FAIL" }
    Write-Host "$s $($_.name) -> $($_.status)"
}
$failed = ($checks | Where-Object { -not $_.ok }).Count
if ($failed -gt 0) { exit 1 }
Write-Host "All checks passed. Staging: $Base"
