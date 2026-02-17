# Полный пошаговый аудит приложения Domeo (1002doors)

**Дата:** 2026-02-16  
**Цель:** Аудит по пунктам: приложение, БД и связи, движок калькулятора (фильтрация и расчёты), поток данных калькулятор → корзина → заказ → экспорт Excel.

---

## Пункт 1. Приложение (обзор)

### 1.1 Стек и структура

| Область | Технологии |
|--------|------------|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS |
| Backend | Next.js API Routes, Prisma ORM |
| БД | SQLite (dev), PostgreSQL (prod) |
| Аутентификация | JWT, роли (admin, complectator, executor) |
| Экспорт | ExcelJS, XLSX, Puppeteer (PDF) |

**Ключевые маршруты:**
- `/doors` — конфигуратор дверей (калькулятор, корзина, создание заказа).
- `/admin/*` — каталог, категории, импорт, пользователи.
- `/executor/dashboard` — ЛК исполнителя (заказы, экспорт Excel).
- `/complectator/*` — комплектация.

**API:** `app/api/` — catalog (doors, hardware), price/doors, orders, cart, documents.

### 1.2 Модули, важные для аудита

| Модуль | Путь | Назначение |
|--------|------|------------|
| Конфигуратор (данные) | `lib/configurator/useConfiguratorData.ts`, `useModelOptions.ts` | Загрузка моделей, опций, каскад фильтров |
| Модель-опции (сервер) | `lib/catalog/doors-model-options.ts` | Каскадная фильтрация товаров по модели/стилю/размеру/покрытию/цвету |
| Движок цены | `lib/price/doors-price-engine.ts` | Подбор товара по selection, расчёт цены и надбавок |
| Корзина / заказ | `components/doors/CartManager.tsx`, `app/components/cart/*` | Маппинг корзины в items для POST /api/orders |
| Валидация документов | `lib/validation/document.schemas.ts` | documentItemSchema (edge, threshold, optionIds, architraveNames и т.д.) |
| Репозиторий документов | `lib/repositories/document.repository.ts` | Сохранение Order/Invoice/Quote с `cart_data: JSON.stringify(items)` |
| Экспорт Excel | `lib/export/puppeteer-generator.ts`, `lib/export/excel-door-fields.ts` | generateExcelOrder, getDoorFieldValue по EXCEL_DOOR_FIELDS |

---

## Пункт 2. База данных и связи

### 2.1 Схема Prisma (ключевые модели)

**Каталог и товары:**
- **CatalogCategory** — дерево категорий (`parent_id`, `path`). Связи: Product, CategoryPropertyAssignment, ImportTemplate, ExportSetting.
- **Product** — `catalog_category_id`, `sku` (unique), `name`, `properties_data` (JSON), `base_price`, `is_active`. Связь: CatalogCategory, ProductImage.
- **ProductProperty** / **CategoryPropertyAssignment** — свойства категорий (`is_for_calculator`, `is_for_export`).
- **PropertyPhoto** — фото по свойству (categoryId, propertyName, propertyValue, photoType). Не связан через FK с Product (по значению).

**Документы и заказы:**
- **Client** — ссылки: Quote, Invoice, Order, Document, Notification.
- **Order** — `client_id`, `invoice_id` (one-to-one с Invoice), `cart_data` (JSON), `total_amount`, `status`, `cart_session_id`, `parent_document_id` (null для заказа как основного документа).
- **Invoice** — `client_id`, `order_id` (unique, one-to-one с Order), `cart_data`, `quote_items` / элементы счета.
- **Quote** — `client_id`, `cart_data`, `quote_items`.
- **SupplierOrder** — `executor_id`, `parent_document_id`, `cart_data` (элементы только в JSON, отдельной таблицы нет).

**Пользователи и уведомления:**
- **User** — DocumentComment, DocumentHistory, Notification.
- **Notification** — user_id, client_id?, document_id?.

### 2.2 Связи между данными (проверка)

