# Синхронизация только папки с фото ручек (04_Ручки_Завертки) на ВМ.
# Используйте, если на ВМ часть ручек без фото — локально файлы есть, на ВМ нет или другие имена.
#
# Требуется: 1002DOORS_SSH_KEY, 1002DOORS_STAGING_HOST (по умолчанию ubuntu@89.169.181.191)
# Запуск: .\scripts\sync-handle-photos-to-vm.ps1

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "$env:USERPROFILE\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
$RemoteAppPath = "~/domeo-app"
$LocalHandles = Join-Path $ProjectRoot "public\uploads\final-filled\04_Ручки_Завертки"

if (-not (Test-Path $LocalHandles)) {
    Write-Host "Папка не найдена: $LocalHandles" -ForegroundColor Red
    exit 1
}
if (-not (Test-Path $KeyPath)) {
    Write-Host "SSH ключ не найден: $KeyPath. Задайте 1002DOORS_SSH_KEY." -ForegroundColor Red
    exit 1
}

$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ConnectTimeout=15")
Write-Host "Синхронизация фото ручек на ВМ ($StagingHost)..." -ForegroundColor Cyan
$RemoteUploads = "${RemoteAppPath}/public/uploads/final-filled"
$RemoteHandles = "${RemoteUploads}/04_Ручки_Завертки"
# Создать родительские папки на ВМ, затем скопировать содержимое папки ручек
& ssh -i $KeyPath @SshOpts $StagingHost "mkdir -p $RemoteHandles"
& scp -i $KeyPath @SshOpts -r "${LocalHandles}\*" "${StagingHost}:${RemoteHandles}/"
if ($LASTEXITCODE -ne 0) {
    Write-Host "scp не удался." -ForegroundColor Red
    exit 1
}
Write-Host "Done. Handle photos copied to ${StagingHost}:${RemoteHandles}" -ForegroundColor Green
Write-Host "To fix DB URLs on VM: use tunnel + npx tsx scripts/fix-handle-photo-paths.ts (see docs/HANDLES_PHOTOS.md)" -ForegroundColor Gray
