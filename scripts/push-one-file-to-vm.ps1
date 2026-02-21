# Копирование одного изменённого файла на ВМ (для режима next dev на ВМ).
# На ВМ должен быть развёрнут полный репо и запущен `npm run dev` — тогда Next пересоберёт файл за секунды.
#
# Запуск: .\scripts\push-one-file-to-vm.ps1 <путь к файлу от корня проекта>
# Пример: .\scripts\push-one-file-to-vm.ps1 app\api\catalog\hardware\route.ts
#
# Env: 1002DOORS_SSH_KEY, 1002DOORS_STAGING_HOST, 1002DOORS_STAGING_REMOTE_PATH (каталог проекта на ВМ, по умолчанию ~/domeo-app)

param([Parameter(Mandatory=$true)][string]$FilePath)
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) { $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..") }

$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
$RemotePath = if ($env:1002DOORS_STAGING_REMOTE_PATH) { $env:1002DOORS_STAGING_REMOTE_PATH } else { "~/domeo-app" }
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15")

$localFull = Join-Path $ProjectRoot $FilePath
if (-not (Test-Path $localFull)) {
    Write-Host "File not found: $localFull" -ForegroundColor Red
    exit 1
}
$remoteDir = (Split-Path $FilePath -Parent) -replace '\\', '/'
$remoteFull = "$RemotePath/$($FilePath -replace '\\','/')"
$dest = "${StagingHost}:$remoteFull"
Write-Host "Pushing $FilePath -> $dest" -ForegroundColor Cyan
if ($remoteDir) {
    $remoteDirFull = "$RemotePath/$remoteDir"
    & ssh -i $KeyPath @SshOpts $StagingHost "mkdir -p `"$remoteDirFull`""
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to create remote directory." -ForegroundColor Red
        exit 1
    }
}
& scp -i $KeyPath @SshOpts $localFull $dest
if ($LASTEXITCODE -ne 0) {
    Write-Host "scp failed. Is VM reachable? Does remote path $RemotePath exist?" -ForegroundColor Red
    exit 1
}
Write-Host "Done. Next dev on VM should reload in a few seconds." -ForegroundColor Green