| Связь | Реализация | Целостность |
|-------|------------|-------------|
| Product → CatalogCategory | FK `catalog_category_id` | Cascade при удалении категории |
| Order → Client | FK `client_id` | Cascade |
| Order ↔ Invoice | Order.invoice_id → Invoice.id; Invoice.order_id → Order | One-to-one, синхронизируется при создании счёта |
| Quote/Invoice/Order cart_data | JSON-строка массива позиций | Нет FK; состав задаётся при создании документа |
| DocumentComment / DocumentHistory → document_id | Строковый ID (quote/invoice/order/supplier_order) | Нет FK на конкретную таблицу — полиморфная связь по типу документа |

**Важно:** Элементы заказа (позиции дверей, ручек и т.д.) хранятся только в `cart_data`. Отдельных таблиц OrderItem/InvoiceItem для заказов нет (для Quote/Invoice есть quote_items/invoice_items, но приоритет для экспорта — cart_data).

### 2.3 Источники данных для конфигуратора и цены

- **Двери:** Product с `catalog_category_id =` ID категории «Межкомнатные двери» (через `getDoorsCategoryId()`).
- **Ручки, ограничители, наличники, комплекты:** Product по категориям, запрашиваются через `/api/catalog/hardware?type=...`.
- **Покрытия/цвета для моделей:** PropertyPhoto (лист «Цвет») + fallback из `properties_data` товаров (Тип покрытия, Цвет/Отделка).
- **Опции по модели (реверс, порог, зеркало, наполнение, размеры, кромка):** агрегация по товарам одной модели (complete-data) и каскад model-options по текущим фильтрам.

---

## Пункт 3. Движок калькулятора: фильтрация и расчёты

### 3.1 Цепочка данных на клиенте

1. **useConfiguratorData**  
   - Запросы: `/api/catalog/doors/complete-data`, `/api/catalog/hardware?type=handles|limiters|architraves|kits`.  
   - Результат: список моделей (DoorModelWithOptions: id=modelKey, style, sizes, doorOptions, filling_names), ручки, ограничители, наличники, комплекты.  
   - Кэш: 30 мин; сброс через `?refresh=1`.

2. **Фильтрация списка моделей (страница Doors)**  
   - По `selectedStyle` (стиль).  
   - По `selectedFilling` (наполнение): модель входит в список, если `filling_names?.includes(selectedFilling)` или fallback по doorOptions.filling_name.  
   - При смене списка: если выбранная модель не входит в filteredModels, сброс selectedModelId.

3. **useModelDetails(modelId, rawModels, selectedStyle)**  
   - Покрытия, кромки, опции (зеркало, порог), finishes, colorsByFinish для одной модели.  
   - Берётся из rawModels (complete-data) при совпадении modelKey и при необходимости style; иначе повторный запрос complete-data.

4. **useModelOptions(modelId, style, params)**  
   - Параметры: reversible, filling, width, height, finish, color.  
   - Запрос: `GET /api/catalog/doors/model-options?model=...&style=...&...`.  
   - Ответ: fillings, widths, heights, finishes, colorsByFinish, edges, edge_in_base, revers_available, mirror_available, threshold_available, filteredCount.  
   - Используется для каскада: какие размеры/покрытия/цвета доступны при текущем выборе.

### 3.2 Серверная фильтрация (model-options)

**Файл:** `lib/catalog/doors-model-options.ts`, `app/api/catalog/doors/model-options/route.ts`.

Порядок шагов:
1. **getProductsByModelAndStyle** — Код модели Domeo (Web) + Domeo_Стиль Web.
2. **filterByReversible(true)** — при reversible=true оставляются товары с Реверс_доступен = да.
3. **filterByFilling** — Domeo_Опции_Название_наполнения === filling.
4. **filterBySize** — Ширина/мм, Высота/мм (для высоты 2350/2750 подставляется 2000 через heightForFilter).
5. **filterByFinish** — Тип покрытия (без учёта регистра).
6. **filterByColor** — Цвет/Отделка (getCanonicalColor).

