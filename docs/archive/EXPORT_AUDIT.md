# Аудит экспорта документов и выгрузок

Дата: 2025-02-15

## 0. Единая сущность заказа и товаров

**Заказ — единая сущность для всего ПО; товары отображаются одинаково во всех ЛК.**

- **Источник наименований:** `lib/export/export-items.ts` → `getItemType()`, `getItemDisplayName()`, `normalizeItemForExport()`; для UI и обратной совместимости — `lib/export/display-names.ts` → `getItemDisplayNameForExport()`, `normalizeItemForDisplay()`.
- **Где используется единое отображение:** экспорт (PDF/Excel/CSV), ЛК исполнителя (OrdersBoard — блок «Товары»), ЛК комплектатора (OrderDetailsModal — таблица «Товары»), быстрый просмотр документа (DocumentQuickViewModal — таблица позиций). Любые новые экраны, показывающие позиции заказа/документа, должны использовать `getItemDisplayNameForExport(item)`.

## 1. Точки входа (где пользователь запускает экспорт)

| Место в UI | Действие | API | Формат | Статус |
|------------|----------|-----|--------|--------|
| **CartManager** (корзина конфигуратора) | КП / Счет / Заказ (PDF/Excel/CSV) | `POST /api/export/fast` | pdf, excel, csv | ✅ Работает; единая нумерация и дедуп; названия через `getItemDisplayNameForExport` |
| **OrdersBoard** (исполнитель) | Экспорт счета PDF | `POST /api/export/fast` | pdf | ✅ Работает; items из `order.cart_data` с полными полями |
| **OrderDetailsModal** (комплектатор) | Экспорт КП / Экспорт счета | `POST /api/export/fast` | pdf | ✅ Работает; `formattedItems` с itemType, limiterId, limiterName и т.д. |
| **DocumentContent** | Скачать PDF/Excel/CSV | `POST /api/documents/[id]/export?format=` | pdf, excel, csv | ✅ Работает |
| **DocumentActions** | Скачать PDF / Скачать Excel | Раньше GET → редирект на preview; **исправлено** на `POST` + fetch + download | pdf, excel | ✅ Исправлено |
| **DocumentQuickViewModal** | Быстрый экспорт | `POST /api/export/fast` | pdf | ✅ Работает |
| **FastExport** (компонент) | Быстрый экспорт | `POST /api/export/fast` | pdf | ✅ Работает |
| **QuickCartSidebar** | Экспорт из боковой корзины | `POST /api/export/fast` | pdf | ✅ Работает |
| **EnhancedCartSidebar** | Экспорт КП/Счет | `POST /api/export/fast` | pdf | ✅ Работает |
| **UnifiedExportButtons** | КП, Счет, CSV, XLSX, Заказ из КП | `POST /api/cart/export/enhanced` | pdf/excel/csv в JSON (base64) | ✅ Исправлено: клиент парсит JSON и скачивает из base64 |
| **ExportButtons (doors)** | КП (HTML), Счёт (HTML), Заказ CSV/XLSX, заказ по КП | `POST /api/cart/export/doors/kp`, `.../invoice`, `.../factory`, `.../factory/xlsx`, `POST /api/export/order` | html, csv, xlsx | ✅ factory/xlsx добавлен (раньше 404); kp/invoice — простой HTML без единых названий |
| **Executor dashboard** | Экспорт | `POST /api/export/fast` | pdf | ✅ Работает |
| **Complectator dashboard** | Экспорт КП/Счета | `POST /api/export/fast` | pdf | ✅ Работает |

## 2. API-маршруты экспорта

### 2.1 Документы (КП, Счет, Заказ) — единая логика

- **`POST /api/export/fast`**  
  - Валидация: `exportDocumentRequestSchema` (clientId, items, totalAmount, type, format).  
  - Вызов `exportService.exportDocument()` → `exportDocumentWithPDF()`.  
  - В `puppeteer-generator`: нормализация типов позиций (door/handle/backplate/limiter), дедупликация по `findExistingDocumentDedup` / `findExistingOrder`, нумерация КП-/Счет-/Заказ- + timestamp, генерация PDF/Excel/CSV через `getItemDisplayNameForExport`.  
  - Ответ: бинарный файл, заголовки `Content-Disposition`, `X-Document-Id`, `X-Document-Number`.  
  - **Итог:** корректные названия, одна нумерация для корзины и заказа.

- **`POST /api/documents/[id]/export?format=pdf|excel|csv`**  
  - Поиск документа в Quote / Invoice / Order.  
  - Данные позиций: приоритет `cart_data` (полная структура с type, itemType, limiterId, limiterName и т.д.); fallback на quote_items/invoice_items (только id, name/notes, quantity, unitPrice — для старых документов названия могут быть общими).  
  - Формирование `itemsForExport` с полями для названий, вызов `exportDocumentWithPDF()`.  
  - Ответ: бинарный файл.  
  - **Итог:** для документов с сохранённым `cart_data` названия корректны.

- **`GET /api/documents/[id]/export?format=pdf|excel|csv`**  
  - При указании формата возвращает файл (та же логика, что и POST). Без format или с иным значением — редирект на `/documents/[id]/preview`.

### 2.2 Корзина (улучшенный экспорт)

