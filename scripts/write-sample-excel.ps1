# Пишет пример Excel-заказа на диск (без БД, с моками из тестов).
# Результат: scripts/output/sample-order.xlsx
$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location (Split-Path -Parent $scriptDir)
$env:WRITE_EXCEL_SAMPLE = "1"
npx vitest run lib/export/puppeteer-generator.excel.test.ts --reporter=verbose
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$outPath = Join-Path $scriptDir "output\sample-order.xlsx"
if (Test-Path $outPath) {
  Write-Host "Файл создан: $outPath"
} else {
  Write-Host "Файл не найден: $outPath"
  exit 1
}
