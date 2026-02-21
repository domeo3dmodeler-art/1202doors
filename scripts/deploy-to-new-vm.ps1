# Безопасный деплой на ВМ 89.169.181.191: настройка (один раз) + артефакт + Nginx/Fail2ban.
# Запуск: .\scripts\deploy-to-new-vm.ps1
# По умолчанию: ключ ssh-key-1771526730154, хост ubuntu@89.169.181.191
#
# Параметры:
#   -SkipSetup    ВМ уже настроена (Node, PostgreSQL, .env, systemd), только деплой и безопасность
#   -SkipSecurity Не применять Nginx и Fail2ban (оставить доступ по 3000)
#   -SkipBuild    Не пересобирать проект, использовать существующий .next/standalone (быстрее при повторном деплое)

param([switch]$SkipSetup = $false, [switch]$SkipSecurity = $false, [switch]$SkipBuild = $false)
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) { $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..") }

# ВМ 89.169.181.191 и ключ из папки ssh-key-1771526730154
$DefaultKey = "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154"
$DefaultHost = "ubuntu@89.169.181.191"

$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { $DefaultKey }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { $DefaultHost }
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ConnectTimeout=15")

if (-not (Test-Path $KeyPath)) {
    Write-Host "SSH key not found: $KeyPath. Set 1002DOORS_SSH_KEY or use default path." -ForegroundColor Red
    exit 1
}

Write-Host "Target: $StagingHost" -ForegroundColor Cyan
Write-Host "Key: $KeyPath" -ForegroundColor Gray

# 1) Проверка SSH
Write-Host "`n1. Testing SSH..." -ForegroundColor Yellow
$test = & ssh -i $KeyPath @SshOpts $StagingHost "echo OK" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "SSH failed. Check: key path, VM is running, security group allows port 22, key in VM metadata." -ForegroundColor Red
    Write-Host $test
    exit 1
}
Write-Host "   SSH OK." -ForegroundColor Green

# 2) Первичная настройка ВМ (если не пропущено)
if (-not $SkipSetup) {
    Write-Host "`n2. First-time VM setup (Node 20, PostgreSQL, .env, systemd)..." -ForegroundColor Yellow
    $env:1002DOORS_SSH_KEY = $KeyPath
    $env:1002DOORS_STAGING_HOST = $StagingHost
    & $ProjectRoot\scripts\setup-new-vm.ps1
    if ($LASTEXITCODE -ne 0) { Write-Host "Setup failed." -ForegroundColor Red; exit 1 }
    Write-Host "   VM setup done." -ForegroundColor Green
} else {
    Write-Host "`n2. SkipSetup: skipping VM setup." -ForegroundColor Gray
}

# 3) Деплой артефакта (сборка локально, на ВМ только распаковка и перезапуск)
Write-Host "`n3. Deploying standalone artifact..." -ForegroundColor Yellow
$env:1002DOORS_SSH_KEY = $KeyPath
$env:1002DOORS_STAGING_HOST = $StagingHost
$deployArgs = @()
if ($SkipBuild) { $deployArgs += "-SkipBuild" }
& $ProjectRoot\scripts\deploy-standalone-to-vm.ps1 @deployArgs
if ($LASTEXITCODE -ne 0) { Write-Host "Deploy failed." -ForegroundColor Red; exit 1 }
Write-Host "   Deploy done." -ForegroundColor Green

# 4) Безопасность: Nginx + Fail2ban
if (-not $SkipSecurity) {
    Write-Host "`n4. Applying security (Nginx, Fail2ban)..." -ForegroundColor Yellow
    $env:1002DOORS_SSH_KEY = $KeyPath
    $env:1002DOORS_STAGING_HOST = $StagingHost
    & $ProjectRoot\scripts\apply-vm-security.ps1
    if ($LASTEXITCODE -ne 0) { Write-Host "Security setup failed." -ForegroundColor Red; exit 1 }
    Write-Host "   Security done. Open port 80, close 3000 in security group." -ForegroundColor Green
} else {
    Write-Host "`n4. SkipSecurity: not applying Nginx/Fail2ban." -ForegroundColor Gray
}

$HostOnly = if ($StagingHost -match '@') { $StagingHost.Split('@')[1] } else { $StagingHost }
Write-Host "`nDone. App: http://${HostOnly}" -ForegroundColor Green
if (-not $SkipSecurity) { Write-Host "   (or http://${HostOnly}:3000 if port 80 not yet open)" -ForegroundColor Gray }
