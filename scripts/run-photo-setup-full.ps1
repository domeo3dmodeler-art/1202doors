# Полная настройка раздачи фото: локальные шаги + ВМ (Nginx + sync uploads).
# Запуск: .\scripts\run-photo-setup-full.ps1
# Переменные: 1002DOORS_SSH_KEY, 1002DOORS_STAGING_HOST (по умолчанию ubuntu@89.169.181.191)
# Если SSH не работает: добавьте ключ на ВМ (Serial Console или fix-vm-authorized-keys.ps1 с рабочим ключом), задайте 1002DOORS_SSH_KEY и запустите снова.

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) { $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..") }

$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "$env:USERPROFILE\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
# Чтобы дочерние скрипты (apply-nginx, sync-uploads) использовали тот же ключ
$env:1002DOORS_SSH_KEY = $KeyPath
$env:1002DOORS_STAGING_HOST = $StagingHost

Write-Host "=== 1/4 Normalize uploads (NFC) ===" -ForegroundColor Cyan
Push-Location $ProjectRoot
try {
    & npx tsx scripts/normalize-uploads-nfc.ts
    if ($LASTEXITCODE -ne 0) { Write-Host "normalize failed." -ForegroundColor Red; exit 1 }
} finally { Pop-Location }
Write-Host "OK." -ForegroundColor Green

Write-Host "`n=== 2/4 Apply Nginx config to VM ===" -ForegroundColor Cyan
if (-not (Test-Path $KeyPath)) {
    Write-Host "SSH key not found: $KeyPath" -ForegroundColor Red
    Write-Host "Set 1002DOORS_SSH_KEY to your private key path, then run again." -ForegroundColor Yellow
    exit 1
}
& $PSScriptRoot\apply-nginx-to-vm.ps1
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nNginx apply failed (SSH/SCP). To fix:" -ForegroundColor Yellow
    Write-Host "  1. Add your public key to VM: ~/.ssh/authorized_keys (e.g. via Serial Console)." -ForegroundColor Gray
    Write-Host "  2. Or run: `$env:1002DOORS_SSH_KEY = 'path\to\key'; .\scripts\fix-vm-authorized-keys.ps1" -ForegroundColor Gray
    Write-Host "  3. Then: .\scripts\run-photo-setup-full.ps1" -ForegroundColor Gray
    exit 1
}
Write-Host "OK." -ForegroundColor Green

Write-Host "`n=== 3/4 Sync uploads to VM ===" -ForegroundColor Cyan
& $PSScriptRoot\sync-uploads-to-vm.ps1
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nSync failed. If network/SSH is unstable, try:" -ForegroundColor Yellow
    Write-Host "  .\scripts\sync-uploads-to-vm.ps1 -Subfolder 'final-filled/doors' -ChunkFiles 50" -ForegroundColor Gray
    Write-Host "  or: .\scripts\sync-uploads-to-vm.ps1 -Rsync" -ForegroundColor Gray
    exit 1
}
Write-Host "OK." -ForegroundColor Green

Write-Host "`n=== 4/4 Verify (optional) ===" -ForegroundColor Cyan
Write-Host "On VM ensure app path matches Nginx root: /home/ubuntu/domeo-app/public" -ForegroundColor Gray
Write-Host "Check: ssh -i `"$KeyPath`" $StagingHost 'ls -la ~/domeo-app/public/uploads/final-filled/doors | head -5'" -ForegroundColor Gray
Write-Host "`nDone. Open the site and check that photos load without 502." -ForegroundColor Green
