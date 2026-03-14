# Установка Chromium из apt на ВМ и настройка .env для экспорта PDF/Excel.
# Альтернатива setup-vm-chromium.ps1 (тот ставит Chrome .deb — тяжелее). Этот скрипт — лёгкий apt install chromium-browser.
# Запуск: .\scripts\vm-fix-pdf-export.ps1
# Требуется: 1002DOORS_SSH_KEY, 1002DOORS_STAGING_HOST (по умолчанию ubuntu@178.154.244.83)

$ErrorActionPreference = "Stop"
$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "$env:USERPROFILE\.ssh\ssh-key-1773410153319\ssh-key-1773410153319" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@178.154.244.83" }
$RemotePath = if ($env:1002DOORS_STAGING_REMOTE_PATH) { $env:1002DOORS_STAGING_REMOTE_PATH } else { "~/domeo-app" }
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ConnectTimeout=30")

if (-not (Test-Path $KeyPath)) { Write-Host "SSH key not found: $KeyPath" -ForegroundColor Red; exit 1 }

$ProjectRoot = Split-Path $PSScriptRoot -Parent
$ScriptPath = Join-Path $ProjectRoot "scripts\vm-install-chromium.sh"

Write-Host "1/4 Copy vm-install-chromium.sh to VM..." -ForegroundColor Cyan
& scp -i $KeyPath @SshOpts $ScriptPath "${StagingHost}:/tmp/vm-install-chromium.sh"
if ($LASTEXITCODE -ne 0) { Write-Host "scp failed." -ForegroundColor Red; exit 1 }

Write-Host "2/4 Install Chromium from apt (remove snap if present)..." -ForegroundColor Cyan
$installCmd = 'sudo snap remove chromium 2>/dev/null; true; sudo bash /tmp/vm-install-chromium.sh 2>&1'
$installOut = & ssh -i $KeyPath @SshOpts $StagingHost $installCmd
# Путь в выводе вида "Chromium at: /usr/bin/chromium-browser" или "PUPPETEER_EXECUTABLE_PATH=..."
$chromiumPath = ""
if ($installOut -match "Chromium at:\s*(.+)") { $chromiumPath = $Matches[1].Trim() }
if ($installOut -match "PUPPETEER_EXECUTABLE_PATH=(.+)") { $chromiumPath = $Matches[1].Trim() }
if (-not $chromiumPath) {
  $chromiumPath = "/usr/bin/chromium-browser"
  $checkPath = & ssh -i $KeyPath @SshOpts $StagingHost "test -x $chromiumPath && echo $chromiumPath || (test -x /usr/bin/chromium && echo /usr/bin/chromium || echo '')" 2>&1
  if ($checkPath) { $chromiumPath = $checkPath.Trim() }
}
if (-not $chromiumPath) {
  Write-Host "Could not detect Chromium path. Install output: $installOut" -ForegroundColor Red
  exit 1
}
Write-Host "  Chromium: $chromiumPath" -ForegroundColor Green

Write-Host "3/4 Update .env on VM..." -ForegroundColor Cyan
$envCmd = "ENVFILE=$RemotePath/.env; if grep -q '^PUPPETEER_EXECUTABLE_PATH=' `$ENVFILE 2>/dev/null; then sed -i 's|^PUPPETEER_EXECUTABLE_PATH=.*|PUPPETEER_EXECUTABLE_PATH=$chromiumPath|' `$ENVFILE; else echo PUPPETEER_EXECUTABLE_PATH=$chromiumPath >> `$ENVFILE; fi; grep PUPPETEER_EXECUTABLE_PATH `$ENVFILE; echo ENV_OK"
$envOut = & ssh -i $KeyPath @SshOpts $StagingHost $envCmd 2>&1
if (($envOut | Out-String) -notmatch "ENV_OK") {
  Write-Host "Failed to update .env. Output: $envOut" -ForegroundColor Red
  exit 1
}

Write-Host "4/4 Apply Nginx (longer timeouts for /api/export/) and restart app..." -ForegroundColor Cyan
& $PSScriptRoot\apply-nginx-to-vm.ps1
if ($LASTEXITCODE -ne 0) { Write-Host "Nginx apply failed (optional)." -ForegroundColor Yellow }
& $PSScriptRoot\restart-vm-app.ps1
if ($LASTEXITCODE -ne 0) { Write-Host "Restart failed." -ForegroundColor Red; exit 1 }

Write-Host "`nDone. PDF/Excel export (api/export/fast) should work. If 502 persists, check VM logs: journalctl -u domeo-standalone -n 50" -ForegroundColor Green
