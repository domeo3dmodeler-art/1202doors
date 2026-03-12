# Устанавливает переменные окружения для деплоя на тестовую ВМ 130.193.62.116.
# После запуска все скрипты (deploy-standalone-to-vm.ps1, sync-to-vm.ps1 и т.д.) будут использовать тестовую ВМ.
# См. docs/VM_TEST_130.193.62.116.md и docs/VM_HOSTS.md

$env:1002DOORS_STAGING_HOST = "ubuntu@130.193.62.116"
$TestKeyDir = "C:\Users\petr2\testdoors\ssh-key-1773299302859"
$KeyCandidates = @(
    (Join-Path $TestKeyDir "id_ed25519"),
    (Join-Path $TestKeyDir "id_rsa"),
    (Join-Path $TestKeyDir "ssh-key-1773299302859")
)
$KeyPath = $null
foreach ($k in $KeyCandidates) {
    if (Test-Path $k) { $KeyPath = $k; break }
}
if (-not $KeyPath) {
    Write-Host "В папке $TestKeyDir не найден ключ (id_ed25519, id_rsa или ssh-key-1773299302859). Задайте вручную: `$env:1002DOORS_SSH_KEY = 'путь\к\ключу'" -ForegroundColor Yellow
} else {
    $env:1002DOORS_SSH_KEY = $KeyPath
    Write-Host "Тестовая ВМ: $env:1002DOORS_STAGING_HOST, ключ: $KeyPath" -ForegroundColor Green
}
