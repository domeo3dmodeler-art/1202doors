# Dev-режим на ВМ: настройка и быстрые правки

Цель: на ВМ запущен `next dev`, вы правите код локально, копируете один файл скриптом — Next пересобирает за секунды. Доступ по http://89.169.181.191 через Nginx.

**Краткий workflow:** см. **[SYNC_LOCAL_TO_VM.md](SYNC_LOCAL_TO_VM.md)** — один скрипт `.\scripts\sync-and-run-vm.ps1` (или `npm run vm:sync`) для синхронизации и запуска dev на ВМ, затем `push-one-file-to-vm.ps1` для правок.

---

## Предварительные условия на ВМ

- **Node.js 20** (или 18+), **npm**
- Каталог приложения: по умолчанию **~/domeo-app** (или задайте `1002DOORS_STAGING_REMOTE_PATH`)
- **.env** в этом каталоге (DATABASE_URL, NODE_ENV, JWT_SECRET). В архив синхронизации .env не входит — не перезаписывается.
- **Nginx** с конфигом из `scripts/output/domeo-nginx.conf` (отдельные location для `/_next/static/`, `/_next/webpack-hmr`, `/uploads/`). Применить: `.\scripts\apply-nginx-to-vm.ps1`
- В **next.config.mjs** уже указано: `allowedDevOrigins: ['http://89.169.181.191', ...]` — без этого запросы с публичного IP к dev-серверу блокируются и UI остаётся скелетоном.

---

## Пошаговая настройка (один раз)

### 1. Остановить production

Чтобы порт 3000 был свободен и systemd не перезапускал `node server.js`:

```powershell
.\scripts\stop-vm-production.ps1
```

Скрипт останавливает юнит `domeo-standalone` и завершает процесс на порту 3000.

### 2. Синхронизировать исходники на ВМ

**Вариант A — полный архив (без rsync):**

```powershell
.\scripts\sync-full-sources-to-vm.ps1
```

В архив входят: app, lib, components, hooks, prisma, public, styles, globals.css, next.config.mjs, tsconfig.json, postcss.config.js, tailwind.config.js, middleware.ts, package.json, package-lock.json. Папка public/uploads не включается (на ВМ не трогаем).

**Вариант B — rsync (только изменённые файлы):**

Требуется rsync (например Git for Windows):

```powershell
.\scripts\sync-to-vm.ps1
```

### 3. Установить зависимости на ВМ

**Важно:** `npm install` может долго выполняться и обрываться по SSH. Надёжнее запускать его **на ВМ в screen/tmux**:

```bash
ssh -i <ключ> ubuntu@89.169.181.191
screen -S dev
cd ~/domeo-app
npm install
# при OOM: npm install --ignore-scripts && npx prisma generate
```

Либо с хоста (если соединение стабильное):

```powershell
.\scripts\setup-vm-fast-edits.ps1 -SkipSync -SkipStart
```

(выполнит только npm install по SSH). При обрыве — повторить на ВМ в screen.

### 4. Запустить next dev на ВМ

С хоста:

```powershell
.\scripts\start-vm-dev.ps1
```

Скрипт сам вызовет `stop-vm-production.ps1`, затем запустит в фоне `npx next dev -p 3000 -H 0.0.0.0`. Логи: `~/domeo-app/logs/next-dev.log`.

Или вручную на ВМ (в screen):

```bash
cd ~/domeo-app
mkdir -p logs
nohup npx next dev -p 3000 -H 0.0.0.0 >> logs/next-dev.log 2>&1 &
# или в foreground: npm run dev
```

### 5. Проверить

- В браузере: http://89.169.181.191 (страница должна открываться, не 502).
- Логи на ВМ: `tail -f ~/domeo-app/logs/next-dev.log` — должно быть сообщение Ready.

---

## Режим быстрых правок

1. Меняете файл локально.
2. Копируете его на ВМ:
   ```powershell
   .\scripts\push-one-file-to-vm.ps1 app\api\catalog\hardware\route.ts
   ```
3. Next dev на ВМ пересобирает файл за несколько секунд; обновите страницу в браузере.

Путь в скрипте — **от корня проекта**, с обратными слэшами в PowerShell или прямыми в кавычках.

---

## Что может ломаться и как чинить

### 502 Bad Gateway

- **Причина:** на порту 3000 ничего не слушает или процесс падает.
- **Проверить на ВМ:**  
  `ss -tlnp | grep 3000`  
  `tail -50 ~/domeo-app/logs/next-dev.log`
- **Сделать:** убедиться, что production остановлен (`.\scripts\stop-vm-production.ps1`), затем заново запустить dev (`.\scripts\start-vm-dev.ps1`). Если в логах ошибки (например отсутствует модуль) — на ВМ выполнить `npm install` и при необходимости `npx prisma generate`.

### Страница открывается, но «скелет» / нет стилей / не грузятся _next/static

- **Причина:** Next.js dev отклоняет запросы с чужого origin (публичный IP).
- **Проверить:** в `next.config.mjs` есть `allowedDevOrigins: ['http://89.169.181.191', 'http://89.169.181.191:80', '89.169.181.191']`. После изменения конфига перезапустить next dev и при необходимости заново синхронизировать next.config.mjs на ВМ.

### HMR не работает (изменения не подхватываются без перезагрузки)

- Nginx должен проксировать WebSocket `/_next/webpack-hmr` (в `domeo-nginx.conf` есть отдельный location с Upgrade/Connection). Применить конфиг: `.\scripts\apply-nginx-to-vm.ps1`.
- Убедиться, что в браузере открываете сайт по http://89.169.181.191, а не по localhost.

### npm install на ВМ падает по памяти (OOM)

- На ВМ добавить swap или увеличить память.
- Запустить: `npm install --ignore-scripts`, затем `npx prisma generate`.

### После sync нет Tailwind / стили «плывут»

- В архив sync-full-sources теперь входят **postcss.config.js** и **tailwind.config.js**. Если синхронизировали старым скриптом — заново выполнить `.\scripts\sync-full-sources-to-vm.ps1` или вручную скопировать эти файлы на ВМ.

### Снова нужен production

- Задеплоить standalone: `.\scripts\deploy-standalone-to-vm.ps1 -AppOnly` (или полный деплой без -AppOnly).
- На ВМ включить systemd: `sudo systemctl start domeo-standalone` (или перезапуск выполнит скрипт деплоя).

---

## Краткий чеклист «dev с нуля»

| Шаг | Действие |
|-----|----------|
| 1 | `.\scripts\stop-vm-production.ps1` |
| 2 | `.\scripts\sync-full-sources-to-vm.ps1` (или sync-to-vm.ps1 при наличии rsync) |
| 3 | На ВМ в screen: `cd ~/domeo-app && npm install` |
| 4 | `.\scripts\start-vm-dev.ps1` |
| 5 | Открыть http://89.169.181.191, проверить логи при необходимости: `tail -f ~/domeo-app/logs/next-dev.log` |
| 6 | Правки: `.\scripts\push-one-file-to-vm.ps1 <путь\к\файлу>` |

Все скрипты используют по умолчанию хост **89.169.181.191** и каталог **~/domeo-app**. Переопределение: переменные окружения `1002DOORS_SSH_KEY`, `1002DOORS_STAGING_HOST`, `1002DOORS_STAGING_REMOTE_PATH`.
