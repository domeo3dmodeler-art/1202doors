# Новая ВМ в Yandex Cloud: создание и правильный деплой с первого раза

Чеклист, чтобы новая ВМ не теряла SSH и не расходовала лишний трафик. Все шаги — в правильном порядке.

**Подставьте вместо `<НОВЫЙ_IP>` реальный публичный IP новой ВМ после создания.**

---

## Этап 1. Подготовка на ПК (до создания ВМ)

### 1.1. Ключ и публичная строка

- У вас уже есть пара ключей (например `C:\Users\petr2\.ssh\ssh-key-1771392782781\`). Права на ключ:  
  `icacls "C:\Users\petr2\.ssh\ssh-key-1771392782781\ssh-key-1771392782781" /inheritance:r /grant:r "%USERNAME%:R"`
- Скопируйте **публичный ключ** (целиком одну строку):
  ```powershell
  Get-Content "C:\Users\petr2\.ssh\ssh-key-1771392782781\ssh-key-1771392782781.pub"
  ```
  Сохраните в блокнот — понадобится при создании ВМ.

### 1.2. (По желанию) Ваш IP для SSH

- Если хотите открыть порт 22 только со своего IP: узнайте его на [2ip.ru](https://2ip.ru) или через `(Invoke-WebRequest -Uri "https://api.ipify.org" -UseBasicParsing).Content`. Для доступа тестировщиков к приложению порт 3000 лучше оставить открытым для всех (см. ниже).

---

## Этап 2. Создание ВМ в Yandex Cloud

1. [Консоль Yandex Cloud](https://console.yandex.cloud/) → **Compute Cloud** → **Виртуальные машины** → **Создать ВМ**.

2. **Параметры:**
   - Имя: например `domeo-staging2`
   - Образ: **Ubuntu 22.04 LTS**
   - Платформа: по умолчанию (Intel Ice Lake и т.п.)
   - vCPU: 4, RAM: 8 GB, диск SSD 60–80 GB
   - Сеть: выберите существующую подсеть
   - **Публичный адрес:** выдать

3. **Доступ (важно — чтобы SSH не пропадал):**
   - В блоке **«Доступ»** / **«Метод входа»** выберите **SSH-ключ**.
   - Вставьте **скопированную строку публичного ключа** (шаг 1.1).  
   Так ключ попадёт в метаданные ВМ и будет записан в `~/.ssh/authorized_keys` при первом запуске. В дальнейшем cloud-init не будет затирать ваш ключ, если он есть в метаданных.

4. **Группа безопасности:**
   - Создайте или выберите группу безопасности.
   - **Входящие правила:**
     - Порт **22** (SSH): источник **0.0.0.0/0** (или только ваш IP для большей безопасности).
     - Порт **3000** (приложение): источник **0.0.0.0/0** — чтобы тестировщики и вы могли заходить с любых адресов. Трафик от ботов при этом возможен; снизить его можно отключением автообновлений ОС (шаг 4.3) и мониторингом (логи, `ss`, при необходимости позже — rate limiting или прокси).
   - Исходящие: разрешить всё (или по политике).

5. Создайте ВМ, дождитесь статуса «Работает», скопируйте **публичный IP** — это ваш `<НОВЫЙ_IP>`.

---

## Этап 3. Настройка ПК под новую ВМ

### 3.1. SSH config

В файл `C:\Users\<ваш_логин>\.ssh\config` добавьте (подставьте путь к ключу и IP):

```
Host domeo-yc-new
    HostName <НОВЫЙ_IP>
    User ubuntu
    IdentityFile C:\Users\petr2\.ssh\ssh-key-1771392782781\ssh-key-1771392782781
```

### 3.2. Переменные окружения для скриптов

Чтобы деплой и синхронизация шли на новую ВМ:

```powershell
[System.Environment]::SetEnvironmentVariable("1002DOORS_SSH_KEY", "C:\Users\petr2\.ssh\ssh-key-1771392782781\ssh-key-1771392782781", "User")
[System.Environment]::SetEnvironmentVariable("1002DOORS_STAGING_HOST", "ubuntu@<НОВЫЙ_IP>", "User")
```

Откройте **новое** окно PowerShell после этого.

### 3.3. Проверка входа

Подключитесь **без VPN**:

```powershell
ssh domeo-yc-new
```

Должен войти без пароля. Если ключ был добавлен при создании ВМ (шаг 2.3), дополнительно ничего делать не нужно.

---

## Этап 4. Установка на новой ВМ (всё по правилам)

Подключитесь: `ssh domeo-yc-new`. Все команды ниже — на ВМ.

### 4.1. PostgreSQL

```bash
sudo apt update && sudo apt install -y postgresql postgresql-contrib
sudo -u postgres createuser -s domeo_user
echo "ALTER USER domeo_user WITH PASSWORD 'ваш_надёжный_пароль';" | sudo -u postgres psql
sudo -u postgres createdb -O domeo_user domeo
```

Пароль запомните — нужен для `.env`. Проверка:  
`PGPASSWORD=ваш_пароль psql -U domeo_user -d domeo -h localhost -c 'SELECT 1'`

### 4.2. Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

### 4.3. (По желанию) Отключить автообновления ОС — меньше трафика

```bash
sudo systemctl stop unattended-upgrades 2>/dev/null
sudo systemctl disable unattended-upgrades 2>/dev/null
```

### 4.4. Клонирование репозитория

```bash
cd ~
git clone https://github.com/domeo3dmodeler-art/1202doors.git 1002doors
cd 1002doors
```

В `prisma/schema.prisma` на ВМ должен быть `provider = "postgresql"`. Если в репо ещё `sqlite`, замените на ВМ:  
`sed -i 's/provider = "sqlite"/provider = "postgresql"/' ~/1002doors/prisma/schema.prisma`

### 4.5. Файл .env

```bash
nano ~/1002doors/.env
```

Содержимое (подставьте пароль БД из шага 4.1):

```env
DATABASE_URL="postgresql://domeo_user:ваш_надёжный_пароль@localhost:5432/domeo?schema=public"
NODE_ENV=production
JWT_SECRET=придумайте-секрет-не-короче-32-символов
```

### 4.6. Установка зависимостей и схема БД (без выполнения скриптов пакетов)

```bash
cd ~/1002doors
npm ci --ignore-scripts
npx prisma generate
npx prisma db push
```

(Если используете миграции: `npx prisma migrate deploy` вместо `db push`.)

### 4.7. Сборка

```bash
npm run build
```

### 4.8. Systemd-сервис

Подставьте имя пользователя (обычно `ubuntu`):

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

sudo systemctl daemon-reload
sudo systemctl enable domeo-staging
sudo systemctl start domeo-staging
sudo systemctl status domeo-staging
```

### 4.9. Проверка

На ВМ: `curl -s http://localhost:3000/api/health`.  
С ПК или у тестировщиков в браузере: `http://<НОВЫЙ_IP>:3000`.

---

## Этап 5. Данные и фото (при необходимости)

- С вашего ПК (PostgreSQL запущен, переменные `1002DOORS_SSH_KEY` и `1002DOORS_STAGING_HOST` указывают на новую ВМ):
  ```powershell
  npm run sync:staging
  ```
- Либо восстановите дамп и загрузите фото вручную по инструкциям из `docs/DEPLOY_YANDEX_CLOUD.md`.

---

## Краткий чеклист «всё сделано правильно»

- [ ] При создании ВМ **SSH-ключ добавлен в метаданные** (блок «Доступ») — ключ не пропадёт после перезагрузки.
- [ ] В группе безопасности порт **3000** открыт (0.0.0.0/0), чтобы тестировщики могли заходить; при необходимости трафик снижают отключением unattended-upgrades и мониторингом.
- [ ] На ВМ зависимости установлены через **`npm ci --ignore-scripts`**, затем вручную **`npx prisma generate`** — скрипты пакетов не выполняются.
- [ ] (По желанию) **unattended-upgrades** отключён — меньше фонового трафика.
- [ ] На ПК заданы **1002DOORS_SSH_KEY** и **1002DOORS_STAGING_HOST** для новой ВМ — деплой и sync идут на неё.
- [ ] Подключение к ВМ проверено **без VPN** (`ssh domeo-yc-new`).

Дальше деплой кода — через `.\scripts\deploy-local-to-staging.ps1` или `-UseGit`; везде на ВМ уже используется безопасная установка (`npm ci --ignore-scripts` + `prisma generate`).