По отфильтрованному набору **collectOptions** собирает списки fillings, widths, heights, finishes, colorsByFinish, edges, флаги revers_available, mirror_available, threshold_available. edge_in_base вычисляется по наличию кромки в базе у товаров.

### 3.3 Расчёт цены (price/doors)

**Файлы:** `lib/price/doors-price-engine.ts`, `app/api/price/doors/route.ts`.

**Вход:** POST body `{ selection }`. Поля selection: model, style, finish, color, width, height, filling, reversible, mirror, threshold, edge_id, option_ids, handle, hardware_kit, limiter_id, backplate, supplier.

**Подбор товара (filterProducts):**
- Товары категории «Межкомнатные двери» фильтруются по: style (Domeo_Стиль Web, допуск по началу строки), model (Код модели Domeo (Web) / Название / Артикул поставщика), finish, color (или пустой цвет при allowEmptyColor), width, height (heightForMatching: 2350/2750 → 2000), filling, supplier.
- Ослабление: при отсутствии результата повтор с ослаблением requireFinish, затем requireStyle, плюс allowEmptyColor.

**Выбор одной подмодели:** pickProductBySelection — из подходящих предпочитаются товары с «Название модели», содержащим выбранный finish, и без «Флекс»/«Порта»; затем максимум по Цена РРЦ.

**Расчёт итога:**
- База: Цена РРЦ выбранного товара (или base_price).
- Надбавки (из properties товара): высота 2301–2500 / 2501–3000 (проценты), реверс, зеркало (одна/две стороны), порог, кромка (не базовая — наценка по Domeo_Кромка_Наценка_Цвет_2/3/4), комплект фурнитуры, ручка, завертка, ограничитель, наличники (option_ids).
- Итог округляется вверх до 100 руб. (roundUpTo100).
- Ответ: currency, base, breakdown[], total, sku, model_name, matchingProducts (для корзины/экспорта).

**Защита от гонки (usePriceCalculation):** lastRequestIdRef — ответ применяется только если requestId совпадает с текущим, иначе игнорируется.

### 3.4 Условие расчёта цены на странице (canCalculatePrice)

Цена считается только при: selectedStyle, selectedModelId, width, height, selectedFinish, selectedCoatingId. Реверс и наполнение в canCalculatePrice не входят, но передаются в selection и влияют на подбор и надбавки.

---

## Пункт 4. Поток данных: калькулятор → корзина → заказ → экспорт Excel

### 4.1 Калькулятор → корзина

**Файл:** `app/doors/page.tsx`, функция `addToCart`.

При нажатии «В корзину» формируется объект **CartItem** (тип в `components/doors/types.ts`):

| Поле | Источник |
|------|----------|
| model, style, finish, color, width, height | Выбор модели и покрытия (selectedModelData, getCoatingForCart) |
| model_name, matchingVariants | priceData (ответ price/doors) |
| edge, edgeId, edgeColorName | selectedEdgeId, getEdgeText() |
| threshold | selectedThresholdId != null |
| optionIds, architraveNames | selectedArchitraveId + architraveOptions |
| reversible, mirror, glassColor | Состояние переключателей |
| hardwareKitId | selectedHardwareKit (hardwareKitName подставляется при создании заказа из справочника) |
| handleId, handleName, sku_1c, unitPrice, qty | Ручка и цена из breakdown |
| specRows, breakdown | Спецификация и разбивка из калькулятора |

Дверь добавляется одной строкой (itemType: 'door'); ручка, завертка, ограничитель — отдельными строками (handle, backplate, limiter) с редактируемым qty.

### 4.2 Корзина → заказ (POST /api/orders)

**Файлы:** `components/doors/CartManager.tsx`, `app/components/cart/QuickCartSidebar.tsx`, `EnhancedCartSidebar.tsx`.

