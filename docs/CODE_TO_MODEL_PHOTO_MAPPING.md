# Маппинг «код → модель» для привязки фото

Чтобы разным кодам (DomeoDoors_Bemini_1, DomeoDoors_Nebula_5 и т.д.) подставлялись правильные фото, используется файл сопоставления **код → название модели**. По названию модели строится имя файла при поиске в `public/uploads/final-filled/doors/`.

## Формат файла

**Файл:** `scripts/output/code-to-model-photo-mapping.json`

```json
{
  "DomeoDoors_Bemini_1": ["Дверное полотно Cama 1 ПГ искл."],
  "DomeoDoors_Nebula_5": ["Дверное полотно TITANIUM 5 ПО искл."],
  "DomeoDoors_Base_1": ["Дверное полотно BASE 1 1 ПО иск.п."]
}
```

- Ключ — код модели (как в propertyValue).
- Значение — строка или массив строк (названия моделей для поиска файла). Если массив — перебираются по порядку, пока не найдётся файл.

## Как заполнить из Excel

1. Сохраните таблицу сопоставления (две колонки: **Код**, **Модель**) в Excel, например:
   - `1002/code-to-model-mapping.xlsx`
   - Имена колонок: «Код» / «Code» и «Модель» / «Model» / «Название модели».

2. Импорт в JSON:
   ```bash
   npx tsx scripts/import-code-to-model-photo-mapping.ts
   # или с указанием файла:
   npx tsx scripts/import-code-to-model-photo-mapping.ts --file=путь/к/файлу.xlsx
   ```

3. Подбор фото с учётом маппинга и обновление БД:
   ```bash
   npx tsx scripts/match-propertyvalue-to-door-photo.ts --update [--clear-not-found]
   ```

Скрипт сопоставления сначала использует маппинг из JSON (если есть), затем при отсутствии — название модели из товаров в БД.
