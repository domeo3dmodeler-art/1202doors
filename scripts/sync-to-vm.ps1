# Быстрая синхронизация локального кода с ВМ (только изменённые файлы).
# Требуется rsync (установите Git for Windows — в PATH появится rsync).
# После sync на ВМ версия = локальная. Дальше: start-vm-dev.ps1 и push-one-file для правок.
#
# Запуск: .\scripts\sync-to-vm.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) { $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..") }

$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
$RemotePath = if ($env:1002DOORS_STAGING_REMOTE_PATH) { $env:1002DOORS_STAGING_REMOTE_PATH } else { "~/domeo-app" }

$rsyncCmd = Get-Command rsync -ErrorAction SilentlyContinue
if (-not $rsyncCmd) {
    Write-Host "rsync not found. Install Git for Windows (https://git-scm.com) — rsync will be in PATH." -ForegroundColor Red
    Write-Host "One-time full sync without rsync: .\scripts\sync-full-sources-to-vm.ps1" -ForegroundColor Yellow
    exit 1
}

Write-Host "Syncing to VM (rsync, only changed files)..." -ForegroundColor Cyan
$excludes = @('--exclude=node_modules', '--exclude=.next', '--exclude=.git', '--exclude=public/uploads', '--exclude=.env')
$src = $ProjectRoot.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
$dest = $StagingHost + ":" + $RemotePath.TrimEnd('/') + "/"
& rsync -avz @excludes -e "ssh -i `"$KeyPath`" -o StrictHostKeyChecking=no -o ServerAliveInterval=15 -o ConnectTimeout=15" $src $dest
if ($LASTEXITCODE -ne 0) { Write-Host "Sync failed." -ForegroundColor Red; exit 1 }
Write-Host "Done. Start dev on VM: .\scripts\start-vm-dev.ps1" -ForegroundColor Green
