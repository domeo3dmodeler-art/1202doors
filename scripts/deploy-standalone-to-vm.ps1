# Деплой артефактом: сборка только на вашей машине, на ВМ — только запуск готового билда.
# На ВМ НЕ выполняется npm install/npm ci — нет скриптов пакетов и массовой загрузки, нет риска трафика и потери SSH.
#
# Запуск: .\scripts\deploy-standalone-to-vm.ps1
# Требуется: 1002DOORS_SSH_KEY и 1002DOORS_STAGING_HOST в окружении (см. docs/DEPLOY_STANDALONE_ARTIFACT.md).
#
# Первый раз на ВМ: установите Node.js, создайте ~/domeo-app, .env и systemd-юнит (см. docs/DEPLOY_STANDALONE_ARTIFACT.md).
# -SkipBuild: не собирать локально, загрузить уже имеющийся .next/standalone (если есть).

param([switch]$SkipBuild = $false)
$ErrorActionPreference = "Stop"
$Script:OriginalErrorAction = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) { $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..") }

$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771510238528\ssh-key-1771510238528" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@158.160.13.144" }
$StagingHostOnly = if ($StagingHost -match '@') { $StagingHost.Split('@')[1] } else { $StagingHost }
$RemoteAppPath = "~/domeo-app"
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=6")

if (-not (Test-Path $KeyPath)) {
    Write-Host "SSH key not found: $KeyPath. Set 1002DOORS_SSH_KEY." -ForegroundColor Red
    exit 1
}

Write-Host "Deploy standalone artifact (no npm on VM)..." -ForegroundColor Cyan
Push-Location $ProjectRoot

$standalonePath = Join-Path $ProjectRoot ".next\standalone"
if (-not $SkipBuild) {
    # 1) Установка зависимостей (без NODE_ENV=production, чтобы ставились devDependencies, в т.ч. prisma)
    Write-Host "1. npm ci (local)..." -ForegroundColor Yellow
    $env:NODE_ENV = ""
    $ErrorActionPreference = "Continue"
    & npm ci 2>&1 | Out-Null
    $ErrorActionPreference = $Script:OriginalErrorAction
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   npm ci failed. Trying npm ci --ignore-scripts..." -ForegroundColor Yellow
        & npm ci --ignore-scripts 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) { Write-Host "   npm ci failed." -ForegroundColor Red; Pop-Location; exit 1 }
        & node node_modules/prisma/build/index.js generate 2>&1 | Out-Null
    }

    # 2) Production build (standalone)
    Write-Host "2. npm run build (local, NODE_ENV=production)..." -ForegroundColor Yellow
    $env:NODE_ENV = "production"
    $ErrorActionPreference = "Continue"
    & npm run build 2>&1 | Out-Null
    $ErrorActionPreference = $Script:OriginalErrorAction
    if ($LASTEXITCODE -ne 0) { Write-Host "Build failed." -ForegroundColor Red; Pop-Location; exit 1 }
} else {
    Write-Host "SkipBuild: using existing .next/standalone" -ForegroundColor Yellow
}

if (-not (Test-Path $standalonePath)) {
    Write-Host "Standalone not found. Check next.config: output: 'standalone' when NODE_ENV=production." -ForegroundColor Red
    Pop-Location
    exit 1
}

