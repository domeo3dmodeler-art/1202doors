# Устанавливает переменные окружения для деплоя на тестовую ВМ 178.154.244.83.
# После запуска все скрипты (deploy-standalone-to-vm.ps1, sync-to-vm.ps1 и т.д.) будут использовать тестовую ВМ.
# См. docs/VM_HOSTS.md

$env:1002DOORS_STAGING_HOST = "ubuntu@178.154.244.83"
$TestKeyDir = "C:\Users\petr2\.ssh\ssh-key-1773410153319"
$KeyCandidates = @(
    (Join-Path $TestKeyDir "ssh-key-1773410153319"),
    (Join-Path $TestKeyDir "id_ed25519"),
    (Join-Path $TestKeyDir "id_rsa")
)
$KeyPath = $null
foreach ($k in $KeyCandidates) {
    if (Test-Path $k) { $KeyPath = $k; break }
}
if (-not $KeyPath) {
    Write-Host "В папке $TestKeyDir не найден ключ. Задайте вручную: `$env:1002DOORS_SSH_KEY = 'путь\к\ключу'" -ForegroundColor Yellow
} else {
    $env:1002DOORS_SSH_KEY = $KeyPath
    Write-Host "Тестовая ВМ: $env:1002DOORS_STAGING_HOST, ключ: $KeyPath" -ForegroundColor Green
}