При создании заказа массив **items** для API собирается из каждой позиции корзины. В каждом item передаются в том числе:
- type, qty, unitPrice, model, model_name, width, height, color, finish, style;
- edge, edgeId, edgeColorName;
- threshold (нормализация: true / 1 / "да" → boolean);
- optionIds, architraveNames, optionNames;
- reversible, mirror, glassColor;
- hardwareKitId, hardwareKitName (если в корзине нет hardwareKitName — подставляется из справочника комплектов по hardwareKitId);
- handleId, handleName, limiterId, limiterName;
- specRows (при наличии).

**API:** `app/api/orders/route.ts` — принимает body (client_id, items, total_amount, …). items проверяются через **createDocumentRequestSchema** (Zod). documentService.createDocument вызывает **DocumentRepository.createOrder**. В БД сохраняется: Order с **cart_data = JSON.stringify(data.items)**. Элементы заказа в отдельных таблицах не создаются.

### 4.3 Валидация элементов (document.schemas)

**Файл:** `lib/validation/document.schemas.ts`.

- **documentItemSchema** допускает для позиции: edge, edgeId, edgeColorName, edge_color_name, threshold (boolean / 1 / 0 / строка → transform в boolean), optionIds/option_ids, architraveNames/architrave_names, optionNames, reversible, mirror, glassColor, breakdown, matchingVariants и остальные поля. В transform дублируются optionIds/architraveNames из snake_case в camelCase для единообразия экспорта.

### 4.4 Заказ в БД и использование cart_data

- **Order.cart_data** — единственный источник состава заказа для экспорта и отображения.
- При экспорте документа (quote/invoice/order) в **app/api/documents/[id]/export/route.ts** данные берутся из document.cart_data (для Order — при отсутствии из document.invoice?.cart_data). Парсится JSON в массив позиций.
- Позиции приводятся к формату экспорта (itemsForExport): явно передаются edge, edgeId, edgeColorName, threshold, optionIds, architraveNames, optionNames, reversible, mirror, glassColor и т.д., затем вызывается exportDocumentWithPDF(…, itemsForExport, …).

### 4.5 Экспорт в Excel

**Файлы:** `lib/export/puppeteer-generator.ts`, `lib/export/excel-door-fields.ts`.

- **generateExcelOrder(data)** получает data с полями client, documentNumber, **items** (массив позиций из cart_data).
- Для каждой позиции формируется строка листа «Заказ»: базовые колонки (№, Наименование, Количество, Цена, Сумма) + колонки из **EXCEL_DOOR_FIELDS** (Название модели, Цена опт, Цена РРЦ, Поставщик, Кромка, Цвет кромки, Реверс, Зеркало, Порог, Наличники и т.д.).
- **getDoorFieldValue(fieldName, source)** возвращает значение колонки:
  - Кромка: по item.edge === 'да' или наличию edgeId/edgeColorName.
  - Цвет кромки: item.edgeColorName ?? item.edge_color_name ?? item.edgeId.
  - Порог: item.threshold (нормализация через normalizeThreshold в hasThreshold).
  - Наличники: formatArchitraveDisplay(item) — architraveNames/optionNames или «да» при наличии optionIds.
  - Колонки «X, цена» заполняются из item.breakdown через getOptionPriceFromBreakdown.

**Итог:** Если на каждом шаге (конфигуратор → addToCart → CartManager items → documentItemSchema → cart_data → itemsForExport → generateExcelOrder) поля edge, edgeId, edgeColorName, threshold, optionIds, architraveNames, breakdown и т.д. передаются без потерь, в Excel они отображаются корректно.

### 4.6 Проверка цикла (рекомендация)

- Скрипт `scripts/verify-order-export-cycle.ts` — создаёт заказ с одной дверью с заданными кромкой, порогом, наличниками в cart_data, вызывает экспорт в Excel и проверяет ячейки.
- Скрипт `scripts/inspect-order-cart-data.ts [id|number]` — выводит содержимое cart_data заказа для ручной проверки.

---

## Выявленные проблемы и риски

Ниже — моменты, требующие внимания или уже зафиксированные в других аудитах. Критической потери данных по пути калькулятор → Excel в текущей реализации не выявлено.

