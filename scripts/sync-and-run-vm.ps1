# Один скрипт: синхронизация локального кода на ВМ и запуск next dev.
# Локально правите код → запускаете этот скрипт → на ВМ сразу dev. Дальше правки через push-one-file-to-vm.ps1.
#
# Запуск:
#   .\scripts\sync-and-run-vm.ps1              # полный цикл: stop prod, sync, [install], nginx, start dev
#   .\scripts\sync-and-run-vm.ps1 -SyncOnly    # только синхронизация (без install, без start)
#   .\scripts\sync-and-run-vm.ps1 -NoInstall   # sync + start dev без npm install (если зависимости не менялись)
#   .\scripts\sync-and-run-vm.ps1 -NoNginx     # не применять nginx (если уже применён)
#
# Env: 1002DOORS_SSH_KEY, 1002DOORS_STAGING_HOST, 1002DOORS_STAGING_REMOTE_PATH

param(
    [switch]$SyncOnly = $false,
    [switch]$NoInstall = $false,
    [switch]$NoNginx = $false
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) { $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..") }

$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
$RemotePath = if ($env:1002DOORS_STAGING_REMOTE_PATH) { $env:1002DOORS_STAGING_REMOTE_PATH } else { "~/domeo-app" }
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ConnectTimeout=15")

function Write-Step { param($N, $Msg) Write-Host "[$N] $Msg" -ForegroundColor Cyan }
function Write-Ok   { param($Msg) Write-Host "    $Msg" -ForegroundColor Green }
function Write-Warn { param($Msg) Write-Host "    $Msg" -ForegroundColor Yellow }
function Write-Err  { param($Msg) Write-Host "    $Msg" -ForegroundColor Red }

# --- 1. SSH ---
Write-Step 1 "Checking SSH to $StagingHost..."
$sshTest = & ssh -i $KeyPath @SshOpts $StagingHost "echo OK" 2>&1
if ($LASTEXITCODE -ne 0 -or $sshTest -notmatch "OK") {
    Write-Err "SSH failed. Check: key $KeyPath, host $StagingHost, firewall."
    exit 1
}
Write-Ok "SSH OK"

# --- 2. Stop production (free port 3000) ---
if (-not $SyncOnly) {
    Write-Step 2 "Stopping production on VM..."
    & (Join-Path $PSScriptRoot "stop-vm-production.ps1") 2>&1 | Out-Null
    Start-Sleep -Seconds 2
    Write-Ok "Port 3000 should be free."
}

# --- 3. Sync sources ---
Write-Step 3 "Syncing sources to VM..."
$rsyncCmd = Get-Command rsync -ErrorAction SilentlyContinue
if ($rsyncCmd) {
    $excludes = @('--exclude=node_modules', '--exclude=.next', '--exclude=.git', '--exclude=public/uploads', '--exclude=.env')
    $src = $ProjectRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    $dest = $StagingHost + ":" + $RemotePath.TrimEnd('/') + "/"
    & rsync -avz @excludes -e "ssh -i `"$KeyPath`" -o StrictHostKeyChecking=no -o ServerAliveInterval=15 -o ConnectTimeout=15" $src $dest
} else {
    & (Join-Path $PSScriptRoot "sync-full-sources-to-vm.ps1")
}
if ($LASTEXITCODE -ne 0) {
    Write-Err "Sync failed."
    exit 1
}
Write-Ok "Sync done."

if ($SyncOnly) {
    Write-Host ""
    Write-Host "SyncOnly: done. To start dev: .\scripts\start-vm-dev.ps1" -ForegroundColor Cyan
    exit 0
}

# --- 4. npm install on VM (optional) ---
if (-not $NoInstall) {
    Write-Step 4 "Running npm install on VM (may take 1-2 min, SSH can timeout)..."
    $prevErrAction = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & ssh -i $KeyPath @SshOpts $StagingHost "cd $RemotePath && npm install --include=dev" 2>&1 | Out-Host
    } finally {
        $ErrorActionPreference = $prevErrAction
    }
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "npm install failed or timed out. On VM run in screen: cd $RemotePath && npm install --include=dev"
    } else {
        Write-Ok "npm install done."
    }
} else {
    Write-Step 4 "Skipping npm install (NoInstall)."
}

# --- 5. Nginx (optional) ---
if (-not $NoNginx) {
    Write-Step 5 "Applying Nginx config..."
    & (Join-Path $PSScriptRoot "apply-nginx-to-vm.ps1") 2>&1
    if ($LASTEXITCODE -ne 0) { Write-Warn "Nginx apply failed. Run: .\scripts\apply-nginx-to-vm.ps1" }
    else { Write-Ok "Nginx applied." }
} else {
    Write-Step 5 "Skipping Nginx (NoNginx)."
}

# --- 6. Start next dev ---
Write-Step 6 "Starting next dev on VM..."
$startCmd = "cd $RemotePath && mkdir -p logs && (pkill -f 'next dev' 2>/dev/null; true) && nohup npx next dev -p 3000 -H 0.0.0.0 >> logs/next-dev.log 2>&1 &"
& ssh -i $KeyPath @SshOpts $StagingHost $startCmd
Start-Sleep -Seconds 2
if ($LASTEXITCODE -eq 0) {
    Write-Ok "next dev started in background."
} else {
    Write-Warn "Start command failed. On VM run: cd $RemotePath && npm run dev"
}

Write-Host ""
Write-Host "--- Next steps ---" -ForegroundColor Green
Write-Host "  Open:  http://89.169.181.191  (or your VM host)" -ForegroundColor White
Write-Host "  Logs:  ssh ... 'tail -f $RemotePath/logs/next-dev.log'" -ForegroundColor White
Write-Host "  Edit:  change file locally, then:" -ForegroundColor White
Write-Host "         .\scripts\push-one-file-to-vm.ps1 app\path\to\file.ts" -ForegroundColor Cyan
Write-Host ""
