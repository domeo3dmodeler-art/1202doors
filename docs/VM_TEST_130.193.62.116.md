# Тестовая ВМ 178.154.244.83

**IP:** 178.154.244.83  
**Ключ SSH:** папка `C:\Users\petr2\testdoors\ssh-key-1773299302859` (внутри — приватный ключ, например `id_ed25519` или файл с именем папки).

## Быстрый старт — деплой на тестовую ВМ

1. Установить переменные окружения для тестовой ВМ (в PowerShell из корня репозитория):

   ```powershell
   .\scripts\set-test-vm-env.ps1
   ```

2. Выполнить деплой (как на рабочую машину, но на 178.154.244.83):

   ```powershell
   .\scripts\deploy-standalone-to-vm.ps1 -AppOnly
   # или полный деплой:
   .\scripts\deploy-standalone-to-vm.ps1
   ```

3. Проверка:

   ```powershell
   curl -s http://178.154.244.83/api/health
   ```

## Первичная настройка тестовой ВМ (один раз)

Если ВМ новая, нужно один раз установить Node.js, создать каталог приложения, .env и systemd-юнит — по той же схеме, что и для рабочей машины (см. [VM_158_160_10_126_DEPLOY.md](VM_158_160_10_126_DEPLOY.md) и [DEPLOY_STANDALONE_ARTIFACT.md](DEPLOY_STANDALONE_ARTIFACT.md)), подставляя хост `ubuntu@178.154.244.83` и ключ из `C:\Users\petr2\testdoors\ssh-key-1773299302859`.

Скрипт первичной настройки (если подходит под вашу ВМ):

```powershell
$env:1002DOORS_STAGING_HOST = "ubuntu@178.154.244.83"
$env:1002DOORS_SSH_KEY = "C:\Users\petr2\testdoors\ssh-key-1773299302859\id_ed25519"   # укажите имя файла ключа в папке
.\scripts\setup-new-vm.ps1
```

## Возврат к рабочей машине

После тестов не забудьте сбросить переменные, чтобы скрипты снова использовали рабочую ВМ 178.154.244.83:

```powershell
Remove-Item Env:1002DOORS_STAGING_HOST -ErrorAction SilentlyContinue
Remove-Item Env:1002DOORS_SSH_KEY -ErrorAction SilentlyContinue
```

См. также [VM_HOSTS.md](VM_HOSTS.md).
