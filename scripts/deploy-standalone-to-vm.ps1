# Деплой артефактом: сборка только на вашей машине, на ВМ — только запуск готового билда.
# На ВМ НЕ выполняется npm install/npm ci — нет скриптов пакетов и массовой загрузки, нет риска трафика и потери SSH.
#
# Запуск: .\scripts\deploy-standalone-to-vm.ps1
# Требуется: 1002DOORS_SSH_KEY и 1002DOORS_STAGING_HOST в окружении (см. docs/DEPLOY_STANDALONE_ARTIFACT.md).
#
# В сборку входят: public/ (в т.ч. public/uploads при наличии), prisma/schema.prisma + migrations, Prisma CLI.
# После распаковки на ВМ выполняется prisma migrate deploy (применение миграций БД).
#
# Опционально: 1002DOORS_UPLOADS_PATH — путь к папке с фото (final-filled, products и т.д.); её содержимое
# копируется в public/uploads артефакта (если папка с фото лежит отдельно от проекта).
#
# Первый раз на ВМ: установите Node.js, создайте ~/domeo-app, .env и systemd-юнит (см. docs/DEPLOY_STANDALONE_ARTIFACT.md).
# -SkipBuild: не собирать локально, загрузить уже имеющийся .next/standalone (если есть).
# -BuildOnly: только сборка и упаковка артефакта (без SSH/загрузки), архив в scripts/output/domeo-standalone.tar.gz
# -AppOnly: точечный деплой — в архив не входят public/uploads; на ВМ при распаковке сохраняем существующие uploads.
#   Удобно после правок кода: правим локально, тестируете, затем один раз выкатываете только приложение.
# -Rsync: вместо tar+scp загружать только изменённые файлы (дельта). Сборка локально как обычно, на ВМ — rsync.
#   Требуется rsync в PATH (например Git for Windows). Быстрее при мелких правках.
# -Stream: передача архива по pipe через SSH (tar | ssh tar -xzf -), без scp; иногда устойчивее при нестабильном канале.

