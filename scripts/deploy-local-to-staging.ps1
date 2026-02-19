# Загружает локальные изменения на staging ВМ, собирает проект и перезапускает приложение.
# Запуск: .\scripts\deploy-local-to-staging.ps1              — залить список файлов (по умолчанию)
#         .\scripts\deploy-local-to-staging.ps1 -FullSync   — перенести весь код (app, lib, components, prisma и т.д.)
#         .\scripts\deploy-local-to-staging.ps1 -UseGit     — без scp: на ВМ выполнить git pull + build + restart (сначала локально: git push)
#         .\scripts\deploy-local-to-staging.ps1 -SkipBuild   — только залить файлы, сборку на ВМ вручную
#
# Важно: правки в коде делаются локально. На ВМ они попадают только после этого скрипта.
# Если SSH обрывается при scp — используйте -UseGit (предварительно git push).

param([switch]$SkipBuild = $false, [switch]$FullSync = $false, [switch]$UseGit = $false)
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) { $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..") }
# Путь к ключу: задайте 1002DOORS_SSH_KEY в окружении (см. docs/SSH_KEY_AND_YC_VM.md)
$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771392782781\ssh-key-1771392782781" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@84.201.160.50" }
$StagingHostOnly = if ($StagingHost -match '@') { $StagingHost.Split('@')[1] } else { $StagingHost }
$RemotePath = "~/1002doors"
# Keepalive чтобы соединение не обрывалось при долгой загрузке (Windows scp/ssh принимают каждый -o отдельно)
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=6")

if (-not (Test-Path $KeyPath)) {
    Write-Host "SSH key not found: $KeyPath" -ForegroundColor Red
    exit 1
}

if ($UseGit) {
    # Деплой без scp: git pull, установка зависимостей без скриптов (защита цепочки поставок), build, restart
    Write-Host "Deploy via Git: pull + npm ci --ignore-scripts + prisma generate + build + restart on VM..." -ForegroundColor Cyan
    $gitCmd = 'cd ~/1002doors && git pull 2>&1 && npm ci --ignore-scripts 2>&1 && npx prisma generate 2>&1 && npm run build 2>&1 && sudo systemctl restart domeo-staging && echo Done.'
    & ssh -i $KeyPath -T @SshOpts -o ConnectTimeout=300 $StagingHost ('bash --norc --noprofile -c ' + [char]39 + $gitCmd + [char]39)
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Command failed or SSH dropped. On VM run manually: cd ~/1002doors && git pull && npm ci --ignore-scripts && npx prisma generate && npm run build && sudo systemctl restart domeo-staging" -ForegroundColor Yellow
    } else {
        Write-Host "Done. Open http://${StagingHostOnly}:3000/doors" -ForegroundColor Green
    }
    exit 0
}

