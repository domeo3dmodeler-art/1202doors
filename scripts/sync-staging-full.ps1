# Перенос на staging: дамп БД, загрузка фото (public/uploads целиком), восстановление на ВМ, перезапуск.
# Если есть prisma/database/dev.db — сначала: npx tsx scripts/sqlite-to-postgres.ts, затем этот скрипт.
# Запуск: .\scripts\sync-staging-full.ps1  [ -SkipPhotos чтобы не загружать фото ]
#         .\scripts\sync-staging-full.ps1 -SkipPhotos  — только БД (как раньше)

param([switch]$SkipPhotos = $false)

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) { $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..") }
$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771510238528\ssh-key-1771510238528" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@158.160.13.144" }
$StagingHostOnly = if ($StagingHost -match '@') { $StagingHost.Split('@')[1] } else { $StagingHost }
$PgDump = "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe"
$OutputDir = Join-Path $ProjectRoot "scripts\output"
$DumpFile = Join-Path $OutputDir "full_backup.dump"
$UploadsDir = Join-Path $ProjectRoot "public\uploads"
$SqliteDb = Join-Path $ProjectRoot "prisma\database\dev.db"
if (-not (Test-Path $KeyPath)) { Write-Error "SSH key not found: $KeyPath"; exit 1 }
if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null }

# 0) Загрузка фото на ВМ (public/uploads со всеми папками: final-filled/04_Ручки_Завертки, Наличники, doors и т.д.)
if (-not $SkipPhotos -and (Test-Path $UploadsDir)) {
    $archive = Join-Path $OutputDir "uploads_staging.tar.gz"
    Write-Host "Packing public/uploads (04_Ручки_Завертки, Наличники, doors, ...)..." -ForegroundColor Cyan
    Push-Location $ProjectRoot
    try {
        tar -czf $archive -C public uploads 2>&1
        if (Test-Path $archive) {
            $sz = (Get-Item $archive).Length / 1MB
            Write-Host "Uploading uploads archive ($([math]::Round($sz, 1)) MB) to VM..." -ForegroundColor Cyan
            scp -i $KeyPath -o StrictHostKeyChecking=no $archive "${StagingHost}:~/1002doors/uploads_staging.tar.gz"
            if ($LASTEXITCODE -eq 0) {
                Write-Host "Extracting uploads on VM..." -ForegroundColor Cyan
                $extractScript = "mkdir -p ~/1002doors/public && cd ~/1002doors/public && tar -xzf ../uploads_staging.tar.gz && rm -f ../uploads_staging.tar.gz && echo 'Uploads extracted.'"
                $extractScript | ssh -i $KeyPath -o StrictHostKeyChecking=no $StagingHost "bash -s"
            }
            Remove-Item $archive -Force -ErrorAction SilentlyContinue
        }
    } finally { Pop-Location }
}

