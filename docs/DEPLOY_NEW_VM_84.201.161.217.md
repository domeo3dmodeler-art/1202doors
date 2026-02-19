# Деплой на новую ВМ 84.201.161.217 — пошагово

**ВМ:** 84.201.161.217  
**Ключ:** `C:\Users\petr2\.ssh\ssh-key-1771419260729\ssh-key-1771419260729`  
**Пользователь на ВМ:** ubuntu

Во всех скриптах деплоя и синхронизации уже прописаны этот хост и ключ по умолчанию (переменные `1002DOORS_SSH_KEY` и `1002DOORS_STAGING_HOST` можно не задавать).

---

## Что уже сделано автоматически

1. **Скрипты обновлены** — дефолтный хост во всех скриптах: `ubuntu@84.201.161.217`, ключ — указанная выше папка.
2. **SSH проверен** — подключение к ВМ работает.
3. **Первичная настройка ВМ выполнена:**
   - Node.js 20
   - PostgreSQL 14, пользователь `domeo_user`, пароль `d0me0Stag1ngPg2025`, БД `domeo`
   - Каталоги `~/domeo-app` и `~/1002doors`
   - Файл `~/domeo-app/.env` (DATABASE_URL, JWT_SECRET)
   - Systemd-сервис `domeo-standalone` (включён, запускается после деплоя)
4. **Схема БД на ВМ применена** — `prisma db push` выполнен на ВМ (таблицы созданы).

---

## Что сделать тебе (по шагам)

### Шаг 1. Деплой приложения (один раз или при каждом обновлении кода)

В **PowerShell** открой папку проекта и выполни:

```powershell
cd c:\01_conf\1002doors
.\scripts\deploy-standalone-to-vm.ps1
```

**Если сборка падает с EPERM** (файл занят другим процессом — IDE, антивирус, предыдущий `next dev`):
1. Закрой Cursor/VS Code и все терминалы в этой папке.
2. Открой **новый** PowerShell и собери вручную: `cd c:\01_conf\1002doors; $env:NODE_ENV="production"; npm run build`
3. После успешной сборки загрузи уже готовый артефакт: `.\scripts\deploy-standalone-to-vm.ps1 -SkipBuild`

После успешного деплоя приложение будет доступно: **http://84.201.161.217:3000**

Проверка здоровья: http://84.201.161.217:3000/api/health (должен вернуть 200).

---

### Шаг 2. Схема и данные БД

**Вариант А: перенести данные с локальной машины (каталог + БД)**

1. Локально подготовь данные в PostgreSQL (если каталог в SQLite):
   ```powershell
   npx tsx scripts/sqlite-to-postgres.ts
   ```
2. Синхронизация на staging (дамп БД + фото, перезапуск приложения на ВМ):
   ```powershell
   npm run sync:staging
   ```
   Скрипт загрузит дамп в `~/1002doors` на ВМ, восстановит БД и перезапустит `domeo-standalone`.

**Вариант Б: пустая БД, только схема** — уже выполнено: схема на ВМ применена. При необходимости повторить можно через туннель (см. старую версию инструкции в git) или на ВМ: `cd /tmp && npm install prisma@6 && DATABASE_URL='...' npx prisma db push --schema=/tmp/schema.prisma`.

---

### Шаг 3. Группа безопасности в Yandex Cloud

Убедись, что для ВМ открыты порты:

- **22** (SSH) — источник 0.0.0.0/0 или твой IP
- **3000** (приложение) — источник 0.0.0.0/0 (для тестировщиков)

Консоль Yandex Cloud → Compute Cloud → ВМ → Сеть → группа безопасности.

---

## Полезные команды

| Действие | Команда |
|----------|---------|
| Деплой (сборка на ПК, загрузка на ВМ) | `.\scripts\deploy-standalone-to-vm.ps1` или `npm run deploy:standalone` |
| Деплой без сборки (уже есть .next/standalone) | `.\scripts\deploy-standalone-to-vm.ps1 -SkipBuild` |
| Синхронизация БД + фото с ПК на ВМ | `npm run sync:staging` |
| Только БД (без фото) | `.\scripts\sync-staging-full.ps1 -SkipPhotos` |
| Перезапуск приложения на ВМ | `.\scripts\restart-staging-app.ps1` |
| SSH на ВМ | `ssh -i "C:\Users\petr2\.ssh\ssh-key-1771419260729\ssh-key-1771419260729" ubuntu@84.201.161.217` |

На ВМ: логи приложения — `journalctl -u domeo-standalone -f` или `sudo systemctl status domeo-standalone`.

---

## Если переключишься на другую ВМ

Задай переменные перед запуском скриптов:

```powershell
$env:1002DOORS_SSH_KEY = "путь\к\приватному\ключу"
$env:1002DOORS_STAGING_HOST = "ubuntu@новый_ip"
```

Или измени дефолты в начале скриптов `deploy-standalone-to-vm.ps1` и `sync-staging-full.ps1`.
