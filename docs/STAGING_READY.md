# Staging готов (17.02.2026)

## Что сделано по шагам (автоматически)

1. **ВМ** — создана ранее (178.154.244.83), пользователь `petr`, SSH по ключу.
2. **PostgreSQL** — установлен, БД `domeo`, пользователь `domeo_user`, пароль в `.env` на сервере.
3. **Node.js 20** — установлен.
4. **Приложение** — клон репо в `~/1002doors`, `npm ci`, в `prisma/schema.prisma` заменён `sqlite` → `postgresql`, `prisma db push`, сборка Next.js, запуск в фоне.
5. **public/uploads** — создана, добавлен placeholder `placeholders/door-missing.svg`.
6. **Перезапуск** — приложение перезапущено, проверены `/api/health` (200) и главная страница (200).

**Синхронизация с ВМ:** `npm run sync:staging` по умолчанию: (1) упаковывает **public/uploads** (04_Ручки_Завертки, Наличники, doors и т.д.), загружает архив на ВМ и распаковывает в ~/1002doors/public/; (2) дамп из **domeo_production** (localhost:6432), загрузка дампа, восстановление в БД `domeo`, перезапуск приложения. Только БД без фото: `.\scripts\sync-staging-full.ps1 -SkipPhotos`. См. раздел ниже.

---

## Доступ

- **URL:** http://178.154.244.83:3000
- **Health:** http://178.154.244.83:3000/api/health — `database.status === 'ok'`

## Подключение по SSH

```bash
ssh -i "C:\02_conf\ssh1702\ssh-key-1771306236042\ssh-key-1771306236042" petr@178.154.244.83
```

Либо, если в `~/.ssh/config` добавлен хост `domeo-staging` (пользователь `petr`):

```bash
ssh domeo-staging
```

## Что установлено на ВМ

- PostgreSQL (из пакетов Ubuntu), БД `domeo`, пользователь `domeo_user`
- Node.js 20
- Приложение: репозиторий в `~/1002doors`, сборка Next.js, запуск через `npm run start` (процесс в фоне, лог `/tmp/domeo.log`)

## Учётные данные БД (staging)

- **DATABASE_URL:** `postgresql://domeo_user:d0me0Stag1ngPg2025@localhost:5432/domeo?schema=public`
- Пароль БД: `d0me0Stag1ngPg2025` (можно сменить на сервере)

## Переменные окружения на ВМ (.env)

В `~/1002doors/.env` на сервере **обязательны** переменные, иначе при входе будет **500 Server configuration error**:

- **DATABASE_URL** — строка подключения к PostgreSQL (см. выше).
- **JWT_SECRET** — секрет для JWT-токенов, **не короче 32 символов** (например случайная строка или `openssl rand -base64 32`).

Пример минимального `.env` для staging:
```bash
# На ВМ: nano ~/1002doors/.env
DATABASE_URL="postgresql://domeo_user:d0me0Stag1ngPg2025@localhost:5432/domeo?schema=public"
NODE_ENV=production
JWT_SECRET=ваш-секрет-не-короче-32-символов-для-jwt-токенов
```

