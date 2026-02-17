# Пути к фото в приложении

## Единая настройка папки фото дверей

**Один источник правды:** `lib/configurator/photo-paths.ts`

- **`DOOR_PHOTOS_SUBFOLDER`** — подпапка в `public/uploads/` для обложек и галереи дверей (по умолчанию `final-filled/doors`).
- **`DOOR_PHOTOS_UPLOAD_PREFIX`** — префикс URL: `/uploads/final-filled/doors/`.
- **`doorPhotoPath(filename)`** — собирает полный путь к файлу, например `doorPhotoPath('Canva_1_ПГ_Эмаль_Белый_cover.png')` → `/uploads/final-filled/doors/Canva_1_ПГ_Эмаль_Белый_cover.png`.

Чтобы сменить папку (например на `final-filled/door-photos`), измените только **`DOOR_PHOTOS_SUBFOLDER`** в `photo-paths.ts`. Его используют:

- `app/api/catalog/doors/complete-data/route.ts` — формирование путей при отсутствии фото в БД;
- скрипты: `bind-invisible-photos.ts`, `bind-pearl-67-covers.ts`, `bind-color-folder-to-models.ts`.

## Цепочка от данных до экрана

1. **Источник путей**
   - API **complete-data** возвращает для каждой модели/покрытия/цвета поле `photo` и `photos.cover` / `photos.gallery` в формате **`/uploads/...`** (например `/uploads/final-filled/doors/Model_Coating_Color_cover.png`).
   - Пути берутся из PropertyPhoto (лист «Цвет» в Excel) или собираются через `fallbackLocalPathForColor()` из `photo-paths`.

2. **Нормализация на бэкенде**
   - В complete-data все пути проходят через **`normalizePhotoPath()`**: приводятся к виду `/uploads/...`, обратные слэши заменяются, отсекаются внешние URL (http/https не используются для локальных фото).

3. **Фронт: один слой для `<img src>`**
   - Везде, где подставляется путь к фото из API, используется **`getImageSrc(path)`** из `lib/configurator/image-src.ts`.
   - `getImageSrc()` превращает `/uploads/...` в **`/api/uploads/...`** (запрос идёт в API раздачи, а не в статику).

4. **Раздача файлов**
   - **GET `/api/uploads/[...path]`** (`app/api/uploads/[...path]/route.ts`) читает файлы из **`public/uploads/`**.
   - Декодирует сегменты URL (кириллица в путях).
   - Если файл не найден по точному пути, для папки `final-filled/<подпапка>/` делаются fallback: вариант с `_cover`, другое расширение, префикс «Дверное_полотно_», подстановка по префиксу модели.

## Итог

| Этап              | Формат пути / действие |
|-------------------|------------------------|
| БД / Excel        | Локальный путь: `final-filled/doors/файл.png` или полный `/uploads/final-filled/doors/...` |
| API complete-data | Всегда `/uploads/...` (нормализация в route) |
| Фронт (getImageSrc)| Запрос к `/api/uploads/...` |
| Файловая система  | `public/uploads/final-filled/doors/` (задаётся в `photo-paths.ts`) |

Не собирайте URL для фото вручную (`/api${photo}`, `/api/uploads/${...}`). Всегда используйте **`getImageSrc(path)`** на фронте и **`doorPhotoPath(filename)`** / **`DOOR_PHOTOS_UPLOAD_PREFIX`** на бэкенде и в скриптах.
