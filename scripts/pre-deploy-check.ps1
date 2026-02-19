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

Write-Host "Pre-deploy check (audit, lint, type-check, test, build)" -ForegroundColor Yellow

# npm audit: проверка известных уязвимостей и вредоносных пакетов (цепочка поставок)
Write-Host "`n--- npm audit ---" -ForegroundColor Cyan
$auditResult = npm audit 2>&1
$auditExit = $LASTEXITCODE
if ($auditExit -ne 0) {
    Write-Host $auditResult -ForegroundColor Gray
    Write-Host "WARN: npm audit reported issues (review above). Critical/High should be fixed before deploy. See docs/NPM_SUPPLY_CHAIN_SECURITY.md" -ForegroundColor Yellow
    # Не падаем по умолчанию, только предупреждение; при желании раскомментировать: $script:failed = $true
} else {
    Write-Host "OK: npm audit (no known vulnerabilities)" -ForegroundColor Green
}

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
