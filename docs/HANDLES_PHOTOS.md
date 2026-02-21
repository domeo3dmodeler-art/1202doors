# Фото ручек в каталоге

## Откуда берётся URL

1. **ProductImage** — таблица `product_images`: у каждого товара (ручки) есть записи с `url`, `sort_order`, `is_primary`. Основное фото ручки — обычно `sort_order = 0` или `is_primary = true`.
2. **Откуда попадает в БД:**
   - Импорт из Excel (`import-final-filled.ts`) — колонка «Фото (ссылка)» может быть HTTP (360.yandex) или путь; тогда `ProductImage.url` = эта ссылка.
   - Скачивание и привязка (`download-and-bind-photos-from-final-filled.ts`) — файлы сохраняются в `public/uploads/final-filled/04_Ручки_Завертки/` с именами `{productKey}_main.jpg` (например `handle_PROMO_BL_main.jpg`), в БД пишется `url = /uploads/final-filled/04_Ручки_Завертки/handle_PROMO_BL_main.jpg`.

## Где лежат файлы на диске

- Папка: **`public/uploads/final-filled/04_Ручки_Завертки/`**
- Имена файлов: **`handle_{SKU}_main.{png|jpg|webp}`** и **`handle_{SKU}_zaverтка.{png|jpg|webp}`** (завертка).
- SKU ручки в БД = `handle_${slug(название)}`, например `handle_PROMO_BL`, `handle_ROCKET_NM`.

## Почему часть фото не показывается

1. В БД в `ProductImage.url` стоит **внешняя ссылка** (https://360.yandex...) — фронт не подставляет такие URL для локального каталога, показывается плейсхолдер.
2. В БД путь **не совпадает с диском**: например `uploads/products/final_filled/ROCKET_NM.jpg`, а файл на диске — `final-filled/04_Ручки_Завертки/handle_ROCKET_NM_main.png`.

## Что сделано в коде

- **API раздачи** (`app/api/uploads/[...path]/route.ts`): при запросе файла, которого нет по точному пути, для «похожего на код ручки» (латиница/цифры/подчёркивание) выполняется fallback: ищется файл `final-filled/04_Ручки_Завертки/handle_{код}_main.{png,jpg,webp}` и отдаётся он. Так запросы к старым путям вроде `.../ROCKET_NM.jpg` начинают находить `handle_ROCKET_NM_main.png`.
- **Исправление путей в БД** — скрипт `scripts/fix-handle-photo-paths.ts`: для каждой ручки проверяет наличие файла `{sku}_main.*` в папке ручек и при необходимости обновляет (или создаёт) запись основного фото в `ProductImage` с путём `/uploads/final-filled/04_Ручки_Завертки/{sku}_main.{ext}`.

## Что сделать вам

### Локально (всё уже работает)

Локально ссылки в БД правильные и фото отображаются — ничего делать не нужно.

### На ВМ не показываются фото ручек

Возможные причины: (1) в БД на ВМ старые/неверные URL; (2) на ВМ нет части файлов или имена с другой кодировкой. Ниже — точечные шаги без полного деплоя.

**Вариант A — правим БД на ВМ с вашего ПК (рекомендуется)**

Скрипт запускается **локально** (у вас правильные файлы в `public/uploads/...`), а пишет в **БД на ВМ** через туннель. Пути в БД будут те же, что и локально; на ВМ по ним отдаются файлы из папки на ВМ.

1. Откройте туннель к PostgreSQL на ВМ (в отдельном терминале не закрывать):
   ```powershell
   ssh -i "$env:USERPROFILE\.ssh\ssh-key-1771526730154\ssh-key-1771526730154" -L 5433:localhost:5432 -o StrictHostKeyChecking=no ubuntu@89.169.181.191 -N
   ```
2. В другом терминале, в корне проекта:
   ```powershell
   $env:DATABASE_URL = "postgresql://domeo_user:d0me0Stag1ngPg2025@localhost:5433/domeo?schema=public"
   npx tsx scripts/fix-handle-photo-paths.ts --dry-run
   ```
   Посмотрите вывод: сколько записей будет обновлено.
3. Если всё ок:
   ```powershell
   npx tsx scripts/fix-handle-photo-paths.ts
   ```
   После этого БД на ВМ будет с правильными `url` для ручек. Перезапуск приложения на ВМ не нужен.
4. Закройте туннель (Ctrl+C в первом терминале).

**Вариант B — обновить только таблицу product_images на ВМ из локального дампа**

Если удобнее перенести с локальной БД только данные по фото ручек (например, дамп `product_images` по категории ручек и загрузка на ВМ) — можно сделать выгрузку/загрузку вручную или отдечным скриптом. Вариант A обычно проще.

**Шаг 0 — точечный деплой кода (без перекачки всех uploads)**

Чтобы на ВМ работали ускорение complete-data, раздача фото с кириллицей и fallback для ручек:
```powershell
$env:1002DOORS_SSH_KEY = "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154"
$env:1002DOORS_STAGING_HOST = "ubuntu@89.169.181.191"
.\scripts\deploy-standalone-to-vm.ps1 -AppOnly
```

**Шаг 0б — синхронизация только папки ручек на ВМ (если файлов не хватает)**

Если локально все фото ручек есть, а на ВМ части нет — скопировать только `04_Ручки_Завертки`:
```powershell
.\scripts\sync-handle-photos-to-vm.ps1
```

---

### Локально с нуля (когда правите пути в своей БД)

```bash
npx tsx scripts/fix-handle-photo-paths.ts --dry-run
npx tsx scripts/fix-handle-photo-paths.ts
```

В итоге: на ВМ после варианта A ссылки в БД совпадают с именами файлов на ВМ — фото ручек начинают отображаться.
