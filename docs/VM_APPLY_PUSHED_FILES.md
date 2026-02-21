# Применение залитых файлов на ВМ (вариант A)

## Контекст: зачем и как обновляем приложение на ВМ

**Цель:** чтобы сайт http://89.169.181.191 работал без 502, без 400 на CSS/JS, модалка ручек без 503.

**Стандартный способ обновить приложение на ВМ (делать каждый раз в этом порядке):**
1. Локально: остановить dev-сервер (чтобы не было EPERM на `.next`), при необходимости `npm install`, затем `npm run build`.
2. Деплой: `.\scripts\deploy-standalone-to-vm.ps1 -SkipBuild -AppOnly` (если сборка уже есть) или `.\scripts\deploy-standalone-to-vm.ps1 -AppOnly` (сборка + деплой). На ВМ распаковывается standalone, сохраняются существующие `public/uploads`, выполняются миграции, перезапускается приложение.
3. **Обязательно после деплоя с -AppOnly:** синхронизация фото на ВМ. Без этого картинки дверей/ручек дают 404. Выполнить: `.\scripts\sync-uploads-to-vm.ps1`. Источник: `public/uploads` или переменная окружения `1002DOORS_UPLOADS_PATH` (если фото лежат отдельно от проекта).
4. Если приложение на ВМ не поднялось: `.\scripts\restart-vm-app.ps1`.
5. Nginx на ВМ уже настроен (`scripts/output/domeo-nginx.conf`): отдельные location для `/_next/static/`, `/uploads/` (A: статика с диска + fallback в backend), `/api/uploads/` (C: лимиты 100 r/s, burst 200, таймауты). После обновления конфига: `.\scripts\apply-nginx-to-vm.ps1`. На ВМ `root` для `/uploads/` должен указывать на каталог public приложения (в конфиге: `/home/ubuntu/domeo-app/public`).

---

## Пайплайн: как делать правки локально и сразу применять на ВМ

### Как сейчас (без изменений)

| Режим | Что делаете | Что на ВМ | Минусы |
|--------|-------------|-----------|--------|
| **Production (standalone)** | Правка локально → `npm run build` → `deploy-standalone-to-vm.ps1 -AppOnly` (+ при необходимости `sync-uploads-to-vm.ps1`, `restart-vm-app.ps1`) | Работает готовый билд (`node server.js`). Исходники на ВМ не нужны. | Каждая правка = полная сборка (минуты) + загрузка архива или rsync standalone. Быстро «проверить одну строчку» нельзя. |
| **Dev на ВМ** | Один раз: `sync-to-vm.ps1` (или `sync-full-sources-to-vm.ps1`), затем `start-vm-dev.ps1`. Дальше: правка локально → `push-one-file-to-vm.ps1 путь/к/файлу` | На ВМ полный репо и `npm run dev`. Next при получении файла пересобирает его за секунды. | На ВМ должен быть полный исходник и `npm run dev`. Если на ВМ сейчас только standalone (без исходников), нужно один раз залить репо и переключиться на dev. |

Итого: для **быстрых правок с немедленной проверкой на ВМ** сейчас возможны два пути: либо держать на ВМ dev-режим и использовать `push-one-file`, либо каждый раз собирать и деплоить артефакт (медленно).

### Как изменить пайплайн (варианты)

**Вариант A — оставить production, ускорить деплой**

- Правки локально как сейчас.
- Вместо полного архива каждый раз использовать **деплой с rsync**:  
  `.\scripts\deploy-standalone-to-vm.ps1 -AppOnly -Rsync` (сборка локально один раз, дальше rsync только изменённых файлов в `.next/standalone`). Быстрее при мелких правках, не нужен dev на ВМ.
- Чеклист после деплоя не менять: sync-uploads при необходимости, restart при необходимости.

**Вариант B — переключить ВМ на dev для итераций**

- Один раз: полная синхронизация исходников на ВМ (`sync-full-sources-to-vm.ps1` или `sync-to-vm.ps1`), на ВМ установить зависимости и запустить `npm run dev` (или `start-vm-dev.ps1`).
- Дальше: правка локально → `push-one-file-to-vm.ps1 путь/к/файлу` → через несколько секунд на ВМ уже новая версия (Next dev пересобирает файл).
- Когда итерации закончены — собрать артефакт и задеплоить production (`deploy-standalone-to-vm.ps1 -AppOnly`), перезапустить приложение в standalone-режиме на ВМ.

**Вариант C — гибрид**

- Обычно на ВМ работает standalone (production).
- Для серии правок: поднять на ВМ dev (sync + start-vm-dev), гонять правки через `push-one-file`, проверять на ВМ.
- По завершении: сборка локально, деплой standalone, на ВМ снова `node server.js` (и при необходимости sync-uploads, restart).

Выбор варианта: A — минимум изменений, быстрее деплой. B — максимально быстрые итерации, но на ВМ нужен полный репо и dev. C — компромисс: dev только на время правок.

### Включить dev на ВМ

**Полная пошаговая настройка:** см. **docs/VM_DEV_MODE.md** (чеклист, синхронизация с postcss/tailwind, остановка production перед dev, npm install в screen, устранение 502 и скелета).

