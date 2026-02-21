# Show your external IP for Yandex Cloud security group (source: your_IP/32).
# Run: .\scripts\show-my-ip.ps1

try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "https://ifconfig.me/ip" -TimeoutSec 10
    $ip = $r.Content.Trim()
    if ($ip -match '^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$') {
        Write-Host "Your external IP: $ip" -ForegroundColor Green
        Write-Host "In security group set source: $ip/32" -ForegroundColor Cyan
    } else {
        Write-Host "Response is not an IP: $ip" -ForegroundColor Yellow
    }
} catch {
    Write-Host "Failed to get IP: $_" -ForegroundColor Red
    Write-Host "Open in browser: https://ifconfig.me" -ForegroundColor Gray
}
