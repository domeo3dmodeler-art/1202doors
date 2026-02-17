# Цепочка отображения фото дверей (от БД до UI)

**Единые правила:** [DOOR_CONFIGURATOR_DATA_RULES.md](./DOOR_CONFIGURATOR_DATA_RULES.md)

**Если обложка не отображается:** запустите `npx tsx scripts/list-models-without-cover.ts` — скрипт покажет коды моделей, для которых в `property_photos` нет ни обложки по коду, ни записей Domeo_Модель_Цвет. Добавьте для этих кодов записи (см. ниже или лист «Цвет» в Excel + import-final-filled).

## 1. База данных

**Таблица:** `property_photos`

- **categoryId** — ID категории «Межкомнатные двери» (из `catalog_categories`).
- **propertyName** — один из:
  - `Domeo_Модель_Цвет` — фото по связке «модель|покрытие|цвет» (обложки по цветам).
  - `Код модели Domeo (Web)` — обложка по коду модели (например `domeodoors_pearl_6`).
- **propertyValue** — значение:
  - для `Domeo_Модель_Цвет`: `Код|Тип покрытия|Цвет/отделка`, например `DomeoDoors_Diamond_2|ПВХ|Белый`;
  - для `Код модели`: код в нижнем регистре, например `domeodoors_pearl_6`.
- **photoType** — `cover` или `gallery_1`, `gallery_2`, …
- **photoPath** — путь к файлу, например `/uploads/final-filled/doors/Имя_файла.png`.

Сопоставление записей с файлами в `public/uploads/final-filled/doors/` делается скриптом:
`npx tsx scripts/rematch-property-photos-from-doors-folder.ts --update`.

---

## 2. API complete-data

**Маршрут:** `GET /api/catalog/doors/complete-data`  
**Файл:** `app/api/catalog/doors/complete-data/route.ts`

Для каждой модели (пара `modelKey` + стиль):

1. **Обложка модели** (только PropertyPhoto, без костылей):
   - По коду: `getPropertyPhotos(categoryId, "Код модели Domeo (Web)", modelKey.toLowerCase())` → cover.
   - Если нет — по префиксу кода в цветах: `getPropertyPhotosByValuePrefix(categoryId, "Domeo_Модель_Цвет", modelKey + "|")` → первое cover.
   - Если нет — первое фото из coatings (если есть). Иначе null.

2. **Покрытия и фото цвета**
   - Покрытия только из товаров этой пары (modelKey + style). Для каждой пары (Тип покрытия, Цвет/Отделка) один запрос: `getPropertyPhotos(categoryId, "Domeo_Модель_Цвет", "modelKey|Тип покрытия|Цвет")` → cover в `entry.photo_path`.

3. **Итоговая обложка**
   - Итог = обложка по коду или по префиксу кода в цветах или первое из coatings. ProductImage не используется.

4. **Ответ**
   - У каждой модели в ответе: `photo: normalizedCover`, `photos: { cover: normalizedCover, gallery: [...] }`.

**Важно:** `normalizePhotoPath` отбрасывает путь, если в нём нет допустимого расширения (`.jpg`, `.png`, …) или есть служебные фразы вроде «не рассматриваем». Обратные слеши заменяются на прямые; в итоге ожидается путь вида `/uploads/...`.

**Кэш:** ответ кэшируется в памяти (ключ по стилю). Сброс: `GET /api/catalog/doors/complete-data/refresh`. При `?refresh=1` в запросе ответ не берётся из кэша и не кэшируется браузером.

---

## 3. Фронт: загрузка данных

**Хук:** `useConfiguratorData()` в `lib/configurator/useConfiguratorData.ts`

- Запрос: `GET /api/catalog/doors/complete-data` (при `?refresh=1` в URL страницы добавляется `?refresh=1` к запросу).
- API возвращает `apiSuccess({ ok, models, ... })`, т.е. тело ответа имеет вид `{ success: true, data: { ok, models, ... } }`.
- `parseApiResponse(responseData)` возвращает `data`, т.е. `{ ok, models, ... }`.
- Для каждой модели из `modelsData.models` в состояние кладётся:
  - `photo: m.photo || m.photos?.cover || null`
  - `photos: m.photos || { cover: m.photo, gallery: [] }`