Кратко: остановить production (`.\scripts\stop-vm-production.ps1`), синхронизировать код (`sync-full-sources-to-vm.ps1` или `sync-to-vm.ps1`), на ВМ в screen выполнить `npm install`, затем `.\scripts\start-vm-dev.ps1`. Далее правки через `.\scripts\push-one-file-to-vm.ps1 <путь>`.

Вручную на ВМ (если скрипты обрывают SSH):

1. Подключиться по SSH и держать сессию в **screen** или **tmux** (иначе при обрыве SSH npm install прервётся):
   ```bash
   ssh -i <ключ> ubuntu@89.169.181.191
   screen -S dev
   ```
2. Установить зависимости (на малопамятной ВМ может понадобиться swap; при OOM — добавить swap или запускать без скриптов):
   ```bash
   cd ~/domeo-app
   rm -rf node_modules
   npm install
   ```
   Если падает по памяти: `npm install --ignore-scripts`, затем `npx prisma generate`.
3. Запустить dev:
   ```bash
   npm run dev
   ```
   Или в фоне: `nohup npm run dev >> logs/next-dev.log 2>&1 &`
4. Отсоединиться от screen: `Ctrl+A`, затем `D`. Вернуться: `screen -r dev`.

Дальше с локальной машины: правка файла → `.\scripts\push-one-file-to-vm.ps1 путь\к\файлу` — Next на ВМ пересоберёт за секунды.

Когда закончите с dev: локально `npm run build`, затем `.\scripts\deploy-standalone-to-vm.ps1 -AppOnly`, при необходимости `.\scripts\sync-uploads-to-vm.ps1` и `.\scripts\restart-vm-app.ps1`.

---

После `push-one-file-to-vm.ps1` исходники уже на ВМ, но приложение в production (standalone) работает из **сборки** `.next`. Чтобы правки в `lib/` и `app/api/` попали в работу, нужно **пересобрать** на ВМ.

## Шаги на ВМ

1. Подключиться по SSH и держать сессию живой (лучше **screen** или **tmux**, чтобы сборка не оборвалась):

   ```bash
   ssh -i <ключ> ubuntu@89.169.181.191
   screen -S build   # или: tmux new -s build
   ```

2. Собрать проект:

   ```bash
   cd ~/domeo-app && npm run build
   ```

   Сборка может занять 5–15 минут. При нехватке памяти (OOM) увеличьте swap или память ВМ.

3. После успешной сборки перезапустить приложение:

   ```bash
   fuser -k 3000/tcp 2>/dev/null; sleep 2
   nohup node server.js >> logs/server.log 2>&1 &
   ```

   Или с локальной машины: `.\scripts\restart-vm-app.ps1`

4. Выйти из screen (сессия останется): `Ctrl+A`, затем `D`.

## Уже залитые файлы (фото ручек)

- `lib/configurator/image-src.ts` — сохранение `/api/`, голые имена файлов → `/api/uploads/.../handle_*_main.*`
- `app/api/catalog/hardware/route.ts` — все локальные пути ручек отдаются как `/api/uploads/...`

После пересборки и перезапуска фото ручек в модалке должны открываться без 503.

## Nginx: лимиты и статика (применить конфиг заново при 400 на /_next/static/)

В `scripts/output/domeo-nginx.conf` есть:

- Зона **uploads_limit** (50r/s, burst=100) и **location /uploads/** и **location /api/uploads/** — запросы картинок не идут в общий `location /`, не конкурируют за `limit_conn` и не дают 502 при массовой загрузке изображений; модалка ручек без 503.
- Зона **static_limit** (50r/s, burst=100) и **location /_next/static/** — запросы к CSS/JS чанкам не шли в общий `location /` и не возвращали 400/503 с MIME type text/html.

Чтобы применить обновлённый конфиг на ВМ:

- **С локальной машины:** `.\scripts\apply-nginx-to-vm.ps1` (копирует `scripts/output/domeo-nginx.conf` на ВМ, подставляет в `/etc/nginx/sites-available/domeo`, делает `nginx -t` и `reload`).
- Вручную: скопировать `scripts/output/domeo-nginx.conf` в `/etc/nginx/sites-available/domeo` на ВМ, затем `sudo nginx -t` и `sudo systemctl reload nginx`.

## Правки модалки и API (в репо, нужна пересборка)

- `components/HandleSelectionModal.tsx` — у картинок ручек добавлен `loading="lazy"`.
- `app/api/uploads/[...path]/route.ts` — кеш `resolveHandlesDir()`.

Чтобы они попали на ВМ: соберите локально (`npm run build`) и задеплойте `.\scripts\deploy-standalone-to-vm.ps1 -AppOnly`, либо после полной синхронизации исходников на ВМ выполните на ВМ `npm run build` и перезапустите приложение.

## 500 на POST /api/export/fast (PDF/Excel)

Экспорт использует Puppeteer (Chrome/Chromium). На ВМ без установленного браузера или без переменной окружения запрос возвращает 500.

1. Установить Chromium **из apt** (не snap: под systemd snap даёт ошибку cgroup). На ВМ: `sudo apt-get install -y chromium-browser` (или пакет `chromium`).
2. В `.env` приложения на ВМ добавить:  
   `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser`  
   (или `/usr/bin/chromium` — в зависимости от пакета). Путь `/snap/bin/chromium` не использовать.
3. Перезапустить приложение: `.\scripts\restart-vm-app.ps1` или на ВМ `sudo systemctl restart domeo-staging` / перезапуск процесса Node.
