# Где хранятся правильные пути к фото дверей

Раньше всё работало, потому что пути лежали в БД и/или в Excel и при импорте попадали в приложение. Ниже — где они живут и как их восстановить.

---

## 1. База данных: таблица `property_photos` (PropertyPhoto)

**Главное хранилище путей** — таблица **`property_photos`** в SQLite.

- **Поле:** `photoPath` — путь к файлу, например `/uploads/final-filled/doors/Дверное_полотно_A-Line_1_ПО_Алюминий_Черный_(RAL_9005)_cover.png`
- **Связь с каталогом:** `categoryId` = ID категории «Межкомнатные двери»
- **Два типа привязки:**
  - **Обложка по коду модели** — `propertyName = 'Код модели Domeo (Web)'`, `propertyValue = 'in36'`, `photoType = 'cover'`. Используется для карточки модели в списке.
  - **Фото по цвету/покрытию** — `propertyName = 'Domeo_Модель_Цвет'`, `propertyValue = 'Название модели|Тип покрытия|Цвет/отделка'` (например `Дверное полотно A-Line 1|ПО Алюминий|Черный (RAL 9005)`), `photoType = 'cover'` или `gallery_1`, …

**Откуда complete-data берёт пути:**  
`lib/property-photos.ts` → `getPropertyPhotos(categoryId, propertyName, propertyValue)`.  
Если для комбинации модель/покрытие/цвет в БД есть локальный `photoPath`, он используется; иначе подставляется fallback по имени файла (который может не совпадать с именами на диске).

Просмотр в БД:
```bash
npx prisma studio
# Таблица property_photos, фильтр по categoryId (категория дверей) и propertyName.
```

Или через SQL:
```sql
SELECT propertyName, propertyValue, photoPath, photoType FROM property_photos
WHERE categoryId = '<id категории дверей>' AND photoPath LIKE '%final-filled/doors%'
LIMIT 20;
```

---

## 2. Excel (final_filled) — лист «Цвет»

При импорте каталога скрипт **`scripts/import-final-filled.ts`** читает лист **«Цвет»** и записывает пути в `property_photos`:

- Столбцы: **«Название модели»**, **«Тип покрытия»**, **«Цвет/отделка»**, **«Ссылка на обложку»**, **«Ссылки на галерею (через ;)»**
- В **«Ссылка на обложку»** должны быть **локальные пути**, например:
  - `final-filled/doors/Дверное_полотно_A-Line_1_ПО_Алюминий_Черный_(RAL_9005)_cover.png`
  - или полный: `/uploads/final-filled/doors/...`

Импорт:
```bash
npx tsx scripts/import-final-filled.ts
# Без --dry-run — обновит БД (в т.ч. property_photos по листу «Цвет»).
```

Если в Excel были правильные локальные пути — после импорта они снова окажутся в БД и начнут использоваться.

---

## 3. Скрипты, которые пишут пути в БД из папки/файла

Эти скрипты **записывают** правильные пути в `property_photos`, сопоставляя файлы на диске и модели/цвета:

| Скрипт | Назначение |
|--------|------------|
| **bind-color-folder-to-models.ts** | Читает лист «Цвет» из Excel; если есть столбец **«файл»** с именем файла — пишет в БД путь вида `/uploads/final-filled/doors/{файл}`. Либо точечная привязка из `scripts/color-folder-binding-data.ts` (режим `--point`). |
| **bind-pearl-67-covers.ts** | Привязывает обложки по коду модели для Pearl_6, Pearl_7 (и при необходимости берёт путь из Domeo_Модель_Цвет или из файла в папке). |
| **bind-invisible-photos.ts** | То же для Invisible (обложка + галерея). |
| **replace-http-photos-with-local-paths.ts** | Заменяет в БД старые `https://...` на локальные пути после того, как файлы скачаны в `public/uploads/final-filled/`. |

Запуск (примеры):
```bash
# Привязка по Excel с столбцом «файл»
npx tsx scripts/bind-color-folder-to-models.ts [--dry-run] [--file=путь/к/final_filled.xlsx]

# Точечная привязка из color-folder-binding-data.ts
npx tsx scripts/bind-color-folder-to-models.ts --point [--dry-run]

# Обложки Pearl 6/7
npx tsx scripts/bind-pearl-67-covers.ts [--dry-run]

# Invisible
npx tsx scripts/bind-invisible-photos.ts

# Замена http на локальные пути (если уже есть JSON с соответствием URL → локальный путь)
npx tsx scripts/replace-http-photos-with-local-paths.ts [--dry-run]
```

---

## 4. Что проверить, если «раньше работало»

1. **БД**  
   В `property_photos` для категории дверей есть ли записи с `photoPath` в виде `/uploads/final-filled/doors/...` или `final-filled/doors/...`? Если там остались только `https://...` или пустые/битые значения — complete-data их отбрасывает и использует только fallback по имени (который может не совпадать с именами файлов).

2. **Excel**  
   В листе «Цвет» в столбце «Ссылка на обложку» — локальные пути или старые ссылки на облако? Если подставили правильные имена файлов из папки — перезапустите импорт:
   ```bash
   npx tsx scripts/import-final-filled.ts
   ```

3. **Привязка по папке**  
   Если в Excel есть столбец «файл» с именами файлов из `public/uploads/final-filled/doors/`, выполните:
   ```bash
   npx tsx scripts/bind-color-folder-to-models.ts [--dry-run]
   ```
   Так пути из папки снова попадут в БД.

4. **Кэш complete-data**  
   После обновления БД сбросьте кэш API: откройте в браузере или вызовите с авторизацией:
   ```
   GET /api/catalog/doors/complete-data?refresh=1
   ```
   или метод очистки кэша (если есть в админке/документации).

---

## 5. Итог

- **Где хранятся правильные пути:** в таблице **`property_photos`** (поле `photoPath`) и при импорте — в Excel, лист «Цвет», столбец «Ссылка на обложку» (и при необходимости «файл»).
- **Почему могло перестать работать:** в БД заменили локальные пути на http, почистили/пересоздали БД без повторного импорта, или изменили имена файлов на диске без обновления БД/Excel.
- **Как восстановить:** снова записать в БД правильные локальные пути — через импорт из Excel с правильными путями или через скрипты привязки (`bind-color-folder-to-models`, `bind-pearl-67-covers`, `bind-invisible-photos`, `replace-http-photos-with-local-paths`), затем сбросить кэш complete-data.