# 1) Дамп БД (из .env.postgresql)
$envPath = Join-Path $ProjectRoot ".env.postgresql"
$dbUrl = $null
if (Test-Path $envPath) {
    Get-Content $envPath | ForEach-Object { if ($_ -match '^\s*DATABASE_URL="([^"]+)"') { $dbUrl = $matches[1] } }
}
if (-not $dbUrl) { Write-Host "WARN: .env.postgresql not found or no DATABASE_URL. Skip dump." } else {
    if (-not (Test-Path $PgDump)) { Write-Host "WARN: pg_dump not found at $PgDump. Skip dump." } else {
        # Parse URL: postgresql://user:pass@host:port/dbname
        if ($dbUrl -match 'postgresql://([^:]+):([^@]+)@([^:]+):(\d+)/([^?]+)') {
            $dbUser = $matches[1]; $dbPass = $matches[2]; $dbHost = $matches[3]; $dbPort = $matches[4]; $dbName = $matches[5]
            if ($dbName -match '\?') { $dbName = $dbName -replace '\?.*$', '' }
            if ($dbHost -eq 'localhost') { $dbHost = '127.0.0.1' }
            $env:PGPASSWORD = $dbPass
            $psql = (Split-Path $PgDump -Parent) + "\psql.exe"
            Write-Host "Testing connection to $dbHost`:${dbPort}/$dbName ..."
            $testResult = & $psql -h $dbHost -p $dbPort -U $dbUser -d $dbName -t -c "SELECT 1" 2>&1
            if ($LASTEXITCODE -ne 0 -or -not ($testResult -match '1')) {
                Write-Host "Connection failed. Error: $testResult"
                Write-Host "Check: user $dbUser, database $dbName exist; password in .env.postgresql; pg_hba.conf allows 127.0.0.1"
            } else {
                Write-Host "Creating dump from $dbHost`:${dbPort}/$dbName ..."
                try {
                    & $PgDump -h $dbHost -p $dbPort -U $dbUser -d $dbName -F c -f $DumpFile 2>&1
                } catch { Write-Host "pg_dump error: $_" }
            }
            if (Test-Path $DumpFile) {
                $dumpSize = (Get-Item $DumpFile).Length / 1MB
                if ($dumpSize -gt 0) {
                    Write-Host "Dump created: $DumpFile ($([math]::Round($dumpSize, 2)) MB). Uploading..."
                    scp -i $KeyPath -o StrictHostKeyChecking=no $DumpFile "${StagingHost}:~/1002doors/full_backup.dump"
                    if ($LASTEXITCODE -eq 0) { $doRestore = $true } else { Write-Host "WARN: scp dump failed" }
                } else { Write-Host "WARN: Dump file empty. Skip."; Remove-Item $DumpFile -Force }
            } else { Write-Host "WARN: pg_dump failed (is PostgreSQL running?). Skip dump." }
        }
    }
}

# 2) На сервере: восстановить дамп (если загружен), перезапустить приложение (systemd или вручную)
# Пароль для pg_restore берём из .env на ВМ (bash); экранируем $ для PowerShell: `$
$remoteScript = @"
set -e
cd ~/1002doors
PGPASSWORD=
for envf in .env ~/domeo-app/.env; do
  if [ -f "`$envf" ]; then
    PGPASSWORD=`$(grep DATABASE_URL "`$envf" 2>/dev/null | sed -n 's|.*postgresql://[^:]*:\([^@]*\)@.*|\1|p')
    [ -n "`$PGPASSWORD" ] && break
  fi
done
if [ -f full_backup.dump ]; then
  echo 'Restoring database...'
  PGPASSWORD=`$PGPASSWORD pg_restore -h localhost -U domeo_user -d domeo --no-owner --no-acl --clean --if-exists full_backup.dump 2>/dev/null || true
  PGPASSWORD=`$PGPASSWORD pg_restore -h localhost -U domeo_user -d domeo --no-owner --no-acl full_backup.dump 2>&1 | tail -5
  rm -f full_backup.dump
  echo 'Database restored.'
fi
echo 'Restarting app...'
if systemctl is-active --quiet domeo-standalone 2>/dev/null; then
  sudo systemctl restart domeo-standalone
elif systemctl is-active --quiet domeo-staging 2>/dev/null; then
  sudo systemctl restart domeo-staging
else
  pkill -f 'node.*server.js' 2>/dev/null; pkill -f 'node.*next' 2>/dev/null; sleep 2
  (cd ~/domeo-app 2>/dev/null && NODE_ENV=production nohup node server.js > /tmp/domeo.log 2>&1 &) || (cd ~/1002doors 2>/dev/null && NODE_ENV=production nohup npx next start -H 0.0.0.0 -p 3000 > /tmp/domeo.log 2>&1 &)
fi
sleep 4
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health
echo ''
echo 'Done.'
"@

Write-Host "Running restore and restart on staging..."
$remoteScript = $remoteScript -replace "`r`n", "`n"
$remoteScript | ssh -i $KeyPath -o StrictHostKeyChecking=no $StagingHost "bash -s"
Write-Host "Staging sync finished. Open http://${StagingHostOnly}:3000"
