# Деплой артефактом (standalone): без npm на ВМ — решение проблемы SSH и трафика

## В чём суть

- **Сборка только у вас на ПК** (или в CI): `npm ci --ignore-scripts`, `prisma generate`, `npm run build`. Получается готовый билд Next.js в формате **standalone** (папка `.next/standalone` + static + public).
- **На ВМ** вы только загружаете архив с этим билдом и запускаете **`node server.js`**. Команды **`npm install` / `npm ci` на ВМ не выполняются**.
- В результате на ВМ **не выполняются скрипты пакетов** (postinstall и т.д.), **нет массовой загрузки** зависимостей из интернета, нет риска вредоносного кода из npm и аномального трафика. SSH не страдает от перегруженной или «заражённой» после деплоя машины.

Это **кардинальное** решение проблем «после деплоя пропадает SSH» и «огромный расход трафика после установки библиотек».

---

## Как деплоить (обычный деплой)

1. Задайте переменные окружения (если ещё не заданы; по умолчанию скрипт использует ключ и хост ниже):
   ```powershell
   $env:1002DOORS_SSH_KEY = "C:\Users\petr2\.ssh\ssh-key-1771510238528\ssh-key-1771510238528"
   $env:1002DOORS_STAGING_HOST = "ubuntu@158.160.13.144"
   ```
2. Запустите:
   ```powershell
   .\scripts\deploy-standalone-to-vm.ps1
   ```
   Скрипт локально соберёт проект, упакует standalone-артефакт, загрузит его на ВМ в `~/domeo-app`, распакует и перезапустит приложение. На ВМ **npm не вызывается**.

---

## Первая настройка ВМ (один раз)

На новой ВМ нужно установить только **Node.js** и создать каталог приложения, `.env` и systemd-юнит. Репозиторий и `npm install` на ВМ **не нужны**.

### 1. Подключиться к ВМ

Через консоль Yandex Cloud или по SSH (ключ должен быть в метаданных ВМ).

### 2. Установить Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

### 3. Установить PostgreSQL (если ещё не установлен)

```bash
sudo apt update && sudo apt install -y postgresql postgresql-contrib
sudo -u postgres createuser -s domeo_user
echo "ALTER USER domeo_user WITH PASSWORD 'ваш_пароль';" | sudo -u postgres psql
sudo -u postgres createdb -O domeo_user domeo
```

### 4. Создать каталоги приложения и временный для дампа, .env

```bash
mkdir -p ~/domeo-app ~/1002doors
nano ~/domeo-app/.env
```
(Каталог `~/1002doors` нужен для загрузки дампа при `npm run sync:staging`.)

Содержимое `.env` (подставьте пароль БД):

```env
DATABASE_URL="postgresql://domeo_user:ваш_пароль@localhost:5432/domeo?schema=public"
NODE_ENV=production
JWT_SECRET=ваш-секрет-не-короче-32-символов
```

Сохраните (Ctrl+O, Enter, Ctrl+X).

### 5. Systemd-юнит для standalone (node server.js)

```bash
sudo tee /etc/systemd/system/domeo-standalone.service << 'EOF'
[Unit]
Description=Domeo 1002doors (standalone)
After=network.target postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/domeo-app
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
EnvironmentFile=/home/ubuntu/domeo-app/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable domeo-standalone
```

Если пользователь не `ubuntu`, замените `User` и пути на своего (например `petr`, `/home/petr/domeo-app`).

### 6. Первый деплой с вашего ПК

С вашего компьютера выполните:

```powershell
.\scripts\deploy-standalone-to-vm.ps1
```

После загрузки и распаковки артефакта на ВМ запустите сервис (если скрипт не перезапустил его сам):

```bash
sudo systemctl start domeo-standalone
sudo systemctl status domeo-standalone
```

Проверка: `curl -s http://localhost:3000/api/health`.

---

## Отличие от старого способа (git pull / npm ci на ВМ)

| | Деплой артефактом (standalone) | Деплой с npm на ВМ |
|--|--------------------------------|---------------------|
| npm install/ci на ВМ | **Нет** | Да |
| Скрипты пакетов на ВМ | **Не выполняются** | Выполняются (даже с --ignore-scripts часть рисков остаётся) |
| Загрузка пакетов на ВМ | **Нет** (загружается только архив билда) | Сотни МБ из registry |
| Риск трафика/вредоносного кода от зависимостей | **Минимален** | Есть |
| Нагрузка на ВМ при деплое | Небольшая (распаковка, перезапуск) | Высокая (npm, сборка) |
| SSH после деплоя | Стабилен (ВМ не перегружена, нет посторонних процессов) | Может пропадать при перегрузке или сбоях |

---

## Синхронизация БД и фото

Данные и фото по-прежнему можно переносить через **`npm run sync:staging`** с вашего ПК. Скрипт загружает дамп в `~/1002doors` на ВМ, восстанавливает БД и перезапускает приложение (сначала пробует **domeo-standalone**, затем domeo-staging). Чтобы загрузка дампа работала, на ВМ создайте каталог: `mkdir -p ~/1002doors` (даже при деплое только standalone). Убедитесь, что `1002DOORS_STAGING_HOST` указывает на нужную ВМ.

---

## Если на ВМ уже был деплой через 1002doors и npm

Можно перейти на standalone на той же ВМ:

1. Создайте каталог и .env: `mkdir -p ~/domeo-app`, создайте `~/domeo-app/.env` с тем же `DATABASE_URL` и секретами, что и в `~/1002doors/.env`.
2. Добавьте systemd-юнит `domeo-standalone` (см. выше), отключите старый юнит: `sudo systemctl stop domeo-staging; sudo systemctl disable domeo-staging`.
3. С вашего ПК выполните `.\scripts\deploy-standalone-to-vm.ps1`.
4. Запустите `sudo systemctl start domeo-standalone`. Дальше деплой делайте только через `deploy-standalone-to-vm.ps1`.

Старую папку `~/1002doors` можно потом удалить или оставить для справки.
