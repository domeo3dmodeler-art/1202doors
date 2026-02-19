# Безопасная сборка артефакта для деплоя на ВМ (PowerShell).
# Запуск: .\scripts\build-artifact.ps1  или  npm run build:artifact:ps1

$ErrorActionPreference = "Stop"
$AppName = "1002doors"
$OutDir = "dist"
$Artifact = "$OutDir\$AppName-artifact.tar.gz"
$Root = Split-Path $PSScriptRoot -Parent
if (-not $Root) { $Root = (Get-Item $PSScriptRoot).Parent.FullName }
Set-Location $Root

Write-Host "[1/6] Cleaning .next and dist..."
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue .next, $OutDir
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

Write-Host "[2/6] Installing dependencies..."
$ciOk = $false
try {
    npm ci --ignore-scripts 2>&1 | Out-Null
    if ($LASTEXITCODE -eq 0) { $ciOk = $true }
} catch {}
if (-not $ciOk) {
    npm install --include=dev --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
}

Write-Host "[2b/6] Prisma generate (local)..."
$prismaBin = Join-Path $Root "node_modules\.bin\prisma.cmd"
if (Test-Path $prismaBin) {
    & $prismaBin generate
} else {
    npx prisma generate 2>&1 | Out-Null
}

Write-Host "[3/6] Building Next.js standalone..."
$env:NEXT_BUILD_ARTIFACT = "1"
$env:NODE_ENV = "production"
npm run build

Write-Host "[4/6] Checking standalone..."
$serverJs = Get-ChildItem -Path ".next\standalone" -Recurse -Filter "server.js" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $serverJs -or -not (Test-Path $serverJs.FullName)) {
    Write-Error "Missing .next/standalone/.../server.js. Check next.config output: standalone."
}

Write-Host "[5/6] Packing artifact..."
# tar в Windows 10+ поддерживает -czf
tar -czf $Artifact .next/standalone .next/static public package.json prisma

Write-Host "[6/6] SHA256 checksum..."
Start-Sleep -Seconds 3
$ShaFile = "$Artifact.sha256"
if (Get-Command sha256sum -ErrorAction SilentlyContinue) {
    sha256sum $Artifact | Tee-Object -FilePath $ShaFile
} elseif (Get-Command Get-FileHash -ErrorAction SilentlyContinue) {
    $hash = $null
    foreach ($attempt in 1..5) {
        try {
            $hash = (Get-FileHash -Path $Artifact -Algorithm SHA256 -ErrorAction Stop).Hash.ToLower()
            break
        } catch {
            Start-Sleep -Seconds 2
        }
    }
    if ($hash) {
        "$hash  $(Split-Path $Artifact -Leaf)" | Tee-Object -FilePath $ShaFile
    } else {
        $certOut = & certutil -hashfile $Artifact SHA256 2>&1
        $hashLine = $certOut | Where-Object { $_ -match '^[a-fA-F0-9]{64}$' } | Select-Object -First 1
        if ($hashLine) {
            "$($hashLine.Trim().ToLower())  $(Split-Path $Artifact -Leaf)" | Tee-Object -FilePath $ShaFile
        } else {
            Write-Host "Warning: could not compute SHA256. Run: certutil -hashfile $Artifact SHA256"
        }
    }
} else {
    Write-Host "Warning: sha256 file not created (no sha256sum/Get-FileHash)."
}

Write-Host ""
Write-Host "Done: $Artifact"
Write-Host "Deploy: scp artifact and .sha256 to VM, then on VM run: sha256sum -c *.sha256"
