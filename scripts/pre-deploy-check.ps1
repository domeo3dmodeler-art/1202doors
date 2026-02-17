# scripts/pre-deploy-check.ps1
# Финальная проверка перед деплоем: lint, type-check, unit tests, build.
# Запуск: powershell -ExecutionPolicy Bypass -File scripts/pre-deploy-check.ps1

$ErrorActionPreference = "Stop"
$failed = $false

function Run-Step {
    param([string]$Name, [scriptblock]$Cmd)
    Write-Host "`n--- $Name ---" -ForegroundColor Cyan
    try {
        & $Cmd
        if ($LASTEXITCODE -ne 0) {
            Write-Host "FAILED: $Name (exit $LASTEXITCODE)" -ForegroundColor Red
            $script:failed = $true
            return $false
        }
        Write-Host "OK: $Name" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "FAILED: $Name - $_" -ForegroundColor Red
        $script:failed = $true
        return $false
    }
}

Write-Host "Pre-deploy check (lint, type-check, test, build)" -ForegroundColor Yellow

Run-Step "Lint" { npm run lint }
Run-Step "Type-check" { npm run type-check }
Run-Step "Unit tests" { npm run test }

# Build: on Windows, EPERM on .next can occur if dev server or IDE holds the folder
Write-Host "`n--- Build ---" -ForegroundColor Cyan
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed. If you see EPERM on .next: stop 'npm run dev', delete .next folder, run this script again." -ForegroundColor Yellow
        $script:failed = $true
    } else {
        Write-Host "OK: Build" -ForegroundColor Green
    }
} catch {
    Write-Host "FAILED: Build - $_" -ForegroundColor Red
    $script:failed = $true
}

Write-Host "`n========================================" -ForegroundColor Cyan
if ($failed) {
    Write-Host "Pre-deploy check: FAILED" -ForegroundColor Red
    exit 1
} else {
    Write-Host "Pre-deploy check: PASSED" -ForegroundColor Green
    Write-Host "Optional: start app (npm run dev) and run 'npm run test:e2e' for E2E." -ForegroundColor Gray
    exit 0
}
