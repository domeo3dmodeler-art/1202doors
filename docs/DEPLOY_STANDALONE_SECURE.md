# Безопасная сборка и standalone-деплой (Next.js + Puppeteer) для YC ВМ

## 0) Цели и принципы

**Цель:** воспроизводимая "чистая" сборка и деплой, где:

* сборка идёт **только в доверенной среде** (локально/CI/Docker),
* на ВМ **нет** `git pull`, `npm install`, `npm run build`,
* на ВМ только запуск готового артефакта и системные зависимости,
* Puppeteer использует **системный Chrome**, npm не скачивает браузер.

---

## 1) Привести проект к безопасной схеме Puppeteer

### 1.1. Зависимости

В `package.json` оставляем **только `puppeteer-core`**.

* Удалить (если есть):

  * `puppeteer`
  * `puppeteer-extra`
  * `puppeteer-extra-plugin-stealth`
  * `@sparticuz/chromium` (это для serverless, на ВМ не нужно)

* Добавить:

  * `puppeteer-core`

**Команды:**

```bash
# локально (в доверенной среде)
rm -rf node_modules package-lock.json
npm install
git add package.json package-lock.json
git commit -m "chore: use puppeteer-core + system chrome"
```

### 1.2. Код запуска браузера

В коде генерации PDF:

* Используй `executablePath` **только из env** на сервере.
* Добавь безопасные args для VPS.

Пример (идея, подстрой под ваш файл):

```ts
import puppeteer from "puppeteer-core";

const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
if (!executablePath) {
  throw new Error("PUPPETEER_EXECUTABLE_PATH is required on server");
}

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
  ],
});
```

**Важно:** Для PDF/рендера вам **не нужен stealth**.

---

## 2) Настроить Next.js standalone

### 2.1. `next.config.js`

Убедись, что включено:

```js
module.exports = {
  output: "standalone",
};
```

### 2.2. Что будет артефактом

После `npm run build` вам нужен минимум:

* `.next/standalone`
* `.next/static`
* `public`
* (опционально) `prisma` + миграции/схема, если Prisma требуется на runtime
* `.env.production` **не кладём в git**, но можно положить на сервер отдельно.

---

## 3) Сборка "чистого артефакта" (локально или CI)

### Вариант A — локально (быстро)

Создай `scripts/build-artifact.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

APP_NAME="1002doors"
OUT_DIR="dist"
ARTIFACT="${OUT_DIR}/${APP_NAME}-artifact.tar.gz"

rm -rf .next node_modules "${OUT_DIR}"
mkdir -p "${OUT_DIR}"

# 1) чистая установка зависимостей строго по lockfile
npm ci

# 2) сборка
npm run build

# 3) проверка что standalone создан
test -f .next/standalone/server.js

# 4) упаковать артефакт
tar -czf "${ARTIFACT}" \
  .next/standalone \
  .next/static \
  public \
  package.json

# 5) sha256 для проверки на сервере
sha256sum "${ARTIFACT}" | tee "${ARTIFACT}.sha256"

echo "OK: ${ARTIFACT}"
echo "OK: ${ARTIFACT}.sha256"
```

Сделай исполняемым:

```bash
chmod +x scripts/build-artifact.sh
```

Запуск:

```bash
./scripts/build-artifact.sh
```

### Вариант B — Docker сборка (самый "чистый" локальный вариант)

Создай `Dockerfile.build`:

```dockerfile
FROM node:20-bookworm AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

RUN test -f .next/standalone/server.js

RUN mkdir -p /out && \
    tar -czf /out/artifact.tar.gz \
      .next/standalone \
      .next/static \
      public \
      package.json

RUN sha256sum /out/artifact.tar.gz > /out/artifact.tar.gz.sha256
```

Сборка и получение артефакта:

```bash
docker build -f Dockerfile.build -t doors-build .
docker create --name doors-build-temp doors-build
docker cp doors-build-temp:/out/artifact.tar.gz ./dist/1002doors-artifact.tar.gz
docker cp doors-build-temp:/out/artifact.tar.gz.sha256 ./dist/1002doors-artifact.tar.gz.sha256
docker rm -f doors-build-temp
```

---

## 4) Подготовка новой "чистой" ВМ (рекомендуется)

Если была атака/подозрение на компрометацию — **делай новую ВМ**.

### 4.1. Security Group (обязательно)

* **22/tcp**: только твой IP (или VPN/bastion)
* **80/tcp**: публично (если нужен сайт)
* **443/tcp**: публично (если есть TLS)
* **3000/tcp**: **ЗАКРЫТЬ извне полностью**
* Остальное: закрыто

### 4.2. На ВМ создаём пользователя/папки

```bash
sudo mkdir -p /opt/1002doors/releases
sudo mkdir -p /opt/1002doors/shared
sudo mkdir -p /opt/1002doors/shared/logs
sudo chown -R ubuntu:ubuntu /opt/1002doors
```

---

## 5) Установка системных зависимостей на ВМ

### 5.1. Node.js

Лучше ставить из официального источника или через nvm. Но главное — **фиксировать major** (например Node 20).

### 5.2. Google Chrome (не snap)