if ($FullSync) {
    # Полная синхронизация: tar в stdout → ssh (один канал, без scp)
    Write-Host "Full sync: packing and streaming to VM..." -ForegroundColor Cyan
    Push-Location $ProjectRoot
    $remoteCmd = "cd ${RemotePath} && tar -xzf - && echo EXTRACT_OK"
    tar -czf - --exclude=node_modules --exclude=.next --exclude=.env --exclude=.env.local --exclude=.env.postgresql app components lib prisma package.json package-lock.json next.config.mjs tsconfig.json postcss.config.js tailwind.config.js 2>$null | & ssh -i $KeyPath @SshOpts -o ConnectTimeout=120 $StagingHost $remoteCmd
    Pop-Location
    if ($LASTEXITCODE -ne 0) { Write-Host "Full sync failed." -ForegroundColor Red; exit 1 }
    Write-Host "Full sync done." -ForegroundColor Green
} else {
    # Выборочная загрузка по списку файлов
    $files = @(
        @{ local = "app\api\catalog\doors\complete-data\route.ts"; remote = "app/api/catalog/doors/complete-data/route.ts" },
        @{ local = "app\api\catalog\doors\complete-data\debug\route.ts"; remote = "app/api/catalog/doors/complete-data/debug/route.ts" },
        @{ local = "lib\configurator\useConfiguratorData.ts"; remote = "lib/configurator/useConfiguratorData.ts" },
        @{ local = "lib\configurator\image-src.ts"; remote = "lib/configurator/image-src.ts" },
        @{ local = "components\page-builder\elements\DoorCalculator.tsx"; remote = "components/page-builder/elements/DoorCalculator.tsx" },
        @{ local = "app\api\catalog\hardware\route.ts"; remote = "app/api/catalog/hardware/route.ts" },
        @{ local = "app\doors\page.tsx"; remote = "app/doors/page.tsx" },
        @{ local = "components\HandleSelectionModal.tsx"; remote = "components/HandleSelectionModal.tsx" },
        @{ local = "lib\export\puppeteer-generator.ts"; remote = "lib/export/puppeteer-generator.ts" },
        @{ local = "lib\export\excel-door-fields.ts"; remote = "lib/export/excel-door-fields.ts" },
        @{ local = "lib\price\doors-price-engine.ts"; remote = "lib/price/doors-price-engine.ts" },
        @{ local = "prisma\schema.prisma"; remote = "prisma/schema.prisma" },
        @{ local = "prisma\seed.ts"; remote = "prisma/seed.ts" },
        @{ local = "lib\security\rate-limiter.ts"; remote = "lib/security/rate-limiter.ts" }
    )
    Write-Host "Uploading file list to VM ($StagingHostOnly)..." -ForegroundColor Cyan
    foreach ($f in $files) {
        $localPath = Join-Path $ProjectRoot $f.local
        if (-not (Test-Path $localPath)) {
            Write-Host "  Skip (not found): $($f.local)" -ForegroundColor Yellow
            continue
        }
        $remoteDir = Split-Path $f.remote -Parent
        $mkdir = "mkdir -p ${RemotePath}/${remoteDir}"
        $maxTries = 3
        $uploaded = $false
        for ($t = 1; $t -le $maxTries; $t++) {
            if ($t -gt 1) { Write-Host "  Retry $t/$maxTries..." -ForegroundColor Gray; Start-Sleep -Seconds 3 }
            & ssh -i $KeyPath @SshOpts -o ConnectTimeout=10 $StagingHost $mkdir 2>$null
            & scp -i $KeyPath @SshOpts "$localPath" "${StagingHost}:${RemotePath}/$($f.remote)"
            if ($LASTEXITCODE -eq 0) { Write-Host "  OK: $($f.local)" -ForegroundColor Green; $uploaded = $true; break }
        }
        if (-not $uploaded) { Write-Host "  FAILED: $($f.local)" -ForegroundColor Red }
        Start-Sleep -Milliseconds 800
    }
}

if (-not $SkipBuild) {
    Write-Host "Installing deps and building on VM (may take 3-5 min)..." -ForegroundColor Cyan
    $buildCmd = 'cd ~/1002doors && npm ci --ignore-scripts 2>&1 && npx prisma generate 2>&1 && npm run build 2>&1'
    & ssh -i $KeyPath -T @SshOpts -o ConnectTimeout=300 $StagingHost ('bash --norc --noprofile -c ' + [char]39 + $buildCmd + [char]39)
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed or SSH disconnected. If build finished on VM, run restart manually." -ForegroundColor Yellow
    }
} else {
    Write-Host "SkipBuild: on VM run: cd ~/1002doors; npm ci --ignore-scripts; npx prisma generate; npm run build" -ForegroundColor Yellow
}

Write-Host "Restarting app on VM..." -ForegroundColor Cyan
& ssh -i $KeyPath @SshOpts -o ConnectTimeout=12 $StagingHost "sudo systemctl restart domeo-staging"
if ($LASTEXITCODE -ne 0) { Write-Host "Restart failed (run on VM: sudo systemctl restart domeo-staging)" -ForegroundColor Yellow }

Write-Host "Done. Open http://${StagingHostOnly}:3000/doors" -ForegroundColor Green