- По этим полям строятся карточки и превью.

---

## 4. Фронт: отрисовка карточек моделей

**Страница:** `app/doors/page.tsx`  
**Сетка моделей (вкладка «ПОЛОТНО»):** `filteredModels` из `useConfiguratorData().models` (с учётом выбранного стиля).

Для каждой модели:

- В атрибут `src` картинки подставляется  
  `getImageSrcWithPlaceholder(model.photo, createPlaceholderSvgDataUrl(...))`.
- Если `model.photo` пустой или путь не даёт валидный URL — показывается SVG-плейсхолдер (серый прямоугольник с названием модели).
- При ошибке загрузки изображения в `onError` подставляется тот же плейсхолдер.

То есть если с API приходит `photo: null` или пустая строка — на UI всегда будет плейсхолдер.

---

## 5. Преобразование пути в URL картинки

**Файл:** `lib/configurator/image-src.ts`

- **getImageSrc(path)**  
  - `resolveImagePath(path)` — нормализация: пустое → `''`, `http(s)` — без изменений, относительные и варианты с `uploads` приводятся к виду `/uploads/...`.  
  - `toDisplayUrl(resolved)` — для путей, начинающихся с `/uploads/`, возвращается тот же путь (без префикса `/api`).
- Итог: путь вида `/uploads/final-filled/doors/Файл.png` уходит в `<img src="...">` как есть.

Next.js раздаёт каталог `public/` по корню приложения, поэтому запрос к `/uploads/final-filled/doors/Файл.png` обслуживается файлом `public/uploads/final-filled/doors/Файл.png`.

---

## 6. Проверка цепочки по шагам

| Шаг | Что проверить |
|-----|----------------|
| 1. БД | В `property_photos` для категории дверей есть записи с `propertyName` `Domeo_Модель_Цвет` и при необходимости `Код модели Domeo (Web)`, у них заполнен `photoPath` (например `/uploads/final-filled/doors/...`). |
| 2. Файлы | Для каждого такого `photoPath` существует файл в `public/uploads/final-filled/doors/` (имя файла = последний сегмент пути). |
| 3. API | В ответе `GET /api/catalog/doors/complete-data` у моделей поля `photo` и `photos.cover` не `null` и содержат путь с расширением. После сброса кэша и запроса с `?refresh=1` ответ должен быть свежим. |
| 4. Фронт | В `useConfiguratorData` у элементов массива `models` заполнены `photo` или `photos.cover`. |
| 5. Рендер | В разметке у `<img>` в карточках моделей `src` начинается с `/uploads/`, а не с `data:image/svg+xml` (плейсхолдер). |
| 6. Сеть | Запрос к `/uploads/final-filled/doors/Имя_файла.png` возвращает 200 и тип изображения. |

---

## Частые причины «нет фото»

1. **Кэш** — старый ответ complete-data (без путей). Решение: вызвать `/api/catalog/doors/complete-data/refresh`, открыть страницу с `?refresh=1` и обновить (лучше жёстко, Ctrl+Shift+R).
2. **Нет записей в БД** — для модели/цвета нет строки в `property_photos` с заполненным `photoPath`. Решение: скрипт `rematch-property-photos-from-doors-folder.ts --update`. В БД для обложки: запись по коду (`Код модели Domeo (Web)`) или по цвету с `propertyValue` вида `код|Тип покрытия|Цвет` (свойство `Domeo_Модель_Цвет`).
3. **Нет файла на диске** — путь в БД есть, но файла нет в `public/uploads/final-filled/doors/`. Решение: положить файл или поправить привязку в скрипте/БД.
4. **Сравнение propertyValue** — лишние пробелы или разный регистр могли мешать совпадению; в `getPropertyPhotos` используется `trim()` и `toLowerCase()` при сравнении.