После изменения `.env` перезапустите приложение (см. блок «Если http://178.154.244.83:3000 не открывается»).

## Синхронизация БД с staging

Чтобы на ВМ оказались **актуальные данные БД** (каталог, пользователи, документы):

1. **Запустите PostgreSQL** на своей машине; БД **domeo_production** на порту **6432** (параметры в `.env.postgresql`).
2. Из корня проекта выполните:
   ```powershell
   npm run sync:staging
   ```
   Скрипт:
   - упаковывает `public/uploads` (все папки, в т.ч. 04_Ручки_Завертки, Наличники), загружает архив на ВМ и распаковывает в ~/1002doors/public/;
   - создаёт дамп из `domeo_production` (localhost:6432), загружает его на ВМ, восстанавливает в БД `domeo` и перезапускает приложение.
   Чтобы не загружать фото (только БД): `.\scripts\sync-staging-full.ps1 -SkipPhotos`.

После выполнения откройте http://178.154.244.83:3000 — каталог и фото должны отображаться.

**Фото уже загружены на ВМ** (папка `public/uploads` с final-filled, placeholders, products). Чтобы подтянуть **все товары из БД**, запустите локально PostgreSQL (domeo_production) и снова выполните `npm run sync:staging` — скрипт создаст дамп, загрузит его на ВМ и восстановит.

**Обновление только товаров дверей на ВМ (откат к «старым» ~2204):** если на ВМ в БД тоже есть раздутый набор (~12k товаров дверей) и нужно оставить только старые (created_at до 13.02), выполните **на ВМ** скрипт удаления по дате. Подробно: раздел «Обновление БД на ВМ (товары двери)» в `docs/DEPLOY_YANDEX_CLOUD.md`. Кратко:
```bash
ssh petr@178.154.244.83
cd ~/1002doors && git pull
npx tsx scripts/delete-door-products-by-date.ts --dry-run   # отчёт
npx tsx scripts/delete-door-products-by-date.ts              # удаление
curl -s http://localhost:3000/api/catalog/doors/complete-data/refresh
sudo systemctl restart domeo-staging
```

**Структура папок фото на ВМ** (в `~/1002doors/public/uploads/final-filled/`): обязательны **`04_Ручки_Завертки`** (ручки; имя с подчёркиваниями, как на локальном диске) и **`Наличники`** (наличники; внутри — подпапки по поставщику: `наличники фрамир`, `портика_юркас` и т.д.). При необходимости: `doors/`, `05 Ограничители/`. Если на ВМ папка ручек была создана с пробелами (`04 Ручки Завертки`), переименуйте в `04_Ручки_Завертки`. Файлы ручек: `handle_<серия>_<цвет>_main.png` (например `handle_LOT_ЧЕРНЫЙ_main.png`, `handle_SOUK_хром-мат_main.png`, `handle_YSTAD_никель_main.png`). API `/api/catalog/hardware?type=handles` при выборе фото ручки отдаёт приоритет локальным путям `/uploads/...` перед внешними (Яндекс.Диск и т.п.), иначе на фронте отображается плейсхолдер.
```bash
cd ~/1002doors/public/uploads/final-filled
[ -d "04 Ручки Завертки" ] && [ ! -d "04_Ручки_Завертки" ] && mv "04 Ручки Завертки" "04_Ручки_Завертки"
```

### Если http://178.154.244.83:3000 не открывается

1. **Группа безопасности (Yandex Cloud):** откройте входящий TCP порт **3000** (источник 0.0.0.0/0 или ваш IP). Консоль → ВМ → Сеть → группа безопасности → правило входящего трафика.
2. **Приложение не запущено или упало** — перезапуск (на ВМ процесс мог завершиться, тогда страница не откроется):
   ```bash
   ssh petr@178.154.244.83
   cd ~/1002doors && pkill -f 'node.*next' 2>/dev/null; pkill -f 'standalone/server' 2>/dev/null; sleep 2
   NODE_ENV=production nohup npx next start -H 0.0.0.0 -p 3000 >> /tmp/domeo.log 2>&1 &
   sleep 5 && curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health
   ```
   Должно вывести `200`. Проверка процесса: `pgrep -af next`; лог: `tail -50 /tmp/domeo.log`. Если страница снова перестаёт открываться — выполните эти команды ещё раз.

### Ошибка в консоли браузера: ERR_CONNECTION_REFUSED (api/price/doors, uploads/..., api/notifications)

**Причина:** браузер не может подключиться к серверу. Все запросы (API, статика, фото) идут на тот же хост, что и страница. Если в консоли видно `Failed to load resource: net::ERR_CONNECTION_REFUSED` для `api/price/doors`, `uploads/final-filled/...`, `api/notifications` — **на ВМ не запущен процесс приложения или он упал**. Это не баг расчёта цены и не баг путей к фото: сервер просто не отвечает.

**Что делать:** зайти на ВМ по SSH и снова запустить приложение (команды выше). Чтобы приложение не падало при обрыве SSH и перезапускалось после перезагрузки ВМ, лучше запускать его через **systemd** (см. ниже).

### Запуск приложения через systemd (чтобы не падало и поднималось после перезагрузки ВМ)

На ВМ создайте юнит (один раз):

```bash
sudo tee /etc/systemd/system/domeo-staging.service << 'EOF'
[Unit]
Description=Domeo 1002doors staging
After=network.target postgresql.service

[Service]
Type=simple
User=petr
WorkingDirectory=/home/petr/1002doors
Environment=NODE_ENV=production
EnvironmentFile=/home/petr/1002doors/.env
ExecStart=/usr/bin/npx next start -H 0.0.0.0 -p 3000
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable domeo-staging
sudo systemctl start domeo-staging
```

Дальше: `sudo systemctl status domeo-staging` — проверить, `sudo systemctl restart domeo-staging` — перезапуск после деплоя. Логи: `journalctl -u domeo-staging -f`.

### Как запустить PostgreSQL на Windows

1. Узнать имя службы: `Get-Service -Name *postgres*` (например `postgresql-x64-15`).
2. Запустить от администратора: `Start-Service -Name "postgresql-x64-15"` (подставьте своё имя).
3. Проверить: `Get-Service -Name *postgres*` — Status должен быть **Running**. Или: `psql -h localhost -U domeo_user -d domeo_production -c "SELECT 1"` (с паролем из `.env.postgresql`).

### Если служба Running, но pg_dump выдаёт "Connection refused"

Служба запущена, но сервер не принимает подключения по TCP. Проверьте по шагам:

1. **На каком порту слушает PostgreSQL:**
   ```powershell
   netstat -aon | findstr "LISTENING"
   ```
   Найдите строку с процессом postgres (часто порт **5432** или **6432**). В этом проекте в `.env.postgresql` должен быть указан тот же порт, что и в `postgresql.conf` (файл в `C:\Program Files\PostgreSQL\15\data\`). Если у вас в конфиге был `port = 6432`, в `.env.postgresql` должно быть `localhost:6432` в DATABASE_URL.

2. **Проверка порта (подставьте свой порт):**
   ```powershell
   netstat -aon | findstr "5432"
   # или
   netstat -aon | findstr "6432"
   ```
   Должна быть строка с состоянием `LISTENING`. Если такой строки нет — сервер не слушает порт (см. п. 2 ниже).

2. **Настройки в `postgresql.conf`:**
   - Файл обычно в `C:\Program Files\PostgreSQL\15\data\postgresql.conf` (или ваша версия).
   - Найдите строки (часто закомментированы `#`):
     - `listen_addresses = 'localhost'` или `'*'` — строка должна быть **без `#` в начале**.
     - `port = 5432` — тоже без `#`.
   - Если меняли файл — перезапустите службу: `Restart-Service -Name "postgresql-x64-15"`.

3. **Проверка подключения вручную:**
   ```powershell
   $env:PGPASSWORD = "ваш_пароль_из_.env.postgresql"
   & "C:\Program Files\PostgreSQL\15\bin\psql.exe" -h 127.0.0.1 -p 6432 -U domeo_user -d domeo_production -c "SELECT 1"
   ```
   Если здесь тоже "Connection refused" — проблема в настройке сервера или файрволе (шаги 1–2). Если ошибка **"password authentication failed"** или **"no pg_hba.conf entry"** — см. п. 4.

4. **Разрешить вход по паролю с 127.0.0.1 (pg_hba.conf):**
   - Файл: `C:\Program Files\PostgreSQL\15\data\pg_hba.conf`.
   - Добавьте строку (или измените метод для 127.0.0.1 на `md5` или `scram-sha-256`):
     ```
     host    all    all    127.0.0.1/32    md5
     ```
   - Перезапустите службу: `Restart-Service -Name "postgresql-x64-15"`.

### Как решить проблему с созданием дампа (пошагово)

Если `npm run sync:staging` пишет "Connection failed" или дамп не создаётся, пройдите по шагам:

**Шаг 1. Узнать точную ошибку**

В PowerShell выполните (пароль и порт — из `.env.postgresql`):

```powershell
$env:PGPASSWORD = "gmjRp3auQiBJ4hqlFHv9toOVnScCXYyD"
& "C:\Program Files\PostgreSQL\15\bin\psql.exe" -h 127.0.0.1 -p 6432 -U domeo_user -d domeo_production -c "SELECT 1"
```

Запомните текст ошибки: **Connection refused** / **password authentication failed** / **database "domeo_production" does not exist** / **role "domeo_user" does not exist**.

**Шаг 2. Порт**

- В `.env.postgresql` в `DATABASE_URL` должен быть тот же порт, что в `postgresql.conf` (у вас **6432**).
- Проверка: `netstat -aon | findstr "6432"` — должна быть строка `LISTENING`.

**Шаг 3. Доступ по паролю (pg_hba.conf)**

- Откройте `C:\Program Files\PostgreSQL\15\data\pg_hba.conf`.
- Добавьте в конец (или убедитесь, что есть строка для 127.0.0.1 с методом `md5` или `scram-sha-256`):
  ```
  host    all    all    127.0.0.1/32    md5
  ```
- Сохраните файл и перезапустите службу:
  ```powershell
  Restart-Service -Name "postgresql-x64-15"
  ```
- Снова выполните команду из шага 1.

**Шаг 4. Если ошибка "role \"domeo_user\" does not exist" или "database \"domeo_production\" does not exist"**

На этом экземпляре PostgreSQL (порт 6432) нет пользователя или БД для приложения. Их нужно создать один раз. Подключитесь суперпользователем `postgres` (пароль задаётся при установке PostgreSQL):

```powershell
& "C:\Program Files\PostgreSQL\15\bin\psql.exe" -h 127.0.0.1 -p 6432 -U postgres -d postgres
```

В консоли psql выполните (если пользователя или БД нет):

```sql
CREATE USER domeo_user WITH PASSWORD 'gmjRp3auQiBJ4hqlFHv9toOVnScCXYyD';
CREATE DATABASE domeo_production OWNER domeo_user;
\q
```

После этого снова проверьте шаг 1 под пользователем `domeo_user`.

**Шаг 5. Создание дампа вручную (если скрипт всё равно не создаёт)**

Если подключение из шага 1 успешно (`SELECT 1` вернул строку с 1), создайте дамп вручную и загрузите на ВМ:

```powershell
$env:PGPASSWORD = "gmjRp3auQiBJ4hqlFHv9toOVnScCXYyD"
& "C:\Program Files\PostgreSQL\15\bin\pg_dump.exe" -h 127.0.0.1 -p 6432 -U domeo_user -d domeo_production -F c -f "C:\01_conf\1002doors\scripts\output\full_backup.dump"
scp -i "C:\02_conf\ssh1702\ssh-key-1771306236042\ssh-key-1771306236042" "C:\01_conf\1002doors\scripts\output\full_backup.dump" petr@178.154.244.83:~/1002doors/
```

Затем на ВМ восстановите дамп и перезапустите приложение (или один раз запустите `npm run sync:staging` — дамп уже будет на сервере, скрипт его восстановит и перезапустит приложение).

## Что сделать вручную (если не используете sync:staging)

1. **Восстановить дамп** (если есть бэкап с данными каталога/пользователей):
   ```bash
   # С вашей машины (если дамп локально):
   scp -i "C:\02_conf\ssh1702\ssh-key-1771306236042\ssh-key-1771306236042" backup.dump petr@178.154.244.83:~/1002doors/
   # На сервере:
   pg_restore -h localhost -U domeo_user -d domeo --no-owner --no-acl ~/1002doors/backup.dump
   ```

2. **Загрузить фото** в `~/1002doors/public/uploads/` (архив из раздела 1.3 DEPLOY_YANDEX_CLOUD.md), распаковать на сервере.

3. **Перезапуск приложения** (после смены .env или кода):
   ```bash
   ssh petr@178.154.244.83
   pkill -f "node.*next start"   # или найти PID и kill
   cd ~/1002doors && NODE_ENV=production nohup npm run start > /tmp/domeo.log 2>&1 &
   ```

## Замечание

- В `prisma/schema.prisma` на сервере временно заменён `provider = "sqlite"` на `provider = "postgresql"` и применён `prisma db push` (миграции в репо — под SQLite). При следующем деплое из git эту замену нужно повторить или вести отдельную схему для PostgreSQL.
