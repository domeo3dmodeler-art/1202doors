# Полный аудит системы: от данных БД до экспорта документов

Дата: 2026-02  
Цель: единый профессиональный аудит всей цепочки — БД → каталог → конфигуратор → корзина → расчёт цены → документы → экспорт в Excel.

---

## Часть 1. База данных

### 1.1 Основные сущности

| Сущность | Назначение |
|----------|------------|
| **Product** | Товар каталога. `catalog_category_id`, `sku`, `name`, `properties_data` (JSON), `base_price`, `is_active`. |
| **CatalogCategory** | Категория. Для конфигуратора ключевые: «Межкомнатные двери», «Ручки», «Ручки и завертки», «Ограничители», «Комплекты фурнитуры», опции (наличники). |
| **PropertyPhoto** | Фото по свойству (лист «Цвет»): `propertyName`, `propertyValue` (формат `factoryName\|coatingType\|colorName`), `photoPath`, `photoType` (cover/gallery). |
| **Order** | Заказ. `client_id`, `cart_data` (JSON корзины), `total_amount`, `number`, `status`, `executor_id` и др. |
| **Document** | Документ (Quote/Invoice/Order). Связь с клиентом, тип, `cart_data` при генерации из корзины. |
| **SupplierOrder** | Заказ поставщика. `parent_document_id` (Order), `cart_data`, `supplier_name` и др. |
| **Client** | Клиент. ФИО, телефон, адрес — в шапку экспорта. |

### 1.2 Product.properties_data (двери)

Канонические ключи, используемые в коде и экспорте:

| Ключ | Назначение |
|------|------------|
| Код модели Domeo (Web) | Идентификатор модели (modelKey). Группировка в complete-data, подбор в price/doors и product-match. |
| Domeo_Название модели для Web | Название для отображения; участвует в подборе по модели. |
| Название модели | Человекочитаемое название — **в Excel выводится только оно** (не код). |
| Domeo_Стиль Web | Стиль (Современные, Классика и т.д.). Фильтр списка моделей и подбор товара. |
| Тип покрытия | Тип покрытия (ПВХ, Эмаль, Шпон и т.д.). |
| Domeo_Цвет | Цвет/отделка. В корзине хранится как color (из getCoatingForCart). |
| Материал/Покрытие, Цвет/Отделка | Альтернативные ключи в product-match и экспорте. |
| Ширина/мм, Высота/мм | Размеры. Высота 2350/2750 в price-engine маппится в 2000 для подбора. |
| Цена РРЦ, Цена опт | Цены. В экспорте — из найденного товара. |
| Поставщик | Для колонки «Поставщик» в Excel. |
| Domeo_Опции_Название_наполнения | Наполнение (Голд, Сильвер и т.д.). Фильтр моделей и подбор товара. |
| Domeo_Опции_Надбавка_2301_2500_процент, Domeo_Опции_Надбавка_2501_3000_процент | Надбавки за высоту 2301–2500 и 2501–3000 мм (к цене 2000 мм). |
| Domeo_Опции_Надбавка_реверс_руб, Domeo_Опции_Зеркало_*, Domeo_Опции_Цена_порога_руб | Надбавки за реверс, зеркало, порог. |
| Domeo_Кромка_* | Кромка: базовая, опции, наценки. |
| Domeo_Опции_Реверс_доступен, Порог_доступен, Зеркало_доступно | Доступность опций. |

**Не используются в текущей логике:** «Тип конструкции» — в БД параметра нет, из фильтра price/doors убран. Звукоизоляция (Стандартное/Хорошее/Отличное) — устаревшие данные, убраны из UI конфигуратора.

### 1.3 Категории для конфигуратора и экспорта

- **Межкомнатные двери** — complete-data, model-options, price/doors, product-match (двери).
- **Ручки**, **Ручки и завертки** — hardware, price/doors (ручка, завертка), product-match по handleId.
- **Ограничители** — hardware, price/doors, product-match по limiterId.
- **Комплекты фурнитуры** — hardware (kits), price/doors.
- Опции (наличники и т.д.) — по id в option_ids.

---

## Часть 2. Каталог и API

### 2.1 GET /api/catalog/doors/complete-data

