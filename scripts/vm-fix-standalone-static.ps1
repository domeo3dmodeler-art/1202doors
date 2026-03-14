# После сборки на ВМ (npm run build) standalone не содержит .next/static — скрипты отдают 404.
# Копируем .next/static в .next/standalone/.next/ и перезапускаем приложение.
#
# Запуск: .\scripts\set-test-vm-env.ps1  затем  .\scripts\vm-fix-standalone-static.ps1
# Или задать 1002DOORS_STAGING_HOST и 1002DOORS_SSH_KEY.

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path $MyInvocation.MyCommand.Path -Parent
$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1773410153319\ssh-key-1773410153319" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@178.154.244.83" }
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15")

$remoteCmd = @"
cd ~/domeo-app
[ -d .next/static ] && cp -r .next/static .next/standalone/.next/ && echo 'Static copied.'
# Фото лежат в ~/domeo-app/public/uploads, приложение отдаёт из .next/standalone/public — делаем симлинк
[ -d public/uploads ] && ln -sf /home/ubuntu/domeo-app/public/uploads .next/standalone/public/uploads 2>/dev/null && echo 'Uploads linked.'
sudo systemctl restart domeo-standalone 2>/dev/null || true
echo 'Done.'
"@
& ssh -i $KeyPath @SshOpts $StagingHost $remoteCmd 2>&1
Write-Host "If you had 404 on /_next/static/chunks/*.js, refresh the page." -ForegroundColor Green
