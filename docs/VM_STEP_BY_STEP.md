# ВМ: настройка и синхронизация — по шагам

**Основная ВМ проекта:** **89.169.181.191**. Все скрипты по умолчанию используют хост `ubuntu@89.169.181.191` и каталог `~/domeo-app`. Если у вас в окружении задана другая ВМ (`1002DOORS_STAGING_HOST`), чтобы вернуться к этой, в PowerShell выполните:  
`$env:1002DOORS_STAGING_HOST = 'ubuntu@89.169.181.191'`

Пошаговая инструкция без пропусков. После каждого шага есть **Проверка** — убедитесь, что шаг выполнен, прежде чем переходить дальше.

---

## Чеклист (отмечайте по мере выполнения)

**ПК (один раз):**
- [ ] A1. SSH-ключ на месте, переменная задана при необходимости
- [ ] A2. Хост и путь на ВМ известны (или по умолчанию)
- [ ] A3. Подключение по SSH даёт `OK`
- [ ] A4. (По желанию) rsync установлен

**ВМ (один раз):**
- [ ] B1. Node.js 20 (или 18+) и npm установлены
- [ ] B2. Каталог `~/domeo-app` создан
- [ ] B3. Файл `.env` создан в `~/domeo-app`
- [ ] B4. Nginx применён с ПК (`.\scripts\apply-nginx-to-vm.ps1`)

**Первый запуск dev:**
- [ ] C1. Production на ВМ остановлен
- [ ] C2. Исходники синхронизированы
- [ ] C3. npm install на ВМ выполнен, next dev запущен
- [ ] C4. Порт 3000 слушается, в логах Ready
- [ ] C5. Сайт открывается в браузере без 502

**Вернуться на production (когда закончили правки):**
- [ ] E1. Локально выполнен `npm run build`
- [ ] E2. Выполнен `.\scripts\deploy-standalone-to-vm.ps1 -AppOnly`
- [ ] E3. При необходимости: sync-uploads-to-vm.ps1, restart-vm-app.ps1

**Проверка с ПК:** запустите `.\scripts\verify-vm-steps.ps1` — проверит ключ и SSH. С флагом `-CheckPort` проверит, слушается ли на ВМ порт 3000.

**Единый цикл и итоги аудита:** см. **AUDIT_AND_VM_SETUP.md**.

---

## Часть A. Подготовка на вашем ПК (один раз)

### Шаг A1. SSH-ключ

1. Убедитесь, что у вас есть приватный ключ для доступа к ВМ (например `C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154`).
2. В PowerShell (для текущей сессии) задайте переменную, если путь другой:
   ```powershell
   $env:1002DOORS_SSH_KEY = "C:\путь\к\вашему\приватному_ключу"
   ```
   Если ключ уже по умолчанию в скриптах (`C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154`), переменную можно не ставить.

**Проверка:** файл существует:
```powershell
Test-Path $env:1002DOORS_SSH_KEY
# или
Test-Path "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154"
```
Должно быть `True`.

---

### Шаг A2. Хост и путь на ВМ

1. Задайте переменные, если ваша ВМ не `89.169.181.191` и каталог не `~/domeo-app`:
   ```powershell
   $env:1002DOORS_STAGING_HOST = "ubuntu@IP_ВАШЕЙ_ВМ"
   $env:1002DOORS_STAGING_REMOTE_PATH = "~/domeo-app"
   ```
2. По умолчанию скрипты используют `ubuntu@89.169.181.191` и `~/domeo-app` — тогда переменные не нужны.

**Проверка:** запомните, что будете использовать:
- Хост: `$env:1002DOORS_STAGING_HOST` или `ubuntu@89.169.181.191`
- Путь на ВМ: `$env:1002DOORS_STAGING_REMOTE_PATH` или `~/domeo-app`

---

### Шаг A3. Подключение по SSH

1. Из корня проекта выполните (подставьте свой ключ и хост при необходимости):
   ```powershell
   ssh -i "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" -o StrictHostKeyChecking=no ubuntu@89.169.181.191 "echo OK"
   ```
   Или используйте переменные:
   ```powershell
   ssh -i $env:1002DOORS_SSH_KEY -o StrictHostKeyChecking=no $env:1002DOORS_STAGING_HOST "echo OK"
   ```

**Проверка:** в выводе должно быть только `OK`. Если ошибка (connection refused, timeout, permission denied) — исправьте ключ, IP, firewall или сеть до перехода к Части B.

---

### Шаг A4. Rsync (по желанию)

