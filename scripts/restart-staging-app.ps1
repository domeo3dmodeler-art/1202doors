# Перезапуск приложения (Next.js) на staging ВМ, не самой ВМ.
# Запуск: .\scripts\restart-staging-app.ps1

$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771392782781\ssh-key-1771392782781" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }

if (-not (Test-Path $KeyPath)) {
    Write-Host "SSH key not found: $KeyPath" -ForegroundColor Red
    Write-Host "Set 1002DOORS_SSH_KEY to your key path (see docs/SSH_KEY_AND_YC_VM.md)" -ForegroundColor Gray
    exit 1
}

Write-Host "Restarting app on staging ($StagingHost)..." -ForegroundColor Cyan

# Одна строка для -c, без pipe (надёжнее при обрывах SSH)
$oneLiner = "cd ~/1002doors && (systemctl is-active --quiet domeo-staging 2>/dev/null && sudo systemctl restart domeo-staging || (pkill -f 'node.*next' 2>/dev/null; sleep 2; NODE_ENV=production nohup npx next start -H 0.0.0.0 -p 3000 > /tmp/domeo.log 2>&1 &)); sleep 4; curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health"
$bashCmd = "bash --norc --noprofile -c " + [char]39 + $oneLiner + [char]39
& ssh -i $KeyPath -T -o StrictHostKeyChecking=no -o ConnectTimeout=20 $StagingHost $bashCmd
$exitCode = $LASTEXITCODE

$hostOnly = ($StagingHost -replace '^[^@]+@', '')
if ($exitCode -eq 0) {
    Write-Host "Done. Open http://${hostOnly}:3000" -ForegroundColor Green
} else {
    Write-Host "SSH failed or connection closed. Restart the app manually:" -ForegroundColor Yellow
    Write-Host "  1. Yandex Cloud Console -> VM $hostOnly -> Serial console (or Connect)" -ForegroundColor Gray
    Write-Host "  2. Log in and run:" -ForegroundColor Gray
    Write-Host "     sudo systemctl restart domeo-staging" -ForegroundColor Gray
    Write-Host "     # or if no systemd: cd ~/1002doors && pkill -f 'node.*next'; sleep 2; NODE_ENV=production nohup npx next start -H 0.0.0.0 -p 3000 > /tmp/domeo.log 2>&1 &" -ForegroundColor Gray
    Write-Host "  If app fails with ENOENT .next/prerender-manifest.json: run on VM: cd ~/1002doors && npm run build" -ForegroundColor Gray
}
exit $exitCode
