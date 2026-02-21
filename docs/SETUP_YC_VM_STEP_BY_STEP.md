# Пошаговая настройка: проект на ВМ Yandex Cloud (158.160.74.180)

Один документ — все шаги по порядку: ключ на ПК, доступ к ВМ, установка на сервере, деплой.

**Важно:** везде, где указаны `petr2` (пользователь Windows) или `ubuntu` (пользователь на ВМ), подставьте свои значения при необходимости.

---

## Часть 1. На вашем компьютере (Windows)

### Шаг 1.1. Проверить или создать SSH-ключ

Откройте **PowerShell** и выполните:

```powershell
# Проверить, есть ли уже ключ
Get-ChildItem $env:USERPROFILE\.ssh -ErrorAction SilentlyContinue
```

- Если видите файлы `id_ed25519` и `id_ed25519.pub` (или `id_rsa` и `id_rsa.pub`) — ключ уже есть, переходите к шагу 1.2.
- Если папки `.ssh` нет или в ней нет ключей — создайте ключ:

```powershell
# Создать папку .ssh, если её нет
New-Item -ItemType Directory -Path "$env:USERPROFILE\.ssh" -Force
# Создать ключ (email можно заменить на свой)
ssh-keygen -t ed25519 -C "your_email@example.com" -f "$env:USERPROFILE\.ssh\id_ed25519" -N '""'
```

При запросе passphrase можно просто нажать Enter (пустой пароль) или задать пароль для большей безопасности.

---

### Шаг 1.2. Права на ключ (чтобы SSH не ругался)

Выполните **один раз** (подставьте свой путь к ключу, если он другой):

```powershell
icacls "$env:USERPROFILE\.ssh\id_ed25519" /inheritance:r /grant:r "${env:USERNAME}:R"
```

Если используете `id_rsa`:

```powershell
icacls "$env:USERPROFILE\.ssh\id_rsa" /inheritance:r /grant:r "${env:USERNAME}:R"
```

---

### Шаг 1.3. SSH config — удобное подключение к ВМ

Создайте или отредактируйте файл **`C:\Users\petr2\.ssh\config`** (замените `petr2` на ваше имя пользователя Windows).

Если файла нет:

```powershell
New-Item -ItemType File -Path "$env:USERPROFILE\.ssh\config" -Force
notepad "$env:USERPROFILE\.ssh\config"
```

Добавьте в файл блок (логин на ВМ чаще всего `ubuntu` для новых ВМ Yandex Cloud; если у вас другой — замените `User`):

```
Host domeo-yc
    HostName 158.160.74.180
    User ubuntu
    IdentityFile C:\Users\petr2\.ssh\id_ed25519
```

Сохраните и закройте. Если ключ у вас `id_rsa`, укажите в последней строке `id_rsa` вместо `id_ed25519`. Путь `C:\Users\petr2` замените на свой (например `C:\Users\ВашеИмя`).

---

### Шаг 1.4. Переменные окружения для скриптов деплоя

Чтобы скрипты проекта использовали вашу ВМ и ваш ключ (без хардкода в репозитории), задайте переменные.

**Вариант A — только для текущей сессии PowerShell:**

```powershell
$env:1002DOORS_SSH_KEY = "$env:USERPROFILE\.ssh\id_ed25519"
$env:1002DOORS_STAGING_HOST = "ubuntu@89.169.181.191"
```

(Если на ВМ пользователь не `ubuntu`, а например `petr`, напишите `petr@158.160.74.180`.)

**Вариант B — постоянно для вашего пользователя:**

1. Win+R → введите `sysdm.cpl` → Enter.
2. Вкладка **«Дополнительно»** → кнопка **«Переменные среды»**.
3. В блоке «Переменные среды пользователя» нажмите **«Создать»**:
   - Имя: `1002DOORS_SSH_KEY`  
   - Значение: `C:\Users\petr2\.ssh\id_ed25519` (ваш путь к ключу).
4. Создайте вторую переменную:
   - Имя: `1002DOORS_STAGING_HOST`  
   - Значение: `ubuntu@89.169.181.191` (или `petr@89.169.181.191`).
5. OK везде. **Новый PowerShell** откройте после этого.

Или одной командой в PowerShell (постоянно):

```powershell
[System.Environment]::SetEnvironmentVariable("1002DOORS_SSH_KEY", "$env:USERPROFILE\.ssh\id_ed25519", "User")
[System.Environment]::SetEnvironmentVariable("1002DOORS_STAGING_HOST", "ubuntu@89.169.181.191", "User")
```

---

