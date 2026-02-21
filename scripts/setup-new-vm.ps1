# Первичная настройка новой ВМ под деплой standalone: Node 20, PostgreSQL, каталоги, .env, systemd.
# Запуск: .\scripts\setup-new-vm.ps1
# Использует те же 1002DOORS_SSH_KEY и 1002DOORS_STAGING_HOST, что и deploy-standalone-to-vm.ps1.

$ErrorActionPreference = "Stop"
$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771392782781\ssh-key-1771392782781" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
$SshOpts = @("-o", "StrictHostKeyChecking=no", "-o", "ServerAliveInterval=15", "-o", "ConnectTimeout=15")

if (-not (Test-Path $KeyPath)) {
    Write-Host "SSH key not found: $KeyPath" -ForegroundColor Red
    exit 1
}

# Пароль БД и JWT для staging (совпадают с scripts/staging.env и типовой настройкой)
$DbPass = "d0me0Stag1ngPg2025"
$JwtSecret = "domeo-staging-jwt-secret-min-32-chars-here"

Write-Host "Testing SSH to $StagingHost..." -ForegroundColor Cyan
$test = ssh -i $KeyPath @SshOpts $StagingHost "echo OK" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "SSH failed. Check: key path, VM is running, security group allows port 22, key added to VM metadata." -ForegroundColor Red
    Write-Host $test
    exit 1
}
Write-Host "SSH OK." -ForegroundColor Green

# Определяем имя пользователя на ВМ (ubuntu или из StagingHost)
$VmUser = if ($StagingHost -match '@') { $StagingHost.Split('@')[0] } else { "ubuntu" }
$HomeDir = "/home/$VmUser"

$remoteScript = @"
set -e
echo '=== 1. Node.js 20 ==='
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v

echo '=== 2. PostgreSQL ==='
sudo apt-get update -qq
sudo apt-get install -y -qq postgresql postgresql-contrib
sudo -u postgres createuser -s domeo_user 2>/dev/null || true
sudo -u postgres psql -c "ALTER USER domeo_user WITH PASSWORD '$DbPass';" 2>/dev/null || true
sudo -u postgres createdb -O domeo_user domeo 2>/dev/null || true
echo 'PostgreSQL ready.'

echo '=== 3. Dirs and .env ==='
mkdir -p ~/domeo-app ~/1002doors
cat > ~/domeo-app/.env << 'ENVEOF'
DATABASE_URL="postgresql://domeo_user:${DbPass}@localhost:5432/domeo?schema=public"
NODE_ENV=production
JWT_SECRET=$JwtSecret
ENVEOF

echo '=== 4. Systemd unit ==='
sudo tee /etc/systemd/system/domeo-standalone.service << 'SVCEOF'
[Unit]
Description=Domeo 1002doors (standalone)
After=network.target postgresql.service

[Service]
Type=simple
User=$VmUser
WorkingDirectory=$HomeDir/domeo-app
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
EnvironmentFile=$HomeDir/domeo-app/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVCEOF

sudo systemctl daemon-reload
sudo systemctl enable domeo-standalone
echo '=== Done. Run deploy-standalone-to-vm.ps1 from your PC to deploy the app. ==='
"@

# Подставляем переменные в remoteScript (DbPass, JwtSecret, VmUser, HomeDir)
$remoteScript = $remoteScript.Replace('${DbPass}', $DbPass).Replace('$DbPass', $DbPass).Replace('$JwtSecret', $JwtSecret).Replace('$VmUser', $VmUser).Replace('$HomeDir', $HomeDir)
# В heredoc ENVEOF мы написали ${DbPass} — заменим на значение
$remoteScript = $remoteScript.Replace("postgresql://domeo_user:${DbPass}@", "postgresql://domeo_user:$DbPass@")

Write-Host "Running first-time setup on VM (Node, PostgreSQL, .env, systemd)..." -ForegroundColor Cyan
$remoteScript = $remoteScript -replace "`r`n", "`n"
$remoteScript | ssh -i $KeyPath @SshOpts -o ConnectTimeout=120 $StagingHost "bash -s"
if ($LASTEXITCODE -ne 0) { Write-Host "Setup failed." -ForegroundColor Red; exit 1 }
Write-Host "VM setup complete. Next: run .\scripts\deploy-standalone-to-vm.ps1" -ForegroundColor Green
