# Установка браузера для PDF/Excel на ВМ. Snap Chromium не запускается из systemd — ставим Chrome .deb.
# Сначала останавливаем приложение и освобождаем память, затем ставим Chrome.
# Запуск: .\scripts\setup-vm-chromium.ps1
# На малопамятной ВМ wget убивается — скачайте .deb на ПК и передайте скрипту:
#   .\scripts\setup-vm-chromium.ps1 -LocalDeb "C:\Users\...\Downloads\google-chrome-stable_current_amd64.deb"
# Скачать: https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb

param([string]$LocalDeb = "")

$ErrorActionPreference = "Stop"
$prevErrPref = $ErrorActionPreference
$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
$RemotePath = if ($env:1002DOORS_STAGING_REMOTE_PATH) { $env:1002DOORS_STAGING_REMOTE_PATH } else { "~/domeo-app" }
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ConnectTimeout=60")

if ($LocalDeb) {
    if (-not (Test-Path $LocalDeb)) { Write-Host "File not found: $LocalDeb" -ForegroundColor Red; exit 1 }
    $size = (Get-Item $LocalDeb).Length
    if ($size -lt 50000000) { Write-Host "File too small (need >= 50MB): $LocalDeb" -ForegroundColor Red; exit 1 }
    Write-Host "Uploading Chrome .deb from PC to VM..." -ForegroundColor Cyan
    $ErrorActionPreference = 'Continue'
    & scp -i $KeyPath @SshOpts $LocalDeb "${StagingHost}:/tmp/chrome.deb" 2>&1 | Out-Null
    $ErrorActionPreference = $prevErrPref
    if ($LASTEXITCODE -ne 0) { Write-Host "scp failed." -ForegroundColor Red; exit 1 }
    Write-Host "Upload done." -ForegroundColor Green
}

Write-Host "1/5 Stopping app and freeing memory on VM..." -ForegroundColor Cyan
$ErrorActionPreference = 'Continue'
& ssh -i $KeyPath @SshOpts $StagingHost 'sudo systemctl stop domeo-standalone 2>/dev/null; fuser -k 3000/tcp 2>/dev/null; pkill -f "node.*server.js" 2>/dev/null; true; sleep 2; sync; echo 3 | sudo tee /proc/sys/vm/drop_caches >/dev/null 2>&1; free -m' 2>&1 | Out-Null
$ErrorActionPreference = $prevErrPref
Start-Sleep -Seconds 2

Write-Host "2/5 Removing snap Chromium (if any)..." -ForegroundColor Cyan
$ErrorActionPreference = 'Continue'
& ssh -i $KeyPath @SshOpts $StagingHost 'sudo snap remove chromium 2>/dev/null; true' 2>&1 | Out-Null
$ErrorActionPreference = $prevErrPref
Start-Sleep -Seconds 3

Write-Host "3/5 Creating swap and installing Google Chrome .deb..." -ForegroundColor Cyan
# Если уже установлен — только путь. Иначе: swap 512M, wget, dpkg. Подхватываем /tmp/chrome.deb если есть и >50MB.
$installCmd = 'if [ -x /usr/bin/google-chrome-stable ]; then echo CHROMIUM_PATH=/usr/bin/google-chrome-stable; exit 0; fi; cd /tmp; DEB=chrome.deb; if [ -s "$DEB" ] && [ $(stat -c%s "$DEB" 2>/dev/null) -ge 50000000 ]; then echo "Using existing $DEB"; else rm -f $DEB; SWAP=/tmp/domeo-chrome-swap; sudo swapoff $SWAP 2>/dev/null; sudo rm -f $SWAP; sudo fallocate -l 512M $SWAP 2>/dev/null || sudo dd if=/dev/zero of=$SWAP bs=1M count=512 2>/dev/null; sudo chmod 600 $SWAP; sudo mkswap $SWAP 2>/dev/null; sudo swapon $SWAP 2>/dev/null; wget -q --timeout=300 -O $DEB https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb || { sudo swapoff $SWAP 2>/dev/null; echo CHROMIUM_NOT_FOUND; exit 1; }; sudo swapoff $SWAP 2>/dev/null; sudo rm -f $SWAP; fi; sudo DEBIAN_FRONTEND=noninteractive apt-get install -y ./$DEB 2>/dev/null || (sudo dpkg -i ./$DEB; sudo apt-get install -f -y 2>/dev/null); rm -f $DEB; if [ -x /usr/bin/google-chrome-stable ]; then echo CHROMIUM_PATH=/usr/bin/google-chrome-stable; else echo CHROMIUM_NOT_FOUND; exit 1; fi'
$ErrorActionPreference = 'Continue'
$installOut = & ssh -i $KeyPath @SshOpts $StagingHost $installCmd 2>&1
$ErrorActionPreference = $prevErrPref
if ($LASTEXITCODE -ne 0 -or $installOut -match "CHROMIUM_NOT_FOUND") {
    Write-Host "Chrome install failed. Output: $installOut" -ForegroundColor Red
    exit 1
}
$chromiumPath = ($installOut | Select-String -Pattern "CHROMIUM_PATH=(.+)" | ForEach-Object { $_.Matches.Groups[1].Value.Trim() })
if (-not $chromiumPath) { $chromiumPath = "/usr/bin/google-chrome-stable" }

Write-Host "4/5 Updating .env..." -ForegroundColor Cyan
# Добавить или обновить PUPPETEER_EXECUTABLE_PATH в .env
$envCmd = "ENVFILE=$RemotePath/.env; if grep -q '^PUPPETEER_EXECUTABLE_PATH=' `$ENVFILE 2>/dev/null; then sed -i 's|^PUPPETEER_EXECUTABLE_PATH=.*|PUPPETEER_EXECUTABLE_PATH=$chromiumPath|' `$ENVFILE; else echo PUPPETEER_EXECUTABLE_PATH=$chromiumPath >> `$ENVFILE; fi; grep PUPPETEER_EXECUTABLE_PATH `$ENVFILE; echo ENV_OK"
$ErrorActionPreference = 'Continue'
$envOut = & ssh -i $KeyPath @SshOpts $StagingHost $envCmd 2>&1
$ErrorActionPreference = $prevErrPref
if (($envOut | Out-String) -notmatch "ENV_OK") {
    Write-Host "Failed to update .env. Output: $envOut" -ForegroundColor Red
    exit 1
}
Write-Host "Chromium: $chromiumPath" -ForegroundColor Green
Write-Host ".env updated." -ForegroundColor Green

Write-Host "5/5 Restarting app on VM..." -ForegroundColor Cyan
& "$PSScriptRoot\restart-vm-app.ps1"
Write-Host "Done. PDF/Excel export should work." -ForegroundColor Green