### Архитектура и типы

| Проблема | Описание | Рекомендация |
|----------|----------|--------------|
| **DocumentItem неполный** | В `lib/types/documents.ts` интерфейс DocumentItem не содержит полей edge, edgeId, edgeColorName, threshold, optionIds, architraveNames, breakdown, matchingVariants. Фактически они есть в documentItemSchema и в cart_data. | Расширить DocumentItem в types/documents.ts полями опций двери (как в CartItem / documentItemSchema), чтобы тип отражал реальный контракт и уменьшить риск случайного обрезания полей при рефакторинге. |
| **Элементы заказа только в JSON** | Order/Invoice/Quote хранят состав только в cart_data (JSON). Нет таблицы order_items; product_id внутри JSON не связан FK с Product. | Осознанный выбор; при удалении товара из каталога старые заказы остаются с устаревшим id/sku — экспорт использует matchingVariants/fallback по коду модели. |

### Данные и кэш

| Проблема | Описание | Рекомендация |
|----------|----------|--------------|
| **Покрытия: PropertyPhoto vs товары** | ~~В complete-data покрытия могли строиться из PropertyPhoto; при расхождении подбор мог не найти товар.~~ | **Исправлено:** покрытия в complete-data строятся только из товаров (Тип покрытия + Цвет/Отделка); PropertyPhoto используется только для подстановки photo_path. |
| **Кэш complete-data 30 мин** | После импорта каталога пользователь до 30 минут может видеть старые модели/опции, если не вызван сброс кэша (DELETE с авторизацией или ?refresh=1). | После импорта через API/скрипт вызывать сброс кэша; документировать для операторов (REMAINING_ISSUES.md, DATA_AND_CACHE_RECOMMENDATIONS.md). |

### Целостность и полиморфные ссылки

| Проблема | Описание | Рекомендация |
|----------|----------|--------------|
| **document_id в комментариях/истории** | ~~При удалении документа комментарии/история могли оставаться «висячими».~~ | **Исправлено:** при удалении документа (API и скрипты) вызывается удаление DocumentComment и DocumentHistory по document_id (lib/documents/delete-document-relations.ts). |

### Уже исправленные (для контекста)

Ранее выявленные и исправленные проблемы перечислены в CALCULATOR_AUDIT_ISSUES_LIST.md и REMAINING_ISSUES.md: учёт наполнения в цене, высоты 2350/2750 в model-options и product-match, сброс выбранной модели при сужении фильтров, сброс цены при смене модели/покрытия, кромка «не доступна», канонические поля (Цвет/Отделка, Тип покрытия) и т.д.

---

## Сводка по аудиту

| Пункт | Статус | Замечания |
|-------|--------|-----------|
| 1. Приложение | Ок | Next.js 15, React 19, Prisma, единая точка входа конфигуратора — /doors. |
| 2. БД и связи | Ок | Схема согласована; элементы заказа только в cart_data (Order/Invoice/Quote); связь Order–Invoice one-to-one. |
| 3. Калькулятор | Ок | complete-data → model-options (каскад) → price/doors (подбор + надбавки); согласованность фильтров и полей БД (properties_data, height 2350/2750→2000). |
| 4. Поток калькулятор→Excel | Ок | addToCart заполняет все поля CartItem; CartManager/сайдбары передают в items edge, threshold, optionIds, architraveNames и др.; documentItemSchema принимает и нормализует; cart_data сохраняется как есть; экспорт читает cart_data и передаёт в generateExcelOrder; getDoorFieldValue покрывает все колонки дверей. |

**Существующие документы для углубления:**  
CALCULATOR_FULL_AUDIT.md, DATA_FLOW_DOORS_TO_EXCEL.md, FULL_SYSTEM_AUDIT.md, FILTER_CASCADE_MODEL_OPTIONS.md, EXCEL_EXPORT_MATCH_AND_FIELDS.md, CALCULATOR_AUDIT_ISSUES_LIST.md, REMAINING_ISSUES.md.