1. Для быстрой синхронизации только изменённых файлов установите [Git for Windows](https://git-scm.com) — в PATH появится `rsync`.
2. Без rsync скрипт будет использовать полную выгрузку (tar+scp), это тоже работает, но дольше при каждом sync.

**Проверка:**
```powershell
Get-Command rsync -ErrorAction SilentlyContinue
```
Если вывода нет — rsync нет, скрипты всё равно будут работать (через tar+scp).

---

## Часть B. Подготовка на ВМ (один раз)

Подключитесь к ВМ по SSH (как в шаге A3) и выполняйте команды на ВМ.

### Шаг B1. Node.js и npm

1. Установите Node.js 20 (или 18+), например:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
2. Проверьте:
   ```bash
   node -v   # v20.x или v18.x
   npm -v
   ```

**Проверка:** `node -v` и `npm -v` выводят версии без ошибок.

---

### Шаг B2. Каталог приложения

1. Создайте каталог (если ещё нет):
   ```bash
   mkdir -p ~/domeo-app
   cd ~/domeo-app
   pwd
   ```
   Должно быть что-то вроде `/home/ubuntu/domeo-app`.

**Проверка:** `pwd` показывает путь к каталогу, в котором вы будете работать.

---

### Шаг B3. Файл .env на ВМ

1. В каталоге `~/domeo-app` создайте файл `.env` с переменными (скрипты синхронизации его не перезаписывают):
   ```bash
   nano ~/domeo-app/.env
   ```
2. Минимум нужно указать:
   ```env
   DATABASE_URL="postgresql://user:password@host:5432/dbname"
   JWT_SECRET="ваш_длинный_секрет"
   NODE_ENV=development
   ```
   **Важно:** хост в `DATABASE_URL` должен быть **доступен с ВМ** (localhost или IP, до которого ВМ может достучаться). Если БД недоступна, приложение может падать с таймаутом (ETIMEDOUT) и 502.
   Если на ВМ будет экспорт в PDF/Excel — добавьте путь к Chromium:
   ```env
   PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
   ```
3. Сохраните файл (в nano: Ctrl+O, Enter, Ctrl+X).

**Проверка:**
```bash
test -f ~/domeo-app/.env && echo "OK"
```
Должно вывести `OK`. Не показывайте содержимое .env в открытых чатах.

---

### Шаг B4. Nginx на ВМ (один раз)

1. На ВМ должен быть установлен Nginx и создан site для приложения. Один раз примените конфиг **с вашего ПК** (из корня проекта):
   ```powershell
   .\scripts\apply-nginx-to-vm.ps1
   ```
   Скрипт копирует `scripts/output/domeo-nginx.conf` на ВМ и подключает его в `/etc/nginx/sites-available/domeo`, затем делает `nginx -t` и `reload`.

**Проверка:** скрипт завершился без ошибок и вывел "Nginx config applied and reloaded." Если на ВМ ещё не было Nginx или site — сначала установите Nginx и создайте симлинк на `sites-available/domeo` в `sites-enabled`.

---

## Часть C. Первый запуск dev на ВМ

Все команды ниже — **на вашем ПК**, из **корня проекта** (где лежит `package.json`).

### Шаг C1. Остановить production на ВМ

1. Чтобы порт 3000 был свободен:
   ```powershell
   .\scripts\stop-vm-production.ps1
   ```

**Проверка:** скрипт вывел что-то вроде "Production stopped. Port 3000 is free for next dev."

---

### Шаг C2. Синхронизировать исходники на ВМ

1. Выполните один скрипт — он синхронизирует код (rsync или tar+scp):
   ```powershell
   .\scripts\sync-and-run-vm.ps1 -SyncOnly
   ```
   Или без флага (тогда дальше пойдут install, nginx, start):
   ```powershell
   .\scripts\sync-and-run-vm.ps1
   ```
   Для **первого** запуска лучше вызвать полный цикл без `-SyncOnly` (см. шаг C3).

**Проверка:** скрипт завершился с "Sync done." Без ошибок SSH/scp/rsync.

---

### Шаг C3. Установить зависимости на ВМ и запустить dev

1. **Вариант 1 — одним скриптом с ПК:**
   ```powershell
   .\scripts\sync-and-run-vm.ps1
   ```
   Скрипт по порядку: SSH → stop production → sync → **npm install** на ВМ → apply nginx → **start next dev**. При первом развёртывании не используйте `-NoInstall`.

2. **Вариант 2 — если npm install обрывается по SSH** (таймаут, нестабильная сеть), установите зависимости **на ВМ в screen**:
   - Подключитесь к ВМ по SSH.
   - Запустите screen: `screen -S dev`
   - Выполните:
     ```bash
     cd ~/domeo-app
     npm install --include=dev
     ```
   - Дождитесь окончания. Отсоединиться от screen: Ctrl+A, затем D.
   - На ПК затем выполните только запуск dev (без install):
     ```powershell
     .\scripts\sync-and-run-vm.ps1 -NoInstall -NoNginx
     ```
     Или по шагам: `.\scripts\start-vm-dev.ps1` (после того как sync уже был сделан в C2).

**Проверка:**  
- На ПК скрипт не выдал ошибку на шаге "npm install" (или вы установили зависимости вручную на ВМ).  
- В конце скрипт написал "next dev started in background" или вы запустили `.\scripts\start-vm-dev.ps1`.

---

### Шаг C4. Убедиться, что next dev слушает порт 3000

1. На ВМ выполните (по SSH):
   ```bash
   ss -tlnp | grep 3000
   ```
   Должен быть процесс (node/next) на порту 3000.

2. Посмотрите логи:
   ```bash
   tail -30 ~/domeo-app/logs/next-dev.log
   ```
   Должно быть сообщение вроде "Ready in ..." без критичных ошибок.

**Проверка:** порт 3000 занят, в логах — Ready. Если порт пустой или в логах ошибки (например "Cannot find module") — на ВМ снова выполните в каталоге приложения `npm install --include=dev` и перезапустите dev: на ПК `.\scripts\start-vm-dev.ps1`.

---

### Шаг C5. Открыть сайт в браузере

1. Откройте в браузере: **http://89.169.181.191** (или IP вашей ВМ).

**Проверка:** страница загружается, не 502. Если 502 — порт 3000 не слушает или Nginx не проксирует на него (вернитесь к B4 и C4). Если страница пустая или без стилей — проверьте `allowedDevOrigins` в `next.config.mjs` (должен быть IP ВМ) и при необходимости заново примените nginx и перезапустите next dev.

---

## Часть D. Ежедневная работа (синхронизация и правки)

### Шаг D1. Поднять dev на ВМ (если ещё не запущен)

Если вы только что сделали Часть C — переходите к D2.

Если ВМ перезагружали или next dev не запущен:

1. На ПК из корня проекта:
   ```powershell
   .\scripts\stop-vm-production.ps1
   .\scripts\sync-and-run-vm.ps1 -NoInstall -NoNginx
   ```
   или только запуск, если код уже синхронизирован:
   ```powershell
   .\scripts\start-vm-dev.ps1
   ```

**Проверка:** в браузере http://89.169.181.191 открывается без 502.

---

### Шаг D2. Синхронизировать последние изменения с ПК на ВМ

Когда вы что-то поменяли в коде локально:

1. **Вариант «всё подтянуть»** (много файлов или первый раз за день):
   ```powershell
   .\scripts\sync-and-run-vm.ps1 -NoInstall -NoNginx
   ```
   Или только sync, потом при необходимости start:
   ```powershell
   .\scripts\sync-and-run-vm.ps1 -SyncOnly
   .\scripts\start-vm-dev.ps1
   ```

2. **Вариант «один файл»** (быстрая правка):
   ```powershell
   .\scripts\push-one-file-to-vm.ps1 app\api\catalog\hardware\route.ts
   ```
   Путь — от корня проекта, с обратными слэшами. Next dev на ВМ пересоберёт файл за несколько секунд.

**Проверка:** обновите страницу в браузере — изменения видны. Если не видны — убедитесь, что путь в `push-one-file-to-vm.ps1` правильный и что на ВМ действительно запущен `next dev` (шаг D1).

---

### Шаг D3. Если меняли package.json или package-lock.json

1. После sync нужно на ВМ заново установить зависимости. Либо:
   ```powershell
   .\scripts\sync-and-run-vm.ps1
   ```
   (без `-NoInstall`), либо на ВМ в screen:
   ```bash
   cd ~/domeo-app && npm install --include=dev
   ```
   затем на ПК перезапустить dev: `.\scripts\start-vm-dev.ps1`.

**Проверка:** приложение на ВМ запускается без ошибок "Cannot find module".

---

## Часть E. Вернуться на production (когда закончили правки)

### Шаг E1. Собрать билд локально

1. На ПК из корня проекта:
   ```powershell
   npm run build
   ```
   Дождитесь успешного завершения.

**Проверка:** в выводе есть "Compiled successfully", папка `.next/standalone` создана.

---

### Шаг E2. Задеплоить standalone на ВМ

1. На ПК:
   ```powershell
   .\scripts\deploy-standalone-to-vm.ps1 -AppOnly
   ```
   Скрипт зальёт артефакт, распакует, при необходимости выполнит миграции и перезапустит приложение на ВМ.

**Проверка:** скрипт завершился без ошибок. На ВМ слушается порт 3000 (`ss -tlnp | grep 3000`), работает `node server.js` или systemd-юнит.

---

### Шаг E3. Синхронизировать загрузки (если нужно)

1. Если на ВМ должны быть актуальные фото из `public/uploads`:
   ```powershell
   .\scripts\sync-uploads-to-vm.ps1
   ```
2. При необходимости перезапустить приложение:
   ```powershell
   .\scripts\restart-vm-app.ps1
   ```

**Проверка:** сайт открывается, картинки грузятся (нет 404 на /uploads/ или /api/uploads/).

---

## 502 Bad Gateway — что делать

502 значит: Nginx отвечает, а бэкенд (Node на порту 3000) не отвечает — процесс не запущен или упал.

1. **Диагностика с ПК:**
   ```powershell
   .\scripts\diagnose-502-on-vm.ps1
   ```
   Скрипт выведет: кто слушает порт 3000, наличие `server.js` и `.env`, логи (server.log, next-dev.log, systemd).

2. **Перезапуск в зависимости от режима:**
   - **Production:** `.\scripts\restart-vm-app.ps1` или `.\scripts\deploy-standalone-to-vm.ps1 -AppOnly`
   - **Dev на ВМ:** `.\scripts\stop-vm-production.ps1` затем `.\scripts\start-vm-dev.ps1` (или полный цикл `.\scripts\sync-and-run-vm.ps1`)

3. **Если процесс падает при старте** — смотрите в выводе диагностики логи (`~/domeo-app/logs/server.log` или `next-dev.log`). Частые причины: нет `.env`, ошибка БД, не хватает памяти (OOM), отсутствующий модуль после `npm install`.

---

## Часть F. Типичные проблемы (по шагам)

| Шаг | Проблема | Что сделать |
|-----|----------|-------------|
| A3 | SSH: connection refused / timeout | Проверить IP ВМ, firewall (порт 22), сеть. |
| A3 | SSH: permission denied (publickey) | Проверить путь к ключу и что на ВМ добавлен ваш публичный ключ в `~/.ssh/authorized_keys`. |
| B1 | node: command not found | Установить Node (см. B1), перелогиниться по SSH или выполнить `source ~/.profile`. |
| B4 | Nginx: config not found / 404 | Установить Nginx, создать site в sites-available, симлинк в sites-enabled, затем снова `apply-nginx-to-vm.ps1`. |
| C3 | npm install обрывается по SSH | Выполнить npm install на ВМ в screen (см. C3, вариант 2). |
| C4 | Порт 3000 пустой | Запустить dev с ПК: `.\scripts\start-vm-dev.ps1` или на ВМ: `cd ~/domeo-app && npm run dev`. |
| C5 | 502 Bad Gateway | См. раздел **«502 Bad Gateway — что делать»** выше: диагностика `.\scripts\diagnose-502-on-vm.ps1`, затем перезапуск (restart-vm-app или start-vm-dev). |
| C5 | Страница пустая, без стилей | В `next.config.mjs` указать IP ВМ в `allowedDevOrigins`, заново sync и перезапустить next dev; применить nginx. |
| D2 | Изменения не видны после push-one-file | Убедиться, что на ВМ запущен next dev (D1) и путь к файлу указан от корня проекта. |

---

## Краткая шпаргалка

| Что делаете | Команда (ПК, из корня проекта) |
|-------------|--------------------------------|
| Первый раз или «всё с нуля» | `.\scripts\sync-and-run-vm.ps1` |
| Только синхронизация кода | `.\scripts\sync-and-run-vm.ps1 -SyncOnly` |
| Sync + start dev без npm install | `.\scripts\sync-and-run-vm.ps1 -NoInstall -NoNginx` |
| Залить один файл после правки | `.\scripts\push-one-file-to-vm.ps1 app\путь\к\файлу.ts` |
| Применить Nginx | `.\scripts\apply-nginx-to-vm.ps1` |
| Остановить production на ВМ | `.\scripts\stop-vm-production.ps1` |
| Запустить next dev на ВМ | `.\scripts\start-vm-dev.ps1` |
| Проверить ключ и SSH (и порт 3000) | `.\scripts\verify-vm-steps.ps1` или `.\scripts\verify-vm-steps.ps1 -CheckPort` |
| Диагностика 502 на ВМ | `.\scripts\diagnose-502-on-vm.ps1` |
| Вернуться на production: сборка + деплой | `npm run build` → `.\scripts\deploy-standalone-to-vm.ps1 -AppOnly` |
| Синхронизировать загрузки на ВМ | `.\scripts\sync-uploads-to-vm.ps1` |
| Перезапустить приложение на ВМ | `.\scripts\restart-vm-app.ps1` |

Переменные окружения (при необходимости): `1002DOORS_SSH_KEY`, `1002DOORS_STAGING_HOST`, `1002DOORS_STAGING_REMOTE_PATH`.

Подробнее: **SYNC_LOCAL_TO_VM.md**, **VM_DEV_MODE.md**.
