# Деплой на одну ВМ — один сценарий

Один IP, один ключ, три шага. Без туннелей для деплоя — только для переноса БД при необходимости.

---

## Что нужно заранее

- ВМ в Yandex Cloud с Ubuntu, открыты порты 22 и 3000 (или 80).
- Публичный ключ добавлен на ВМ: консоль ВМ → `echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOGdtYn7Dt0FDPeGTZbKXDU6B1BXJCDz1P3QqDApNVF7 1002doors-vm' >> ~/.ssh/authorized_keys` (или ключ из `C:\Users\petr2\.ssh\1002doors-vm\id_ed25519.pub`).
- На ВМ один раз: Node 20, PostgreSQL, `mkdir -p ~/domeo-app`, файл `~/domeo-app/.env` с `DATABASE_URL`, systemd-юнит `domeo-standalone` (см. docs/VM_158_160_13_144_SETUP.md раздел 2).

---

## Шаг 1. Переменные (PowerShell, один раз в сессии)

```powershell
$env:1002DOORS_SSH_KEY   = "C:\Users\petr2\.ssh\1002doors-vm\id_ed25519"
$env:1002DOORS_STAGING_HOST = "ubuntu@ВАШ_IP"   # например ubuntu@158.160.13.144
```

Проверка: `ssh -i $env:1002DOORS_SSH_KEY $env:1002DOORS_STAGING_HOST "echo OK"` — должно вывести OK.

---

## Шаг 2. Деплой приложения

```powershell
cd c:\01_conf\1002doors
.\scripts\deploy-standalone-to-vm.ps1
```

Скрипт соберёт проект, упакует (включая public/uploads), загрузит архив на ВМ в `~/domeo-app`, распакует и перезапустит приложение. На ВМ npm не запускается.

После выполнения открыть в браузере: `http://ВАШ_IP:3000`.

---

## Шаг 3. Данные БД (если нужно перенести с локальной SQLite)

Только если на ВМ должна быть копия данных из `prisma/database/dev.db`:

1. В **первом** окне PowerShell:  
   `ssh -i $env:1002DOORS_SSH_KEY -L 5433:localhost:5432 $env:1002DOORS_STAGING_HOST -N`  
   Оставить окно открытым.

2. Во **втором** окне:  
   ```powershell
   cd c:\01_conf\1002doors
   $env:DATABASE_URL = "postgresql://domeo_user:ПАРОЛЬ_ИЗ_ВМ/.env@localhost:5433/domeo?schema=public"
   npx tsx scripts/sqlite-to-postgres.ts
   ```  
   Пароль — тот же, что в `DATABASE_URL` в `~/domeo-app/.env` на ВМ.

На этом всё. Приложение и фото уже на ВМ после шага 2; шаг 3 только подставляет данные в PostgreSQL на ВМ.