- **Источник:** Product (Межкомнатные двери, is_active), PropertyPhoto, ProductImage.
- **Группировка:** по `properties_data['Код модели Domeo (Web)']` (modelKey).
- **Покрытия:** из PropertyPhoto (лист «Цвет», значение `factoryName|coatingType|colorName`) → coating_type, color_name. Риск расхождения с полями товаров (см. DATA_AND_CACHE_RECOMMENDATIONS.md). Fallback на клиенте: при отсутствии coatings — из products (Тип покрытия, Domeo_Цвет).
- **Опции по модели:** по всем products модели (реверс, порог, зеркало, наполнение, кромка, размеры).
- **Кэш:** 30 мин. Сброс: DELETE с авторизацией или ?refresh=1. Рекомендации по кэшу — в DATA_AND_CACHE_RECOMMENDATIONS.md.

### 2.2 GET /api/catalog/doors/model-options

- **Параметры:** model (обязательный), style, reversible, filling, width, height, finish, color.
- **Источник:** Product (Межкомнатные двери). Фильтрация в lib/catalog/doors-model-options.
- **Высота:** при 2350/2750 для фильтра подставляется 2000.
- **Результат:** fillings, widths, heights, finishes, colorsByFinish, edges, revers_available, mirror_available, threshold_available.

### 2.3 GET /api/catalog/hardware

- **Параметры:** type=handles | limiters | architraves | kits.
- **Источник:** Product по соответствующим категориям.

---

## Часть 3. Движок расчёта цены

### 3.1 POST /api/price/doors

- **Вход:** selection (model, style, finish, color, width, height, filling, reversible, mirror, threshold, edge_id, handle, limiter_id, option_ids, hardware_kit, backplate, supplier).
- **Модуль:** lib/price/doors-price-engine.ts.

### 3.2 Подбор товара (filterProducts)

- **Модель:** Код модели Domeo (Web) или Domeo_Название модели для Web (или Артикул поставщика).
- **Стиль:** Domeo_Стиль Web.
- **Покрытие:** Тип покрытия === selection.finish.
- **Цвет:** Domeo_Цвет === selection.color (или null в товаре).
- **Ширина/высота:** Ширина/мм, Высота/мм; высота 2350/2750 маппится в 2000 (heightForMatching).
- **Наполнение:** Domeo_Опции_Название_наполнения === selection.filling (при наличии).
- **Поставщик:** при наличии в selection.
- Из подходящих берётся товар с максимальной Цена РРЦ (pickMaxPriceProduct).

**Тип конструкции не используется** (поле убрано из фильтра).

### 3.3 Расчёт итога

- База: Цена РРЦ или base_price.
- Надбавки: высота 2301–2500/2501–3000 (% от базы), реверс, зеркало, порог, кромка (из properties выбранного товара).
- Ручка, завертка, ограничитель, комплект фурнитуры, опции (наличники) — из отдельных товаров по id.
- **Округление:** итог вверх до 100 руб (roundUpTo100).

---

## Часть 4. Конфигуратор (страница /doors)

### 4.1 Состояние и поток

- **Источники данных:** useConfiguratorData (complete-data + hardware), useModelDetails(selectedModelId, rawModels), useModelOptions(selectedModelId, selectedStyle, modelOptionsParams).
- **Фильтр моделей:** selectedStyle, selectedFilling (наполнение из каталога: Голд, Сильвер и т.д.). При выпадении выбранной модели из списка — сброс selectedModelId.
- **Параметры каскада:** reversible, selectedFilling, width, height, selectedFinish, color из выбранного покрытия (selectedCoatingId).
- **Расчёт цены:** usePriceCalculation; вызов при canCalculatePrice и при совпадении selectedModelData?.id === selectedModelId; защита от гонки (request id). В selection уходят: door_model_id (= код модели), style, finish, color (из getCoatingForCart), width, height, filling, reversible, mirror, threshold, edge_id, handle_id, limiter_id, option_ids, hardware_kit_id.

### 4.2 Корзина

- **Добавление в корзину:** модель = код модели (selectedModelData?.model_name), finish и color из getCoatingForCart() (coating_type, color_name — те же значения, что в БД). Сохраняются также width, height, handleId, limiterId, optionIds, architraveNames, edge, edgeColorName, reversible, mirror, threshold и т.д.
- **Звукоизоляция (Стандартное/Хорошее/Отличное)** удалена из UI и состояния; в расчёте и корзине не участвует.

---

## Часть 5. Документы

### 5.1 Создание документа из корзины

