# Деплой правки complete-data (цвета из PropertyPhoto первыми) на staging, пересборка, перезапуск и сброс кэша.
# Запуск: .\scripts\deploy-complete-data-fix-and-refresh.ps1  [ -SkipBuild — только залить файл, сборку выполнить на ВМ вручную ]

param([switch]$SkipBuild = $false)
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) { $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..") }
$KeyPath = "C:\Users\petr2\.ssh\ssh-key-1773410153319\ssh-key-1773410153319"
$StagingHost = "ubuntu@178.154.244.83"
$RemotePath = "~/1002doors"

if (-not (Test-Path $KeyPath)) {
    Write-Host "SSH key not found: $KeyPath" -ForegroundColor Red
    exit 1
}

$routeFile = Join-Path $ProjectRoot "app\api\catalog\doors\complete-data\route.ts"
if (-not (Test-Path $routeFile)) {
    Write-Host "File not found: $routeFile" -ForegroundColor Red
    exit 1
}

Write-Host "1. Uploading complete-data route..." -ForegroundColor Cyan
scp -i $KeyPath -o StrictHostKeyChecking=no "$routeFile" "${StagingHost}:${RemotePath}/app/api/catalog/doors/complete-data/route.ts"
if ($LASTEXITCODE -ne 0) { Write-Host "SCP failed" -ForegroundColor Red; exit 1 }

if (-not $SkipBuild) {
    Write-Host "2. Building on VM (next build)..." -ForegroundColor Cyan
    $buildCmd = 'cd ~/1002doors && npm run build 2>&1'
    ssh -i $KeyPath -T -o StrictHostKeyChecking=no -o ConnectTimeout=300 $StagingHost ('bash --norc --noprofile -c ' + [char]39 + $buildCmd + [char]39)
    if ($LASTEXITCODE -ne 0) { Write-Host "Build failed (check output above)" -ForegroundColor Red; exit 1 }
} else {
    Write-Host "2. SkipBuild: сборку выполните на ВМ вручную (cd ~/1002doors && npm run build)" -ForegroundColor Yellow
}

Write-Host "3. Restarting app..." -ForegroundColor Cyan
$restartOneLiner = 'cd ~/1002doors && (systemctl is-active --quiet domeo-staging 2>/dev/null && sudo systemctl restart domeo-staging || (pkill -f "node.*next" 2>/dev/null; sleep 2; NODE_ENV=production nohup npx next start -H 0.0.0.0 -p 3000 > /tmp/domeo.log 2>&1 &)); sleep 5'
ssh -i $KeyPath -T -o StrictHostKeyChecking=no -o ConnectTimeout=25 $StagingHost ('bash --norc --noprofile -c ' + [char]39 + $restartOneLiner + [char]39)
if ($LASTEXITCODE -ne 0) { Write-Host "Restart failed" -ForegroundColor Yellow }

Write-Host "4. Clearing complete-data cache..." -ForegroundColor Cyan
$refreshOut = ssh -i $KeyPath -T -o StrictHostKeyChecking=no -o ConnectTimeout=15 $StagingHost "bash --norc --noprofile -c 'curl -s http://localhost:3000/api/catalog/doors/complete-data/refresh'" 2>&1
Write-Host $refreshOut

Write-Host "Done. Open http://178.154.244.83:3000/doors (with ?refresh=1 to bypass browser cache)" -ForegroundColor Green
