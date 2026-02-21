# Один запуск: перенос БД из SQLite на ВМ (через туннель) + загрузка фото и перезапуск приложения.
# Запуск: .\scripts\migrate-sqlite-to-vm-and-sync.ps1  [ -SkipPhotos ] [ -SkipMigration только sync ]
# Требует: prisma/database/dev.db (для миграции), доступ по SSH к ВМ, пароль БД на ВМ (по умолчанию ChangeMe123).

param([switch]$SkipPhotos = $false, [switch]$SkipMigration = $false)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $ProjectRoot "package.json"))) { $ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..") }
Set-Location $ProjectRoot

$KeyPath = if ($env:1002DOORS_SSH_KEY) { $env:1002DOORS_SSH_KEY } else { "C:\Users\petr2\.ssh\ssh-key-1771510238528\ssh-key-1771510238528" }
$StagingHost = if ($env:1002DOORS_STAGING_HOST) { $env:1002DOORS_STAGING_HOST } else { "ubuntu@89.169.181.191" }
$PgPassword = if ($env:1002DOORS_VM_PG_PASSWORD) { $env:1002DOORS_VM_PG_PASSWORD } else { "ChangeMe123" }

if (-not (Test-Path $KeyPath)) { Write-Error "SSH key not found: $KeyPath"; exit 1 }
$SqliteDb = Join-Path $ProjectRoot "prisma\database\dev.db"
if (-not $SkipMigration -and -not (Test-Path $SqliteDb)) { Write-Error "SQLite not found: $SqliteDb"; exit 1 }

if (-not $SkipMigration) {
Write-Host "1) Starting SSH tunnel (localhost:5433 -> VM:5432)..." -ForegroundColor Cyan
$tunnelJob = Start-Job -ScriptBlock {
  param($key, $sshHost)
  & ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=100 -i $key -o StrictHostKeyChecking=no -L 5433:localhost:5432 $sshHost -N
} -ArgumentList $KeyPath, $StagingHost

Start-Sleep -Seconds 8

Write-Host "2) Migrating SQLite -> PostgreSQL on VM..." -ForegroundColor Cyan
$env:DATABASE_URL = "postgresql://domeo_user:${PgPassword}@localhost:5433/domeo?schema=public"
try {
  npx tsx scripts/sqlite-to-postgres.ts
  if ($LASTEXITCODE -ne 0) { throw "Migration failed with exit code $LASTEXITCODE" }
} finally {
  Stop-Job $tunnelJob -ErrorAction SilentlyContinue
  Remove-Job $tunnelJob -ErrorAction SilentlyContinue
}
} else {
  Write-Host "1) Skip migration (SkipMigration)." -ForegroundColor Cyan
}

$env:1002DOORS_SSH_KEY = $KeyPath
$env:1002DOORS_STAGING_HOST = $StagingHost
Write-Host "2) Syncing photos and restarting app on VM..." -ForegroundColor Cyan
if ($SkipPhotos) {
  & (Join-Path $PSScriptRoot "sync-staging-full.ps1") -SkipPhotos
} else {
  & (Join-Path $PSScriptRoot "sync-staging-full.ps1")
}

Write-Host "Done. Open http://$($StagingHost -replace '^[^@]+@',''):3000" -ForegroundColor Green