Ставим `.deb` (как вы уже делали), пример:

```bash
sudo apt-get update
sudo apt-get install -y ./google-chrome-stable_current_amd64.deb
which google-chrome-stable
# должно быть /usr/bin/google-chrome-stable
```

### 5.3. Проверка Chrome

```bash
/usr/bin/google-chrome-stable --version
```

---

## 6) Деплой артефакта на ВМ (без сборки)

### 6.1. Загрузка артефакта

С локальной машины:

```bash
scp dist/1002doors-artifact.tar.gz ubuntu@<VM_IP>:/tmp/
scp dist/1002doors-artifact.tar.gz.sha256 ubuntu@<VM_IP>:/tmp/
```

### 6.2. Проверка хэша на ВМ

```bash
cd /tmp
sha256sum -c 1002doors-artifact.tar.gz.sha256
# должно быть: OK
```

### 6.3. Развёртывание "релиза"

```bash
set -e
REL_ID="$(date +%Y%m%d_%H%M%S)"
REL_DIR="/opt/1002doors/releases/${REL_ID}"

mkdir -p "${REL_DIR}"
tar -xzf /tmp/1002doors-artifact.tar.gz -C "${REL_DIR}"

# .next/static должен лежать рядом со standalone
ls -la "${REL_DIR}/.next/standalone"
ls -la "${REL_DIR}/.next/static"

# переключаем "current" на новый релиз
ln -sfn "${REL_DIR}" /opt/1002doors/current
```

---

## 7) ENV и секреты (на ВМ, отдельно от артефакта)

Создай файл:

```bash
nano /opt/1002doors/shared/.env.production
```

Минимум:

```env
NODE_ENV=production
PORT=3000
PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

# prisma/db
DATABASE_URL=postgresql://...

# любые ваши секреты
JWT_SECRET=...
```

Права:

```bash
chmod 600 /opt/1002doors/shared/.env.production
```

---

## 8) systemd сервис для standalone

Создай `/etc/systemd/system/domeo-staging.service`:

```ini
[Unit]
Description=Domeo Doors Staging (Next.js standalone)
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/1002doors/current

EnvironmentFile=/opt/1002doors/shared/.env.production
ExecStart=/usr/bin/node /opt/1002doors/current/.next/standalone/server.js

Restart=always
RestartSec=2
KillSignal=SIGINT
TimeoutStopSec=30

# безопасность
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Применить:

```bash
sudo systemctl daemon-reload
sudo systemctl enable domeo-staging
sudo systemctl restart domeo-staging
sudo systemctl status domeo-staging --no-pager
```

Логи:

```bash
journalctl -u domeo-staging -n 200 --no-pager
```

---

## 9) Nginx reverse proxy (80 → 3000)

Конфиг `/etc/nginx/sites-available/1002doors`:

```nginx
server {
  listen 80;
  server_name _;

  client_max_body_size 20m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_read_timeout 60s;
    proxy_connect_timeout 10s;
    proxy_send_timeout 60s;
  }
}
```

Включить:

```bash
sudo ln -sfn /etc/nginx/sites-available/1002doors /etc/nginx/sites-enabled/1002doors
sudo nginx -t
sudo systemctl reload nginx
```

**Важно:** порт 3000 наружу закрыт, Nginx ходит на localhost.

---

## 10) Rollback (если релиз сломан)

Посмотреть релизы:

```bash
ls -la /opt/1002doors/releases
```

Переключиться на старый:

```bash
ln -sfn /opt/1002doors/releases/<OLD_REL_ID> /opt/1002doors/current
sudo systemctl restart domeo-staging
```

---

## 11) Мини-проверки "чистоты" на ВМ после деплоя

### 11.1. Нет лишних открытых портов

```bash
ss -tulpn
```

Должно быть:

* 22 (ssh)
* 80 (nginx)
* 3000 **только** 127.0.0.1 (или вообще не слушать внешние интерфейсы)

### 11.2. Нет странных процессов

```bash
ps aux --sort=-%cpu | head
ps aux --sort=-%mem | head
systemctl list-units --type=service --state=running
```

### 11.3. Проверка исходящего трафика (быстро)

```bash
sudo apt-get install -y iftop
sudo iftop -n
```

Если видишь постоянные подозрительные коннекты — это уже "не про сканеры".

---

## 12) "Золотое правило" безопасности

**Никогда**:

* не делать `git pull && npm install && npm run build` на ВМ,
* не держать открытым 3000 наружу,
* не полагаться только на fail2ban против объёмного мусора.

**Всегда**:

* деплоить только артефакт,
* проверять sha256,
* держать аварийный доступ (serial console) и второй ключ/пользователя.

---

## 13) Быстрый чек-лист деплоя

1. Локально: `./scripts/build-artifact.sh`
2. SCP артефакт + sha256 на ВМ
3. На ВМ: `sha256sum -c ...`
4. Распаковать в новый релиз → `current` symlink
5. `systemctl restart domeo-staging`
6. `curl -I http://localhost:3000` и `curl -I http://<VM_IP>/`
7. Проверить `journalctl -u domeo-staging`