### Шаг 1.5. Добавить ваш публичный ключ на ВМ

Сначала нужно как-то попасть на ВМ 158.160.74.180.

- **Если ВМ только что создана в Yandex Cloud** и при создании вы указывали SSH-ключ — этот ключ уже есть на ВМ. Тогда переходите к шагу 1.6 (проверка входа).
- **Если при создании ВМ ключ не указывали** (вход по паролю) или ВМ создавал кто-то другой:
  1. Зайдите на ВМ через **консоль в браузере**: [Yandex Cloud Console](https://console.yandex.cloud/) → Compute Cloud → Виртуальные машины → выберите ВМ с IP 158.160.74.180 → **«Подключиться»** (или Serial console).
  2. Войдите под пользователем, под которым будете работать (например `ubuntu`).
  3. Выполните на ВМ (одной строкой скопируйте и вставьте **содержимое вашего файла .pub** вместо `ВАША_ПУБЛИЧНАЯ_КЛЮЧ`):

```bash
mkdir -p ~/.ssh
echo "ВАША_ПУБЛИЧНАЯ_КЛЮЧ" >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

Содержимое `.pub` на Windows посмотреть так:

```powershell
Get-Content "$env:USERPROFILE\.ssh\id_ed25519.pub"
```

Скопируйте всю строку (начинается с `ssh-ed25519` и заканчивается комментарием) и вставьте в кавычки в команду `echo "..."` на ВМ.

---

### Шаг 1.6. Проверить вход по SSH с ПК

В PowerShell:

```powershell
ssh domeo-yc
```

Должен произойти вход на ВМ без запроса пароля. Если попросит пароль — проверьте шаг 1.5 (публичный ключ в `authorized_keys`) и путь к ключу в `config`. Выйти с ВМ: `exit`.

---

## Часть 2. В консоли Yandex Cloud (сеть)

### Шаг 2.1. Открыть порты в группе безопасности

1. Откройте [консоль Yandex Cloud](https://console.yandex.cloud/) → **VPC** → **Группы безопасности** (или ВМ → вкладка «Сеть» → группа безопасности).
2. Выберите группу, привязанную к ВМ 158.160.74.180.
3. Добавьте **входящие** правила, если их ещё нет:

| Порт  | Назначение      | Источник   |
|-------|-----------------|------------|
| 22    | SSH             | 0.0.0.0/0 или ваш IP |
| 3000  | Приложение      | 0.0.0.0/0 или ваш IP |

Сохраните. Исходящий трафик обычно уже разрешён.

---

## Часть 3. На виртуальной машине (158.160.74.180)

Подключайтесь: `ssh domeo-yc`. Все команды ниже выполняются **на ВМ**.

### Шаг 3.1. Обновить систему и установить PostgreSQL

```bash
sudo apt update && sudo apt install -y postgresql-16 postgresql-contrib
```

Создать пользователя и базу:

```bash
sudo -u postgres createuser -s domeo_user
sudo -u postgres psql -c "ALTER USER domeo_user WITH PASSWORD 'ваш_надёжный_пароль';"
sudo -u postgres createdb -O domeo_user domeo
```

Пароль запомните — он понадобится для `DATABASE_URL` в `.env`. Проверка:

```bash
psql -U domeo_user -d domeo -h localhost -c 'SELECT 1'
```

Должна вывести строку с `1`.

---

### Шаг 3.2. Установить Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

Должно быть v20.x.

---

### Шаг 3.3. Клонировать репозиторий

Подставьте ваш репозиторий (HTTPS или SSH). Пример для GitHub:

```bash
cd ~
git clone https://github.com/domeo3dmodeler-art/1202doors.git 1002doors
cd 1002doors
```

Если репозиторий приватный, на ВМ можно настроить свой SSH-ключ или использовать HTTPS с токеном.

---

### Шаг 3.4. Настроить .env на ВМ

Создайте файл с переменными (пароль БД подставьте свой из шага 3.1):

```bash
nano ~/1002doors/.env
```

Минимальное содержимое:

```env
DATABASE_URL="postgresql://domeo_user:ваш_надёжный_пароль@localhost:5432/domeo?schema=public"
NODE_ENV=production
JWT_SECRET=придумайте-секрет-не-короче-32-символов-для-jwt
```

Сохраните: Ctrl+O, Enter, Ctrl+X. Секрет для JWT можно сгенерировать на ВМ: `openssl rand -base64 32`.

---

### Шаг 3.5. Установить зависимости, Prisma и миграции

Установка с **`--ignore-scripts`** отключает postinstall/preinstall у всех пакетов (защита от вредоносного кода в зависимостях, см. docs/NPM_SUPPLY_CHAIN_SECURITY.md). Prisma generate запускаем вручную после установки.

```bash
cd ~/1002doors
npm ci --ignore-scripts
npx prisma generate
npx prisma migrate deploy
```

Если миграций ещё не было в репозитории, может понадобиться `npx prisma db push` — смотрите сообщения в консоли.

---

### Шаг 3.6. Сборка приложения

```bash
cd ~/1002doors
npm run build
```

Дождитесь окончания без ошибок.

---

### Шаг 3.7. Запуск через systemd (чтобы приложение не падало и поднималось после перезагрузки)

Замените `ubuntu` на вашего пользователя на ВМ, если другой (например `petr`). Узнать: `whoami`.

```bash
sudo tee /etc/systemd/system/domeo-staging.service << 'EOF'
[Unit]
Description=Domeo 1002doors
After=network.target postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/1002doors
Environment=NODE_ENV=production
EnvironmentFile=/home/ubuntu/1002doors/.env
ExecStart=/usr/bin/npx next start -H 0.0.0.0 -p 3000
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

Если пользователь `petr`, в строках `User=` и путях замените `ubuntu` на `petr` (например `User=petr`, `/home/petr/1002doors`).

Затем:

```bash
sudo systemctl daemon-reload
sudo systemctl enable domeo-staging
sudo systemctl start domeo-staging
sudo systemctl status domeo-staging
```

В статусе должно быть `active (running)`. Логи: `journalctl -u domeo-staging -f` (выход: Ctrl+C).

---

### Шаг 3.8. Проверка в браузере

Откройте:

- http://158.160.74.180:3000  
- http://158.160.74.180:3000/api/health  

Если health возвращает JSON с `database.status: 'ok'` — БД и приложение настроены верно. Если страница не открывается — проверьте группу безопасности (порт 3000) и `sudo systemctl status domeo-staging`.

---

## Часть 4. Дальнейшие действия (данные и деплой)

### Синхронизация БД и фото с локальной машины

На вашем ПК должны быть запущены PostgreSQL с актуальными данными и заданы переменные из шага 1.4. Тогда из корня проекта:

```powershell
cd c:\01_conf\1002doors
npm run sync:staging
```

Скрипт зальёт дамп БД и при необходимости фото на ВМ 158.160.74.180 (если в скрипте используется `1002DOORS_STAGING_HOST`). Подробности: [DEPLOY_YANDEX_CLOUD.md](./DEPLOY_YANDEX_CLOUD.md) и [STAGING_READY.md](./STAGING_READY.md).

### Деплой кода (без полной синхронизации)

Залить только код и пересобрать на ВМ:

```powershell
.\scripts\deploy-local-to-staging.ps1
```

Или только залить файлы, сборку выполнить на ВМ вручную:

```powershell
.\scripts\deploy-local-to-staging.ps1 -SkipBuild
```

Перезапуск приложения на ВМ с вашего ПК:

```powershell
.\scripts\restart-staging-app.ps1
```

---

## Чеклист

- [ ] **1.1** На ПК есть SSH-ключ (`~/.ssh/id_ed25519` или `id_rsa`).
- [ ] **1.2** Права на ключ исправлены (`icacls`).
- [ ] **1.3** В `~/.ssh/config` добавлен хост `domeo-yc` для 158.160.74.180.
- [ ] **1.4** Заданы переменные `1002DOORS_SSH_KEY` и `1002DOORS_STAGING_HOST`.
- [ ] **1.5** Публичный ключ добавлен в `authorized_keys` на ВМ.
- [ ] **1.6** Вход по `ssh domeo-yc` работает без пароля.
- [ ] **2.1** В группе безопасности открыты порты 22 и 3000.
- [ ] **3.1** PostgreSQL установлен, созданы пользователь и БД `domeo`.
- [ ] **3.2** Установлен Node.js 20.
- [ ] **3.3** Репозиторий склонирован в `~/1002doors`.
- [ ] **3.4** В `~/1002doors/.env` заданы `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`.
- [ ] **3.5** Выполнены `npm ci --ignore-scripts`, `prisma generate`, `prisma migrate deploy`.
- [ ] **3.6** Выполнен `npm run build`.
- [ ] **3.7** Создан и запущен юнит `domeo-staging`, приложение в статусе active.
- [ ] **3.8** http://158.160.74.180:3000 и `/api/health` открываются и отвечают.

После этого можно пользоваться `npm run sync:staging` и `.\scripts\deploy-local-to-staging.ps1` для обновления данных и кода на ВМ.
