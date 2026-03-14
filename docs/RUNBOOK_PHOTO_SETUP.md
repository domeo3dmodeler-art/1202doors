# Runbook: настройка раздачи фото (один разработчик)

Все шаги в одном скрипте. Запуск из корня репозитория:

```powershell
.\scripts\run-photo-setup-full.ps1
```

Скрипт делает по порядку:

1. **Нормализация имён (NFC)** — `npx tsx scripts/normalize-uploads-nfc.ts`. Чтобы Nginx по `try_files` находил файлы на диске.
2. **Применение Nginx на ВМ** — копирует `scripts/output/domeo-nginx.conf` на 178.154.244.83, `nginx -t` и `reload`.
3. **Синхронизация uploads на ВМ** — упаковывает `public/uploads`, копирует в `~/domeo-app/public/uploads`, распаковывает.

## Если SSH не работает (Permission denied)

1. В репозитории ключ для 178.154.244.83 описан в **docs/VM_158_160_10_126_DEPLOY.md** и **docs/VM_SSH_KEY_REFERENCE.md**. По умолчанию скрипты используют `%USERPROFILE%\.ssh\ssh-key-1773410153319\ssh-key-1773410153319`.
2. Если на ВМ добавлен другой ключ (например **1002doors-vm** по DEPLOY_ODNA_VM), задайте его и запустите снова:
   ```powershell
   $env:1002DOORS_SSH_KEY = "$env:USERPROFILE\.ssh\1002doors-vm\id_ed25519"
   .\scripts\run-photo-setup-full.ps1
   ```
3. Либо подключитесь к ВМ вручную тем ключом, которым получается, затем задайте `1002DOORS_SSH_KEY` этим путём и снова запустите скрипт.

Переменные (при необходимости):

- **1002DOORS_SSH_KEY** — путь к приватному ключу. Для ВМ **178.154.244.83** в репозитории задан ключ из [docs/VM_158_160_10_126_DEPLOY.md](VM_158_160_10_126_DEPLOY.md): `%USERPROFILE%\.ssh\ssh-key-1773410153319\ssh-key-1773410153319`. Если при настройке «одна ВМ» ([DEPLOY_ODNA_VM.md](DEPLOY_ODNA_VM.md)) на сервер добавлен ключ **1002doors-vm**, задайте: `$env:1002DOORS_SSH_KEY = "$env:USERPROFILE\.ssh\1002doors-vm\id_ed25519"`.
- **1002DOORS_STAGING_HOST** — хост ВМ (по умолчанию `ubuntu@178.154.244.83`).

## Ручные шаги (если скрипт не подходит)

| Шаг | Команда |
|-----|--------|
| Нормализация | `npx tsx scripts/normalize-uploads-nfc.ts` |
| Nginx на ВМ | `.\scripts\apply-nginx-to-vm.ps1` |
| Синхронизация uploads | `.\scripts\sync-uploads-to-vm.ps1` |
| Только архив (без scp) | `.\scripts\prepare-uploads-archive.ps1` |

На ВМ в конфиге Nginx задано `root /home/ubuntu/domeo-app/public`. Убедитесь, что приложение на ВМ лежит в `~/domeo-app` (или измените путь в `scripts/output/domeo-nginx.conf` и снова примените конфиг).

Подробнее: **docs/AUDIT_UPLOADS_AND_PERFORMANCE.md**.