# 4) Копируем public, .next/static и .prisma (для Linux) в standalone
$standaloneNext = Join-Path $standalonePath ".next"
if (-not (Test-Path $standaloneNext)) { New-Item -ItemType Directory -Path $standaloneNext -Force | Out-Null }
# Копируем содержимое .next/static в standalone/.next/static (без лишнего вложенного static/)
$staticDest = Join-Path $standaloneNext "static"
if (-not (Test-Path $staticDest)) { New-Item -ItemType Directory -Path $staticDest -Force | Out-Null }
Copy-Item -Path (Join-Path $ProjectRoot ".next\static\*") -Destination $staticDest -Recurse -Force -ErrorAction SilentlyContinue
# Копируем содержимое public в standalone/public (без лишнего вложенного public/)
$publicDest = Join-Path $standalonePath "public"
if (-not (Test-Path $publicDest)) { New-Item -ItemType Directory -Path $publicDest -Force | Out-Null }
Copy-Item -Path (Join-Path $ProjectRoot "public\*") -Destination $publicDest -Recurse -Force -ErrorAction SilentlyContinue
$standaloneNodeModules = Join-Path $standalonePath "node_modules"
if (Test-Path (Join-Path $ProjectRoot "node_modules\.prisma")) {
    if (-not (Test-Path $standaloneNodeModules)) { New-Item -ItemType Directory -Path $standaloneNodeModules -Force | Out-Null }
    Copy-Item -Path (Join-Path $ProjectRoot "node_modules\.prisma") -Destination (Join-Path $standaloneNodeModules ".prisma") -Recurse -Force -ErrorAction SilentlyContinue
}

# 5) Создаём архив (содержимое standalone в корне архива)
$archivePath = Join-Path $ProjectRoot "scripts\output\domeo-standalone.tar.gz"
$outputDir = Join-Path $ProjectRoot "scripts\output"
if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir -Force | Out-Null }

Write-Host "4. Creating archive..." -ForegroundColor Yellow
# tar из корня standalone; не включаем .env, чтобы не перезаписать его на ВМ
& tar -czf $archivePath -C $standalonePath --exclude=".env" . 2>&1
if ($LASTEXITCODE -ne 0) { Write-Host "tar failed." -ForegroundColor Red; Pop-Location; exit 1 }

$sizeMB = [math]::Round((Get-Item $archivePath).Length / 1MB, 1)
Write-Host "   Archive: $sizeMB MB" -ForegroundColor Gray

# 6) Загружаем архив на ВМ (scp), затем распаковываем в ~/domeo-app (не трогаем .env)
Write-Host "5. Uploading archive to VM..." -ForegroundColor Yellow
$ErrorActionPreference = "Continue"
& ssh -i $KeyPath @SshOpts -o ConnectTimeout=10 $StagingHost "mkdir -p $RemoteAppPath" 2>$null
& scp -i $KeyPath @SshOpts $archivePath "${StagingHost}:$RemoteAppPath/domeo-standalone.tar.gz"
$ErrorActionPreference = $Script:OriginalErrorAction
if ($LASTEXITCODE -ne 0) { Write-Host "scp failed." -ForegroundColor Red; Remove-Item $archivePath -Force -ErrorAction SilentlyContinue; Pop-Location; exit 1 }

Write-Host "   Extracting on VM..." -ForegroundColor Yellow
$extractCmd = "cd $RemoteAppPath && tar -xzf domeo-standalone.tar.gz && rm -f domeo-standalone.tar.gz && echo EXTRACT_OK"
$ErrorActionPreference = "Continue"
& ssh -i $KeyPath @SshOpts -o ConnectTimeout=120 $StagingHost $extractCmd 2>&1 | Out-Null
$ErrorActionPreference = $Script:OriginalErrorAction
if ($LASTEXITCODE -ne 0) { Write-Host "Extract on VM failed." -ForegroundColor Red; Pop-Location; exit 1 }

# 7) Перезапуск приложения (standalone: node server.js)
Write-Host "6. Restarting app on VM..." -ForegroundColor Yellow
$restartCmd = "sudo systemctl restart domeo-standalone 2>/dev/null || (pkill -f 'node.*server.js' 2>/dev/null; sleep 2; cd $RemoteAppPath && NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 nohup node server.js > /tmp/domeo.log 2>&1 &)"
$ErrorActionPreference = "Continue"
& ssh -i $KeyPath @SshOpts -o ConnectTimeout=15 $StagingHost $restartCmd 2>&1 | Out-Null
$ErrorActionPreference = $Script:OriginalErrorAction

Remove-Item $archivePath -Force -ErrorAction SilentlyContinue
Pop-Location

Write-Host "Done. App: http://${StagingHostOnly}:3000" -ForegroundColor Green
Write-Host "On VM no npm install was run; no package scripts, no extra traffic from dependencies." -ForegroundColor Gray
