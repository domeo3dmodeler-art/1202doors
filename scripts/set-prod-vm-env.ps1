# Устанавливает переменные окружения для деплоя на рабочую ВМ 158.160.69.237.
# После запуска все скрипты (deploy-standalone-to-vm.ps1, sync-to-vm.ps1 и т.д.) будут использовать рабочую ВМ.
# ВНИМАНИЕ: при деплое на рабочую ВМ не затрагиваются пользователи, документы, заказы, .env, public/uploads.
# См. docs/VM_HOSTS.md

$env:1002DOORS_STAGING_HOST = "ubuntu@158.160.69.237"
$KeyPath = "C:\Users\petr2\.ssh\1\id_ed25519"

if (-not (Test-Path $KeyPath)) {
    Write-Host "SSH-ключ не найден: $KeyPath. Задайте вручную: `$env:1002DOORS_SSH_KEY = 'путь\к\ключу'" -ForegroundColor Yellow
} else {
    $env:1002DOORS_SSH_KEY = $KeyPath
    Write-Host "Рабочая ВМ (PROD): $env:1002DOORS_STAGING_HOST, ключ: $KeyPath" -ForegroundColor Magenta
    Write-Host "ВАЖНО: .env и public/uploads на рабочей ВМ не перезаписываются." -ForegroundColor Yellow
}