param([switch]$SkipBuild = $false, [switch]$BuildOnly = $false, [switch]$AppOnly = $false, [switch]$Rsync = $false, [switch]$Stream = $false)
$ErrorActionPreference = "Stop"
$Script:OriginalErrorAction = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) { $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..") }

# По умолчанию — рабочая машина 89.169.181.191 (ключ ssh-key-1771526730154). Для тестовой ВМ 130.193.62.116: .\scripts\set-test-vm-env.ps1
$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
$StagingHostOnly = if ($StagingHost -match '@') { $StagingHost.Split('@')[1] } else { $StagingHost }
$RemoteAppPath = "~/domeo-app"
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=6")

if (-not $BuildOnly -and -not (Test-Path $KeyPath)) {
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

# 4) Копируем public, .next/static, .prisma и опционально uploads (фото), prisma (миграции)
$standaloneNext = Join-Path $standalonePath ".next"
if (-not (Test-Path $standaloneNext)) { New-Item -ItemType Directory -Path $standaloneNext -Force | Out-Null }
# Копируем содержимое .next/static в standalone/.next/static (без лишнего вложенного static/)
$staticDest = Join-Path $standaloneNext "static"
if (-not (Test-Path $staticDest)) { New-Item -ItemType Directory -Path $staticDest -Force | Out-Null }
Copy-Item -Path (Join-Path $ProjectRoot ".next\static\*") -Destination $staticDest -Recurse -Force -ErrorAction SilentlyContinue
# Копируем содержимое public в standalone/public (включая public/uploads, если есть)
$publicDest = Join-Path $standalonePath "public"
if (-not (Test-Path $publicDest)) { New-Item -ItemType Directory -Path $publicDest -Force | Out-Null }
Copy-Item -Path (Join-Path $ProjectRoot "public\*") -Destination $publicDest -Recurse -Force -ErrorAction SilentlyContinue
# Опционально: папка с фото из другого пути (1002DOORS_UPLOADS_PATH → public/uploads). При -AppOnly не подмешиваем.
$uploadsSource = $env:1002DOORS_UPLOADS_PATH
if (-not $AppOnly -and $uploadsSource -and (Test-Path $uploadsSource)) {
    Write-Host "   Adding uploads from: $uploadsSource" -ForegroundColor Yellow
    $uploadsDest = Join-Path $publicDest "uploads"
    if (-not (Test-Path $uploadsDest)) { New-Item -ItemType Directory -Path $uploadsDest -Force | Out-Null }
    Copy-Item -Path (Join-Path $uploadsSource "*") -Destination $uploadsDest -Recurse -Force -ErrorAction SilentlyContinue
}
if ($AppOnly) {
    Write-Host "   AppOnly: excluding public/uploads from artifact (VM keeps existing uploads)" -ForegroundColor Yellow
    $uploadsInStandalone = Join-Path $publicDest "uploads"
    if (Test-Path $uploadsInStandalone) {
        Remove-Item -Path (Join-Path $uploadsInStandalone "*") -Recurse -Force -ErrorAction SilentlyContinue
    }
}
$standaloneNodeModules = Join-Path $standalonePath "node_modules"
if (Test-Path (Join-Path $ProjectRoot "node_modules\.prisma")) {
    if (-not (Test-Path $standaloneNodeModules)) { New-Item -ItemType Directory -Path $standaloneNodeModules -Force | Out-Null }
    Copy-Item -Path (Join-Path $ProjectRoot "node_modules\.prisma") -Destination (Join-Path $standaloneNodeModules ".prisma") -Recurse -Force -ErrorAction SilentlyContinue
}
# Prisma: schema + migrations для prisma migrate deploy на ВМ
$prismaDest = Join-Path $standalonePath "prisma"
if (-not (Test-Path $prismaDest)) { New-Item -ItemType Directory -Path $prismaDest -Force | Out-Null }
if (Test-Path (Join-Path $ProjectRoot "prisma\schema.prisma")) {
    Copy-Item -Path (Join-Path $ProjectRoot "prisma\schema.prisma") -Destination $prismaDest -Force -ErrorAction SilentlyContinue
}
if (Test-Path (Join-Path $ProjectRoot "prisma\migrations")) {
    $migrationsDest = Join-Path $prismaDest "migrations"
    if (Test-Path $migrationsDest) { Remove-Item -Path $migrationsDest -Recurse -Force -ErrorAction SilentlyContinue }
    Copy-Item -Path (Join-Path $ProjectRoot "prisma\migrations") -Destination $migrationsDest -Recurse -Force -ErrorAction SilentlyContinue
}
if (Test-Path (Join-Path $ProjectRoot "node_modules\prisma")) {
    if (-not (Test-Path $standaloneNodeModules)) { New-Item -ItemType Directory -Path $standaloneNodeModules -Force | Out-Null }
    Copy-Item -Path (Join-Path $ProjectRoot "node_modules\prisma") -Destination (Join-Path $standaloneNodeModules "prisma") -Recurse -Force -ErrorAction SilentlyContinue
}
$outputDir = Join-Path $ProjectRoot "scripts\output"
if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir -Force | Out-Null }

# Rsync: ищем в PATH или в типичных путях Git for Windows
$rsyncPath = $null
if ($Rsync) {
    $rsyncCmd = Get-Command rsync -ErrorAction SilentlyContinue
    if ($rsyncCmd) {
        $rsyncPath = $rsyncCmd.Source
    }
    if (-not $rsyncPath -and $env:1002DOORS_RSYNC_PATH -and (Test-Path $env:1002DOORS_RSYNC_PATH)) {
        $rsyncPath = $env:1002DOORS_RSYNC_PATH
    }
    if (-not $rsyncPath) {
        $gitUsrBins = @(
            "C:\Program Files\Git\usr\bin\rsync.exe",
            "C:\Program Files (x86)\Git\usr\bin\rsync.exe",
            "$env:LOCALAPPDATA\Programs\Git\usr\bin\rsync.exe"
        )
        foreach ($p in $gitUsrBins) {
            if ($p -and (Test-Path $p)) { $rsyncPath = $p; break }
        }
    }
    if (-not $rsyncPath) {
        $wslRsync = $false
        try {
            $null = wsl which rsync 2>$null
            if ($LASTEXITCODE -eq 0) { $wslRsync = $true; $rsyncPath = 'wsl' }
        } catch { }
        if (-not $wslRsync) {
            Write-Host 'rsync not found. Options:' -ForegroundColor Yellow
            Write-Host '  1) Install Git for Windows. Or set 1002DOORS_RSYNC_PATH.' -ForegroundColor Gray
            Write-Host '  Using tar+scp (full archive) for this run.' -ForegroundColor Yellow
            $Rsync = $false
        }
    }
}
$useWslRsync = ($Rsync -and $rsyncPath -eq 'wsl')
if ($Rsync) {
    if ($BuildOnly) {
        Write-Host "BuildOnly: standalone ready at $standalonePath. Run without -BuildOnly and with -Rsync to sync to VM." -ForegroundColor Green
        Pop-Location
        exit 0
    }
    Write-Host '4. Syncing to VM (rsync, only changed files).' -ForegroundColor Yellow
    $rsyncUsed = if ($useWslRsync) { 'WSL rsync' } else { $rsyncPath }; Write-Host ('   Using: ' + $rsyncUsed) -ForegroundColor Gray
    & ssh -i $KeyPath @SshOpts -o ConnectTimeout=10 $StagingHost ('mkdir -p ' + $RemoteAppPath) 2>$null
    # Исключаем из передачи: .env и (при -AppOnly) public/uploads
    $rsyncExcludes = @('--exclude=.env')
    if ($AppOnly) { $rsyncExcludes += '--exclude=public/uploads' }
    # Защита на ВМ: при --delete не удалять .env и public/uploads (оставляем как есть на сервере)
    $rsyncFilters = @('--filter=P .env', '--filter=P .env/')
    if ($AppOnly) { $rsyncFilters += '--filter=P public/uploads/' }
    $rsyncBase = @('-avz', '--delete', '--times', '--no-perms', '--no-owner', '--no-group') + $rsyncExcludes + $rsyncFilters
    if ($useWslRsync) {
        $winPath = $standalonePath.TrimEnd('\', '/').Replace('\', '/')
        if ($winPath -match '^([A-Za-z]):(.+)$') {
            $drive = $Matches[1].ToLower()
            $rest = $Matches[2].TrimStart('/').TrimStart('\')
            $rsyncSrc = "/mnt/$drive/" + $rest + "/"
        } else { $rsyncSrc = $winPath + "/" }
        $keyWsl = $KeyPath.Replace('\', '/')
        if ($keyWsl -match '^([A-Za-z]):(.+)$') {
            $d = $Matches[1].ToLower()
            $keyWsl = "/mnt/$d/" + $Matches[2].TrimStart('/').TrimStart('\')
        }
        $rsyncDest = $StagingHost + ':' + $RemoteAppPath + '/'
        $wslKeyTmp = '/tmp/domeo-deploy-key-' + [System.IO.Path]::GetFileName($KeyPath)
        wsl bash -c ("cp '" + $keyWsl + "' '" + $wslKeyTmp + "' && chmod 600 '" + $wslKeyTmp + "'") 2>$null
        $sshCmd = 'ssh -i ' + $wslKeyTmp + ' -o StrictHostKeyChecking=no -o ServerAliveInterval=15 -o ConnectTimeout=30'
        $rsyncArgs = $rsyncBase + @('-e', $sshCmd, $rsyncSrc, $rsyncDest)
        try { & wsl rsync @rsyncArgs 2>&1 | Out-Host } catch { }
        wsl rm -f $wslKeyTmp 2>$null
        $rc = $LASTEXITCODE
        if ($null -eq $rc) { $rc = 0 }
        if ($rc -ne 0) { $LASTEXITCODE = $rc }
    } else {
        $rsyncSrc = $standalonePath.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
        $rsyncDest = $StagingHost + ':' + $RemoteAppPath + '/'
        $sshCmd = 'ssh -i "' + $KeyPath + '" -o StrictHostKeyChecking=no -o ServerAliveInterval=15 -o ConnectTimeout=30'
        $rsyncArgs = $rsyncBase + @('-e', $sshCmd, $rsyncSrc, $rsyncDest)
        & $rsyncPath @rsyncArgs 2>&1
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'rsync failed. Check PATH or WSL. Fallback: run without -Rsync.' -ForegroundColor Red
        Pop-Location
        exit 1
    }
    Write-Host '   Sync done.' -ForegroundColor Gray
} else {
    # 5) Создаём архив (содержимое standalone в корне архива)
    $archivePath = Join-Path $outputDir "domeo-standalone.tar.gz"
    Write-Host "4. Creating archive..." -ForegroundColor Yellow
    & tar -czf $archivePath -C $standalonePath --exclude=".env" . 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Host "tar failed." -ForegroundColor Red; Pop-Location; exit 1 }
    $sizeMB = [math]::Round((Get-Item $archivePath).Length / 1MB, 1)
    Write-Host "   Archive: $sizeMB MB" -ForegroundColor Gray

    if ($BuildOnly) {
        Write-Host "BuildOnly: artifact ready at $archivePath. Run without -BuildOnly when VM is reachable." -ForegroundColor Green
        Pop-Location
        exit 0
    }

    if ($Stream) {
        Write-Host "5. Streaming archive to VM (tar | ssh)..." -ForegroundColor Yellow
        $ErrorActionPreference = "Continue"
        if ($AppOnly) {
            $remoteCmd = "mkdir -p $RemoteAppPath && cd $RemoteAppPath && rm -rf .uploads.bak && (test -d public/uploads && mv public/uploads .uploads.bak || true) && tar -xzf - && (test -d .uploads.bak && mv .uploads.bak public/uploads || mkdir -p public/uploads) && echo EXTRACT_OK"
        } else {
            $remoteCmd = "mkdir -p $RemoteAppPath && cd $RemoteAppPath && tar -xzf - && echo EXTRACT_OK"
        }
        & tar -czf - -C $standalonePath --exclude=".env" . 2>$null | & ssh -i $KeyPath @SshOpts -o ServerAliveInterval=5 -o ConnectTimeout=600 $StagingHost $remoteCmd 2>&1
        $ErrorActionPreference = $Script:OriginalErrorAction
        Remove-Item $archivePath -Force -ErrorAction SilentlyContinue
        if ($LASTEXITCODE -ne 0) { Write-Host "Stream deploy failed. Try without -Stream or use -Rsync (Git for Windows)." -ForegroundColor Red; Pop-Location; exit 1 }
    } else {
        Write-Host "5. Uploading archive to VM..." -ForegroundColor Yellow
        $ErrorActionPreference = "Continue"
        & ssh -i $KeyPath @SshOpts -o ConnectTimeout=10 $StagingHost "mkdir -p $RemoteAppPath" 2>$null
        $ScpDest = $StagingHost + ':' + $RemoteAppPath + '/domeo-standalone.tar.gz'
        $scpAttempts = 2
        $scpOk = $false
        for ($a = 1; $a -le $scpAttempts; $a++) {
            if ($a -gt 1) { Write-Host "   Retry $a of $scpAttempts..." -ForegroundColor Yellow }
            & scp -i $KeyPath @SshOpts -o ServerAliveInterval=5 $archivePath $ScpDest 2>&1
            if ($LASTEXITCODE -eq 0) { $scpOk = $true; break }
            if ($a -lt $scpAttempts) { Start-Sleep -Seconds 3 }
        }
        $ErrorActionPreference = $Script:OriginalErrorAction
        if (-not $scpOk) { Write-Host "scp failed. Try -Stream or -Rsync (Git for Windows)." -ForegroundColor Red; Remove-Item $archivePath -Force -ErrorAction SilentlyContinue; Pop-Location; exit 1 }

        Write-Host "   Extracting on VM." -ForegroundColor Yellow
        if ($AppOnly) {
            $extractCmd = 'cd ' + $RemoteAppPath + ' && rm -rf .uploads.bak && (test -d public/uploads && mv public/uploads .uploads.bak || true) && tar -xzf domeo-standalone.tar.gz && rm -f domeo-standalone.tar.gz && (test -d .uploads.bak && mv .uploads.bak public/uploads || mkdir -p public/uploads) && echo EXTRACT_OK'
        } else {
            $extractCmd = 'cd ' + $RemoteAppPath + ' && tar -xzf domeo-standalone.tar.gz && rm -f domeo-standalone.tar.gz && echo EXTRACT_OK'
        }
        $ErrorActionPreference = "Continue"
        & ssh -i $KeyPath @SshOpts -o ConnectTimeout=120 $StagingHost $extractCmd 2>&1 | Out-Null
        $ErrorActionPreference = $Script:OriginalErrorAction
        if ($LASTEXITCODE -ne 0) { Write-Host "Extract on VM failed." -ForegroundColor Red; Pop-Location; exit 1 }
        Remove-Item $archivePath -Force -ErrorAction SilentlyContinue
    }
}

# 6b) Применение миграций БД на ВМ (если в артефакте есть prisma)
$migrateCmd = 'cd ' + $RemoteAppPath + ' && ( [ -f .env ] && export $(grep -v ''^#'' .env | xargs) ); [ -f node_modules/prisma/build/index.js ] && node node_modules/prisma/build/index.js migrate deploy 2>&1 || true'
Write-Host '   Running DB migrations on VM.' -ForegroundColor Yellow
$ErrorActionPreference = "Continue"
& ssh -i $KeyPath @SshOpts -o ConnectTimeout=60 $StagingHost $migrateCmd 2>&1 | Out-Null
$ErrorActionPreference = $Script:OriginalErrorAction

# Перезапуск приложения (standalone: node server.js)
if ($Rsync) { Write-Host '5. ' -NoNewline } else { Write-Host '6. ' -NoNewline }
Write-Host 'Restarting app on VM.' -ForegroundColor Yellow
$restartCmd = 'sudo systemctl restart domeo-standalone 2>/dev/null || (pkill -f node.*server.js 2>/dev/null; sleep 2; cd ' + $RemoteAppPath + ' && NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 nohup node server.js > /tmp/domeo.log 2>&1 &)'
$ErrorActionPreference = 'Continue'
& ssh -i $KeyPath @SshOpts -o ConnectTimeout=15 $StagingHost $restartCmd 2>&1 | Out-Null
$ErrorActionPreference = $Script:OriginalErrorAction

Pop-Location

Write-Host ('Done. App: http://' + $StagingHostOnly + ':3000') -ForegroundColor Green
Write-Host 'On VM no npm install was run; no package scripts, no extra traffic from dependencies.' -ForegroundColor Gray
if ($AppOnly) {
    Write-Host "" -ForegroundColor Gray
    Write-Host 'AppOnly: uploads not in archive. Run: .\scripts\sync-uploads-to-vm.ps1' -ForegroundColor Yellow
    Write-Host '  Source: public/uploads or 1002DOORS_UPLOADS_PATH. See docs/VM_APPLY_PUSHED_FILES.md' -ForegroundColor Gray
}
