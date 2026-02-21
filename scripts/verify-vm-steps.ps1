# Проверка шагов настройки ВМ (после A1–A3 и при необходимости C4).
# Запуск из корня проекта: .\scripts\verify-vm-steps.ps1
# Опция -CheckPort: проверить, что на ВМ слушается порт 3000 (требует SSH).

param([switch]$CheckPort = $false)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
$RemotePath = if ($env:1002DOORS_STAGING_REMOTE_PATH) { $env:1002DOORS_STAGING_REMOTE_PATH } else { "~/domeo-app" }
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ConnectTimeout=10")

function Ok { param($s) Write-Host "  OK: $s" -ForegroundColor Green }
function Fail { param($s) Write-Host "  FAIL: $s" -ForegroundColor Red }
function Warn { param($s) Write-Host "  -- $s" -ForegroundColor Gray }

Write-Host "Verify VM setup (from $ProjectRoot)" -ForegroundColor Cyan
Write-Host ""

# A1 — ключ
Write-Host "[A1] SSH key" -ForegroundColor Cyan
if (Test-Path $KeyPath) { Ok "Key file exists: $KeyPath" } else { Fail "Key not found: $KeyPath"; exit 1 }
Write-Host ""

# A2 — хост
Write-Host "[A2] Host and path" -ForegroundColor Cyan
Warn "Host: $StagingHost"
Warn "Path: $RemotePath"
Write-Host ""

# A3 — SSH
Write-Host "[A3] SSH connection" -ForegroundColor Cyan
$sshOut = & ssh -i $KeyPath @SshOpts $StagingHost "echo OK" 2>&1
if ($LASTEXITCODE -eq 0 -and $sshOut -match "OK") { Ok "SSH OK" } else { Fail "SSH failed. Output: $sshOut"; exit 1 }
Write-Host ""

# A4 — rsync
Write-Host "[A4] rsync (optional)" -ForegroundColor Cyan
if (Get-Command rsync -ErrorAction SilentlyContinue) { Ok "rsync found" } else { Warn "rsync not found (sync will use tar+scp)" }
Write-Host ""

if ($CheckPort) {
    Write-Host "[C4] Port 3000 on VM" -ForegroundColor Cyan
    $portOut = & ssh -i $KeyPath @SshOpts $StagingHost "ss -tlnp 2>/dev/null | grep -E '3000|LISTEN'" 2>&1
    if ($portOut -match "3000") { Ok "Port 3000 is in use (next dev likely running)" } else { Warn "Port 3000 not listening. Start dev: .\scripts\start-vm-dev.ps1" }
    Write-Host ""
}

Write-Host "Done. Next: Part B on VM, then Part C (sync-and-run-vm.ps1)." -ForegroundColor Green