- **`POST /api/cart/export/enhanced`**  
  - Принимает cart, documentType, format, clientId, sourceDocumentId и т.д.  
  - Вызов `exportDocumentWithPDF()` с `cart.items` (нормализация типов внутри генератора).  
  - Ответ: **JSON** с `file.buffer` (base64), `file.filename`, `file.mimeType`.  
  - Клиент (UnifiedExportButtons) после исправления парсит JSON и создаёт скачивание из base64.  
  - **Итог:** экспорт и названия работают; скачивание исправлено на клиенте.

### 2.3 Двери — простой HTML/CSV/XLSX (без единой нумерации и без getItemDisplayNameForExport)

- **`POST /api/cart/export/doors/kp`**  
  - Генерирует HTML КП. Наименование — через единую логику `getItemDisplayNameForExport` и `normalizeItemForDisplay` из `lib/export/display-names.ts` (дверь, ручка, завертка, ограничитель).

- **`POST /api/cart/export/doors/invoice`**  
  - HTML счета с той же логикой названий; артикул (sku_1c) и наименование раздельно.

- **`POST /api/cart/export/doors/factory`**  
  - CSV для фабрики. SupplierItemName формируется через `getItemDisplayNameForExport`; значения с запятыми экранируются в CSV.

- **`POST /api/cart/export/doors/factory/xlsx`**  
  - Та же структура в XLSX; SupplierItemName через единую логику названий.

### 2.4 Заказ на фабрику по КП

- **`POST /api/export/order`**  
  - Тело: `kpId`, `format` (поддерживается `xlsx`).  
  - Валидация, адаптер категории Doors, получение данных КП, преобразование в строки, сборка XLSX.  
  - Ответ: бинарный xlsx.  
  - Используется кнопкой «Экспорт заказа на фабрику» при указанном принятом КП (acceptedKPId).

### 2.5 Прочие экспорты (вне основного документооборота)

- **`GET/POST /api/quotes/[id]/export/pdf`** — экспорт КП в PDF (legacy, при необходимости проверить отдельно).  
- **`POST /api/configurator/export`** — экспорт конфигуратора.  
- **`POST /api/catalog/export`** — экспорт каталога.  
- **`GET /api/admin/export/price-list`** — прайс-лист.  
- **`GET /api/supplier-orders/[id]/excel`** — Excel по заказу поставщику.

## 3. Логика названий и типов

- **Единая функция названий:** `getItemDisplayNameForExport()` в `lib/export/puppeteer-generator.ts`.  
  - Порядок: ограничитель (type/limiter/limiterId/limiterName) → завертка (backplate) → ручка (handle) → дверь (door/DomeoDoors) → иначе name или модель.  
  - Ограничитель форматируется через `formatLimiterNameForExport()` (без дублирования «Дверь DomeoDoors»).

- **Нормализация типов:** в `exportDocumentWithPDF()` перед дедупом и генерацией: если у позиции нет type/itemType, выводится из limiterId/limiterName, id (backplate-), handleId, model (DomeoDoors), размеров/отделки.

- **Где используется:** все пути через `exportDocumentWithPDF()` (export/fast, documents/[id]/export, cart/export/enhanced) и экспорт из заказа/корзины с передачей полных item (itemType, limiterId, limiterName и т.д.).

- **Исправлено:** маршруты `cart/export/doors/kp`, `invoice`, `factory`, `factory/xlsx` переведены на общую логику: импортируют `getItemDisplayNameForExport` и `normalizeItemForDisplay` из `lib/export/display-names.ts`.

## 4. Нумерация и дедупликация

- Один контур: `exportDocumentWithPDF()` использует `findExistingDocumentDedup()` (quote/invoice) и `findExistingOrder()` (order).  
- Номер документа: при совпадении содержимого и сессии возвращается существующий номер; иначе — новый (КП-/Счет-/Заказ- + timestamp).  
- Экспорт из корзины и из карточки заказа идут через один и тот же вызов, нумерация и дедуп согласованы.

## 5. Исправления по результатам аудита

1. **DocumentActions:** кнопки «Скачать PDF» и «Скачать Excel» переведены с `window.open(GET ...)` на `POST /api/documents/[id]/export?format=...` с fetch и скачиванием файла через создание `<a download>`. GET по-прежнему редиректит на preview.  
2. **UnifiedExportButtons:** ответ `POST /api/cart/export/enhanced` — JSON с `file.buffer` (base64). Клиент изменён: парсинг JSON, декодирование base64 в Blob и скачивание (или открытие в новой вкладке).  
3. **Маршрут factory/xlsx:** добавлен `app/api/cart/export/doors/factory/xlsx/route.ts`.  
4. **Единые названия в doors:** добавлен `lib/export/display-names.ts` (getItemDisplayNameForExport, normalizeItemForDisplay); маршруты kp, invoice, factory, factory/xlsx используют его для наименований.  
5. **GET /api/documents/[id]/export:** при `?format=pdf|excel|csv` возвращает файл (общая логика вынесена в performExport); без формата — редирект на предпросмотр.

## 6. Рекомендации

- Для старых документов без `cart_data` (только quote_items/invoice_items) в экспорте по id будут общие названия («Товар …» или «Дверь DomeoDoors Unknown»); при необходимости можно донаполнять миграцией или ручным пересохранением cart_data.  
- Регулярно прогонять сценарии: экспорт КП/Счета/Заказа из корзины, из карточки заказа, из модалки комплектатора, скачивание по кнопкам в карточке документа и через UnifiedExportButtons.
