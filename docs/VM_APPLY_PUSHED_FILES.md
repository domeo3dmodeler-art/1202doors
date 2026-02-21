# Применение залитых файлов на ВМ (вариант A)

## Контекст: зачем и как обновляем приложение на ВМ

**Цель:** чтобы сайт http://89.169.181.191 работал без 502, без 400 на CSS/JS, модалка ручек без 503.

**Стандартный способ обновить приложение на ВМ (делать каждый раз в этом порядке):**
1. Локально: остановить dev-сервер (чтобы не было EPERM на `.next`), при необходимости `npm install`, затем `npm run build`.
2. Деплой: `.\scripts\deploy-standalone-to-vm.ps1 -SkipBuild -AppOnly` (если сборка уже есть) или `.\scripts\deploy-standalone-to-vm.ps1 -AppOnly` (сборка + деплой). На ВМ распаковывается standalone, сохраняются существующие `public/uploads`, выполняются миграции, перезапускается приложение.
3. **Обязательно после деплоя с -AppOnly:** синхронизация фото на ВМ. Без этого картинки дверей/ручек дают 404. Выполнить: `.\scripts\sync-uploads-to-vm.ps1`. Источник: `public/uploads` или переменная окружения `1002DOORS_UPLOADS_PATH` (если фото лежат отдельно от проекта).
4. Если приложение на ВМ не поднялось: `.\scripts\restart-vm-app.ps1`.
5. Nginx на ВМ уже настроен (`scripts/output/domeo-nginx.conf`): отдельные location для `/_next/static/` и `/api/uploads/`.

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

- Зона **uploads_limit** (50r/s, burst=100) и **location /api/uploads/** — чтобы модалка ручек не давала 503.
- Зона **static_limit** (50r/s, burst=100) и **location /_next/static/** — чтобы запросы к CSS/JS чанкам не шли в общий `location /` с `limit_conn` и не возвращали 400/503 с MIME type text/html.

Чтобы применить обновлённый конфиг на ВМ:

1. Скопировать `scripts/output/domeo-nginx.conf` в `/etc/nginx/sites-available/domeo` на ВМ (или внести блок `location /_next/static/` и зону `static_limit` вручную).
2. Проверить: `sudo nginx -t`
3. Перезагрузить: `sudo systemctl reload nginx`

## Правки модалки и API (в репо, нужна пересборка)

- `components/HandleSelectionModal.tsx` — у картинок ручек добавлен `loading="lazy"`.
- `app/api/uploads/[...path]/route.ts` — кеш `resolveHandlesDir()`.

Чтобы они попали на ВМ: соберите локально (`npm run build`) и задеплойте `.\scripts\deploy-standalone-to-vm.ps1 -AppOnly`, либо после полной синхронизации исходников на ВМ выполните на ВМ `npm run build` и перезапустите приложение.
