# Добавляет публичный ключ 1002doors-vm в ~/.ssh/authorized_keys на ВМ.
# Запуск: .\scripts\fix-vm-authorized-keys.ps1
# Если подключаетесь другим ключом (который уже есть на ВМ), задайте его:
#   $env:1002DOORS_SSH_KEY = "путь\к\рабочему_приватному_ключу"
#   $env:1002DOORS_STAGING_HOST = "ubuntu@89.169.181.191"

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\1002doors-vm\id_ed25519" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
$PubKeyPath = if (Test-Path "$KeyPath.pub") { "$KeyPath.pub" } else { Join-Path (Split-Path $KeyPath -Parent) "id_ed25519.pub" }

if (-not (Test-Path $KeyPath)) { Write-Error "Private key not found: $KeyPath"; exit 1 }
if (-not (Test-Path $PubKeyPath)) { Write-Error "Public key not found: $PubKeyPath"; exit 1 }

$pubLine = (Get-Content $PubKeyPath -Raw).Trim()
if ([string]::IsNullOrWhiteSpace($pubLine)) { Write-Error "Public key file is empty"; exit 1 }

Write-Host "Adding key to VM authorized_keys..." -ForegroundColor Cyan
Write-Host "  Host: $StagingHost" -ForegroundColor Gray
Write-Host "  Key:  $KeyPath" -ForegroundColor Gray

# Загружаем публичный ключ на ВМ и добавляем в authorized_keys
$tmpPub = Join-Path $env:TEMP "1002doors-vm.pub"
Set-Content -Path $tmpPub -Value $pubLine -NoNewline
scp -i $KeyPath -o StrictHostKeyChecking=no -o ConnectTimeout=15 $tmpPub "${StagingHost}:~/uploaded_key.pub"
if ($LASTEXITCODE -ne 0) {
    Remove-Item $tmpPub -Force -ErrorAction SilentlyContinue
    Write-Host "SCP failed. Add your key to the VM first, set 1002DOORS_SSH_KEY to that key, then run again." -ForegroundColor Yellow
    exit 1
}
Remove-Item $tmpPub -Force -ErrorAction SilentlyContinue

$remoteCmd = "mkdir -p ~/.ssh; chmod 700 ~/.ssh; grep -Ff ~/uploaded_key.pub ~/.ssh/authorized_keys 2>/dev/null || cat ~/uploaded_key.pub >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys; rm -f ~/uploaded_key.pub; echo OK; cat ~/.ssh/authorized_keys"
ssh -i $KeyPath -o StrictHostKeyChecking=no -o ConnectTimeout=15 $StagingHost $remoteCmd
if ($LASTEXITCODE -ne 0) {
    Write-Host "SSH failed. If Permission denied: add your working key to the VM first, then set 1002DOORS_SSH_KEY to that key and run this script again." -ForegroundColor Yellow
    exit 1
}
Write-Host "Done. You can now connect with: ssh -i `"$KeyPath`" $StagingHost" -ForegroundColor Green
