# Перенос данных с локальной SQLite на PostgreSQL на ВМ

**Источник:** `prisma/database/dev.db` (SQLite)  
**Приёмник:** PostgreSQL на ВМ 158.160.13.144 (БД `domeo`, пользователь `domeo_user`, пароль по вашему .env на ВМ, порт 5432).

Скрипт переноса: `scripts/sqlite-to-postgres.ts`. Он читает SQLite и пишет в PostgreSQL по `DATABASE_URL` (из переменной окружения или из `.env.postgresql`).

---

## Один скрипт: миграция БД + фото + перезапуск

Запустите **на своём ПК** из каталога проекта (при необходимости задайте переменные и пароль БД ВМ):

```powershell
cd c:\01_conf\1002doors
# опционально:
# $env:1002DOORS_SSH_KEY = "C:\Users\petr2\.ssh\ssh-key-1771510238528\ssh-key-1771510238528"
# $env:1002DOORS_STAGING_HOST = "ubuntu@158.160.13.144"
# $env:1002DOORS_VM_PG_PASSWORD = "ваш_пароль_на_ВМ"

.\scripts\migrate-sqlite-to-vm-and-sync.ps1
```

Скрипт по очереди: поднимает SSH-туннель, переносит данные из SQLite в PostgreSQL на ВМ, останавливает туннель, загружает `public/uploads` на ВМ и перезапускает приложение. Только БД без фото: `.\scripts\migrate-sqlite-to-vm-and-sync.ps1 -SkipPhotos`.

Если ВМ обрывает SSH (fail2ban, лимиты), подождите несколько минут и запустите скрипт снова с вашего ПК.

---

## Вариант 1: Прямой перенос через SSH-туннель (без локального PostgreSQL)

Удобно, если локально не поднимаете PostgreSQL: туннель пробрасывает порт ВМ к вам на ПК, скрипт пишет «в localhost» — данные попадают на ВМ.

### Шаг 1. Открыть SSH-туннель

В **отдельном** окне PowerShell держите туннель (не закрывать до конца переноса):

```powershell
ssh -i "C:\Users\petr2\.ssh\ssh-key-1771510238528\ssh-key-1771510238528" -L 5433:localhost:5432 ubuntu@158.160.13.144 -N
```

Или с переменными:

```powershell
$env:1002DOORS_SSH_KEY = "C:\Users\petr2\.ssh\ssh-key-1771510238528\ssh-key-1771510238528"
$env:1002DOORS_STAGING_HOST = "ubuntu@158.160.13.144"
ssh -i $env:1002DOORS_SSH_KEY -L 5433:localhost:5432 $env:1002DOORS_STAGING_HOST -N
```

Смысл: на вашем ПК порт **5433** → на ВМ порт **5432** (PostgreSQL).

### Шаг 2. Запустить перенос

В **другом** окне PowerShell из каталога проекта:

```powershell
cd c:\01_conf\1002doors
$env:DATABASE_URL = "postgresql://domeo_user:ChangeMe123@localhost:5433/domeo?schema=public"
npx tsx scripts/sqlite-to-postgres.ts
```

Пароль `ChangeMe123` замените на тот, что задан в `~/domeo-app/.env` на ВМ (в `DATABASE_URL`).

После успешного завершения данные уже в БД на ВМ. Туннель можно закрыть (Ctrl+C в окне с ssh).

### Шаг 3. Фото и перезапуск приложения (по желанию)

БД уже на ВМ. Чтобы залить на ВМ каталог `public/uploads` и перезапустить приложение:

- **Только перезапуск** (без дампа и без фото):  
  `.\scripts\sync-staging-full.ps1 -SkipPhotos` — дамп будет пропущен, если нет доступа к БД из `.env.postgresql`; на ВМ дампа не будет, скрипт только перезапустит приложение.
- **Фото + перезапуск:**  
  `.\scripts\sync-staging-full.ps1` — зальёт `public/uploads` на ВМ, перезапустит приложение. Дамп скрипт создаёт только из `.env.postgresql` (локальный PostgreSQL); если его нет — дамп пропускается, фото и перезапуск выполняются.

---

## Вариант 2: Через локальный PostgreSQL и sync:staging

Если у вас поднят локальный PostgreSQL (например по `.env.postgresql`: localhost:6432, БД `domeo_production`):

1. **Перенести SQLite → локальный PostgreSQL**  
   В `.env.postgresql` должен быть `DATABASE_URL` на локальный PostgreSQL. Затем:
   ```powershell
   npx tsx scripts/sqlite-to-postgres.ts
   ```
2. **Выгрузить дамп и залить на ВМ**  
   Скрипт синхронизации создаёт дамп из `.env.postgresql`, заливает его на ВМ, восстанавливает БД и перезапускает приложение:
   ```powershell
   npm run sync:staging
   ```
   Только БД без фото: `.\scripts\sync-staging-full.ps1 -SkipPhotos`.

Или одной командой (сначала перенос в локальный PG, потом sync):  
`npm run sync:staging:from-sqlite`.

---

## Переменные окружения для скриптов ВМ

Для деплоя и синхронизации с ВМ 158.160.13.144:

```powershell
$env:1002DOORS_SSH_KEY   = "C:\Users\petr2\.ssh\ssh-key-1771510238528\ssh-key-1771510238528"
$env:1002DOORS_STAGING_HOST = "ubuntu@158.160.13.144"
```

В `sync-staging-full.ps1` и `deploy-standalone-to-vm.ps1` по умолчанию уже заданы этот хост и ключ (см. документацию по новой ВМ).