- **API:** POST /api/documents/generate (или аналог для заказа).
- **Вход:** clientId, items (из корзины), totalAmount.
- **Сохранение:** в Order/Document сохраняется cart_data (JSON с items). Эти же items используются при экспорте.

### 5.2 Поля items (cart_data)

Для дверей: model (код), finish, color, width, height, handleId, limiterId, optionIds, architraveNames, edge, edgeColorName, glassColor, reversible, mirror, threshold и т.д. Для ручек/ограничителей: тип, id, название, количество, цена.

---

## Часть 6. Экспорт в Excel

### 6.1 Точки экспорта

- **Документ (заказ из корзины):** lib/export/puppeteer-generator.ts → generateExcelOrder(). Данные: items из cart_data заказа.
- **Заказ поставщика:** app/api/supplier-orders/[id]/excel/route.ts. Данные: cart_data из SupplierOrder (тот же формат items).

### 6.2 Поиск товара в БД

- **Единый модуль:** lib/catalog/product-match.ts.
- **getMatchingProducts(item):**
  - Двери: строгое совпадение по model (код), finish, color, width, height с полями БД (Код модели Domeo (Web) / Domeo_Название модели для Web, Тип покрытия / Материал/Покрытие, Domeo_Цвет / Цвет/Отделка, Ширина/мм, Высота/мм). **Высота:** сейчас без маппинга 2350/2750 → 2000; при несовпадении возможен fallback (см. REMAINING_ISSUES.md).
  - Ручки/завертки: findHandleById(item.handleId), категории «Ручки», «Ручки и завертки».
  - Ограничители: findLimiterById(item.limiterId), категория «Ограничители».

### 6.3 Заполнение колонок Excel

- **При найденном товаре (дверь):** Название модели — **только** props['Название модели']. Цена опт, Цена РРЦ, Поставщик — из props. Размер 1/2 — Ширина/мм, Высота/мм. Материал/Покрытие, Цвет/Отделка — из props. Наличники — из item (architraveNames/optionNames) или «да».
- **При отсутствии совпадения (fallback):** строка из корзины; название модели из getModelNameByCode(item.model) или item.model; цены из item. Рекомендуется логировать такие случаи.

### 6.4 Размер 3

Колонка «Размер 3» убрана из экспорта (в dbFields и логике не используется).

---

## Часть 7. Сводка рисков и ссылки на документы

| Риск / тема | Документ |
|-------------|----------|
| Покрытия complete-data vs PropertyPhoto | DATA_AND_CACHE_RECOMMENDATIONS.md |
| Кэш complete-data 30 мин, сброс после импорта | DATA_AND_CACHE_RECOMMENDATIONS.md |
| Высота 2350/2750 в product-match (экспорт) | REMAINING_ISSUES.md |
| Fallback при экспорте, логирование | REMAINING_ISSUES.md |
| Дубли ключей в properties_data | REMAINING_ISSUES.md |
| Полный список проблем калькулятора | CALCULATOR_AUDIT_ISSUES_LIST.md |
| Надбавки за высоту, поля БД, округление | HEIGHT_MARKUP_FIELDS.md |
| Сценарии «нет совпадения», имена полей | EXCEL_EXPORT_MATCH_AND_FIELDS.md |
| Файл заказа, несколько вариантов в БД | ORDER_FILE_FACTORY_MAP.md |

---

## Часть 8. Проверочный список (верификация)

- [ ] complete-data: после импорта каталога вызывается сброс кэша или ?refresh=1.
- [ ] Конфигуратор: при выборе наполнения «Голд» цена считается по товару с наполнением Голд.
- [ ] Высоты 2301–2500 и 2501–3000: каскад model-options не пустой; цена с надбавкой за высоту при заданных % в товаре.
- [ ] Корзина: finish и color совпадают с Тип покрытия и Domeo_Цвет в БД (getCoatingForCart).
- [ ] Экспорт: при совпадении «Название модели» в Excel = props['Название модели']; Цена опт/РРЦ из БД.
- [ ] Экспорт при высоте 2350/2750: либо маппинг в product-match, либо fallback с логированием.

---

**Итог:** Аудит фиксирует цепочку от БД до экспорта, канонические поля Product.properties_data, единый поиск (product-match), правила заполнения Excel и ссылки на детальные рекомендации и оставшиеся проблемы.
