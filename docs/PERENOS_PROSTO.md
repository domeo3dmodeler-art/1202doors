# Перенос локальной версии на ВМ — просто

**Локально:** идеальная версия (код + SQLite `prisma/database/dev.db` + `public/uploads`).  
**На ВМ:** приложение в `~/domeo-app`, БД PostgreSQL `domeo`.

---

## Шаг 1. Загрузить приложение и фото на ВМ

Один скрипт кладёт на ВМ и код, и весь `public` (включая фото) — они уже входят в standalone-архив.

```powershell
cd c:\01_conf\1002doors
$env:1002DOORS_SSH_KEY = "C:\Users\petr2\.ssh\ssh-key-1771510238528\ssh-key-1771510238528"
$env:1002DOORS_STAGING_HOST = "ubuntu@158.160.13.144"

.\scripts\deploy-standalone-to-vm.ps1
```

После этого на ВМ: актуальное приложение + все фото. Остаётся только подставить **данные БД**.

---

## Шаг 2. Перенести данные из SQLite в PostgreSQL на ВМ

С ПК до PostgreSQL на ВМ доступа нет, поэтому делаем туннель и запускаем миграцию локально.

**В первом окне PowerShell** (туннель, не закрывать):

```powershell
ssh -i "C:\Users\petr2\.ssh\ssh-key-1771510238528\ssh-key-1771510238528" -L 5433:localhost:5432 ubuntu@158.160.13.144 -N
```

**Во втором окне** из каталога проекта:

```powershell
cd c:\01_conf\1002doors
$env:DATABASE_URL = "postgresql://domeo_user:ChangeMe123@localhost:5433/domeo?schema=public"
npx tsx scripts/sqlite-to-postgres.ts
```

Пароль `ChangeMe123` замените на тот, что в `~/domeo-app/.env` на ВМ, если он другой.

Туннель потом можно закрыть (Ctrl+C в первом окне).

---

## Итог

1. **Деплой** — приложение + фото уже на ВМ.  
2. **Миграция** — данные из локального SQLite попадают в PostgreSQL на ВМ через туннель.

Сайт: **http://158.160.13.144:3000**
