# Один раз настроить ВМ для быстрых правок (вариант 1): репо + next dev.
# 1) Проверка SSH
# 2) Синхронизация кода на ВМ (rsync, если есть; иначе подсказка про git pull)
# 3) npm install на ВМ
# 4) Запуск next dev на ВМ
#
# Запуск: .\scripts\setup-vm-fast-edits.ps1 [-SkipSync] [-SkipStart] [-SkipInstall]
# Env: 1002DOORS_SSH_KEY, 1002DOORS_STAGING_HOST, 1002DOORS_STAGING_REMOTE_PATH

param([switch]$SkipSync = $false, [switch]$SkipStart = $false, [switch]$SkipInstall = $false)
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) { $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..") }

$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
$RemotePath = if ($env:1002DOORS_STAGING_REMOTE_PATH) { $env:1002DOORS_STAGING_REMOTE_PATH } else { "~/domeo-app" }
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ConnectTimeout=15")

# 1) SSH
Write-Host "1. Checking SSH..." -ForegroundColor Cyan
$sshTest = & ssh -i $KeyPath @SshOpts $StagingHost "echo OK" 2>&1
if ($LASTEXITCODE -ne 0 -or $sshTest -notmatch "OK") {
    Write-Host "SSH failed. Check key and VM reachability." -ForegroundColor Red
    exit 1
}
Write-Host "   SSH OK" -ForegroundColor Green

# 2) Sync (optional). Требуется rsync — установите Git for Windows.
if (-not $SkipSync) {
    Write-Host "2. Syncing to VM (rsync)..." -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "sync-to-vm.ps1")
    if ($LASTEXITCODE -ne 0) { exit 1 }
    Write-Host "   Sync done." -ForegroundColor Green
} else {
    Write-Host "2. SkipSync: skipping sync." -ForegroundColor Gray
}

# 3) npm install on VM (пропустить если зависимости не менялись: -SkipInstall)
if (-not $SkipInstall) {
    Write-Host "3. Running npm install on VM..." -ForegroundColor Cyan
    & ssh -i $KeyPath @SshOpts $StagingHost "cd $RemotePath && npm install" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   npm install failed (connection may drop). Run on VM in screen: cd $RemotePath && npm install" -ForegroundColor Yellow
    } else { Write-Host "   npm install done." -ForegroundColor Green }
} else {
    Write-Host "3. SkipInstall: skipping npm install." -ForegroundColor Gray
}

# 4) Start next dev (сначала останавливаем production, чтобы порт 3000 был свободен)
if (-not $SkipStart) {
    Write-Host "4. Stopping production, then starting next dev on VM..." -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "stop-vm-production.ps1") 2>&1 | Out-Null
    Start-Sleep -Seconds 2
    & ssh -i $KeyPath @SshOpts $StagingHost "cd $RemotePath && mkdir -p logs && (pgrep -f 'next dev' >/dev/null || nohup npx next dev -p 3000 -H 0.0.0.0 >> logs/next-dev.log 2>&1 &)"
    Start-Sleep -Seconds 2
    Write-Host "   next dev should be starting. Check: ssh ... 'tail -f $RemotePath/logs/next-dev.log'" -ForegroundColor Green
} else {
    Write-Host "4. SkipStart: run .\scripts\start-vm-dev.ps1 to start next dev." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Fast edits: .\scripts\push-one-file-to-vm.ps1 app\api\catalog\hardware\route.ts" -ForegroundColor Cyan
