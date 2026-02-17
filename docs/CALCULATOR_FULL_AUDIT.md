# Полный аудит калькулятора дверей: связи и движок расчётов

Дата: 2026-02-13

Цель: зафиксировать все источники данных, цепочки фильтров, логику расчёта цены и проверить согласованность, чтобы убедиться, что всё работает правильно.

---

## 1. Источники данных и контракты API

### 1.1 complete-data (GET /api/catalog/doors/complete-data)

| Что отдаёт | Описание |
|------------|----------|
| **models[]** | Список моделей. По каждой: `modelKey` (Код модели Domeo (Web)), `model`, `style`, `photo`, `photos`, `products`, `coatings`, `colorsByFinish`, `glassColors`, `edge_in_base`, `edge_options`, `doorOptions`, **filling_names** |
| **filling_names** | Уникальные значения `Domeo_Опции_Название_наполнения` по всем товарам модели (Голд, Сильвер и т.д.) |
| **doorOptions** | `revers_available`, `revers_surcharge_rub`, `threshold_available`, `threshold_price_rub`, `mirror_available`, `mirror_one_rub`, `mirror_both_rub`, `filling_name` (первое наполнение) |
| **products** | Товары модели с `properties` (в т.ч. Ширина/мм, Высота/мм, Тип покрытия, Domeo_Цвет, Domeo_Опции_*, Domeo_Кромка_* и т.д.) |

- Вызов: один раз при загрузке страницы через **useConfiguratorData**; кэш 30 мин.
- **useConfiguratorData** маппит модели в **DoorModelWithOptions** с полями `id` = modelKey, `model_name`, `style`, `photo`, `sizes` (из products), `doorOptions`, **filling_names** (из API или fallback `[doorOptions.filling_name]`).

### 1.2 useModelDetails(modelId, rawModels)

- Данные одной модели: **coatings**, **finishes**, **colorsByFinish**, **edges**, **options** (зеркало, порог).
- Если передан **rawModels**, данные берутся из кэша (complete-data), без повторного запроса.
- При смене **modelId** обновляются coatings, finishes, edges и т.д. для выбранной модели.

### 1.3 model-options (GET /api/catalog/doors/model-options)

Параметры: `model`, `style`, `reversible`, `filling`, `width`, `height`, `finish`, `color`.

Порядок фильтрации товаров в API:

1. Модель + стиль (Код модели Domeo (Web), Domeo_Стиль Web)
2. Реверс (если `reversible=true` → только товары с Реверс_доступен = да)
3. Наполнение: `Domeo_Опции_Название_наполнения === filling`
4. Ширина: `Ширина/мм === width`
5. Высота: **нормализация** — при `height` 2350 или 2750 для фильтра используется **2000**; иначе точное совпадение
6. Тип покрытия: `Тип покрытия === finish`
7. Цвет: `Domeo_Цвет === color`

По отфильтрованному набору собираются: **fillings**, **widths**, **heights**, **finishes**, **colorsByFinish**, **edges**, **revers_available**, **mirror_available**, **threshold_available**.

- Вызов: **useModelOptions(selectedModelId, selectedStyle, modelOptionsParams)** при изменении модели или любого из параметров (reversible, filling, width, height, finish, color).

### 1.4 price/doors (POST /api/price/doors)

Тело: `{ selection: { ... } }`.

Используется для подбора товара и расчёта итоговой цены.

---

## 2. Движок расчёта цены (price/doors)

### 2.1 Подбор товара (filterProducts)

Товары категории «Межкомнатные двери» фильтруются по **selection**:

| Поле selection | Условие в товаре (properties_data) |
|----------------|-------------------------------------|
| **style** | `Domeo_Стиль Web === selection.style` (или начало совпадает по первым 8 символам) |
| **model** | `Код модели Domeo (Web)` или `Domeo_Название модели для Web` или `Артикул поставщика` совпадает/содержится |
| **finish** | `Тип покрытия === selection.finish` |
| **color** | `Domeo_Цвет === selection.color` или null в товаре |
| **type** | `Тип конструкции === selection.type` (если передаётся; в БД у дверей часто не заполнено) |
| **width** | `Ширина/мм == selection.width` |
| **height** | После **heightForMatching**: 2350/2750 → 2000; иначе `Высота/мм == selection.height` |
| **filling** | `Domeo_Опции_Название_наполнения === selection.filling` (при наличии filling) |

Ослабление: если по строгому совпадению (style + finish) ничего не найдено, повторяется с ослаблением по finish, затем по style.

Из отфильтрованного набора выбирается товар с **максимальной Цена РРЦ** (pickMaxPriceProduct).

### 2.2 Расчёт итога

- База: **Цена РРЦ** товара или **base_price**.
- Надбавки (из properties выбранного товара, если не указано иное):
  - **Высота 2301–2500**: процент из `Domeo_Опции_Надбавка_2301_2500_процент` от цены за 2000.
  - **Высота 2501–3000**: процент из `Domeo_Опции_Надбавка_2501_3000_процент`.
  - **Реверс**: `Domeo_Опции_Надбавка_реверс_руб`.
  - **Зеркало**: одна сторона / две стороны — соответствующие поля опций.
  - **Порог**: `Domeo_Опции_Цена_порога_руб`.
  - **Кромка**: базовая = 0; иначе наценка из `Domeo_Кромка_Наценка_Цвет_2/3/4`.
- Отдельные товары в корзине (цены из своих продуктов):
  - **hardware_kit** (комплект фурнитуры)
  - **handle** (ручка)
  - **limiter_id** (ограничитель)
  - **option_ids** (наличники и т.д.)

Ответ: `currency`, `base`, `breakdown[]`, `total`, `sku`.

---

## 3. Цепочки на странице (app/doors/page.tsx)

### 3.1 Состояние, влияющее на список моделей

- **selectedStyle** — инициализируется из **availableStyles[0]** при первой загрузке (если текущий не в списке).
- **selectedFilling** — «Все» (null) или конкретное наполнение (Голд, Сильвер и т.д.).

**filteredModels** = allModels, отфильтрованные по:

1. `m.style === selectedStyle`
2. При selectedFilling: `m.filling_names?.includes(selectedFilling)` (или fallback по doorOptions.filling_name).

При изменении filteredModels: если **selectedModelId** не входит в filteredModels, он сбрасывается на первую модель из списка или null.

### 3.2 Параметры каскада (model-options)

**modelOptionsParams** = { reversible, filling: selectedFilling, width, height, finish: selectedFinish, color: selectedCoatingForOptions?.color_name }.

Отправляются в useModelOptions при любом изменении этих полей.

### 3.3 Условие расчёта цены (canCalculatePrice)

Цена считается только при выполнении всех условий:

- selectedStyle
- selectedModelId
- width, height
- selectedFinish
- selectedCoatingId

(Реверс и наполнение не входят в canCalculatePrice, но передаются в selection и влияют на подбор и надбавки.)

### 3.4 Когда вызывается расчёт и что передаётся

- **Сброс цены:**
  - При смене **selectedModelId** (prevModelIdRef).
  - При смене **coatingKey** (фактическое покрытие/цвет: selectedCoatingId + coating_type + color_name).
  - При `!canCalculatePrice` (clearPrice в эффекте).

- **Вызов calculatePrice** выполняется только если:
  - canCalculatePrice === true;
  - **selectedModelData?.id === selectedModelId** (данные модели уже синхронизированы с выбранной моделью).

В **selection** уходят: door_model_id (= selectedModelId), style (из selectedModelData), finish, color (из coatings по selectedCoatingId), width, height, edge_id, option_ids, handle_id, limiter_id, hardware_kit_id, reversible, mirror, threshold, **filling: selectedFilling**.

### 3.5 Защита от гонки запросов (usePriceCalculation)

- **lastRequestIdRef**: при каждом вызове calculate инкрементируется; при получении ответа проверяется, что requestId совпадает с текущим значением ref. Если запущен более новый расчёт — ответ игнорируется.
- Итог: отображается только цена последнего запроса (актуальная комбинация модель/покрытие/размеры и т.д.).

---

## 4. Согласованность данных

### 4.1 Идентификация модели

- В списке карточек и в расчёте цены модель задаётся **modelKey** = «Код модели Domeo (Web)» (в UI — selectedModelId).
- complete-data и model-options используют тот же код; price/doors получает selection.model = door_model_id = selectedModelId. **Связь везде одна и та же.**

### 4.2 Стиль

- В фильтре списка моделей: **selectedStyle**.
- В model-options и price/doors передаётся тот же стиль (selectedModelData?.style). После синхронизации selectedModelData с selectedModelId стиль всегда соответствует выбранной модели.

### 4.3 Наполнение (каталог)

- Фильтр списка моделей: **selectedFilling** (по filling_names модели).
- Каскад model-options: параметр **filling** = selectedFilling.
- Расчёт цены: **selection.filling** = selectedFilling; в price/doors по нему фильтруются товары. **Связь соблюдена.**

### 4.4 Размеры

- Ширина/высота в UI: из **selectedModelData.sizes** плюс диапазоны 2301–2500 (2350) и 2501–3000 (2750).
- В model-options при height 2350/2750 для фильтра подставляется 2000.
- В price/doors то же правило heightForMatching(selection.height); надбавки за 2350/2750 считаются по свойствам товара. **Согласовано.**

### 4.5 Покрытие и цвет

- **selectedFinish** — тип покрытия; **selectedCoatingId** — конкретный вариант (тип + цвет). finish и color в API берутся из coatings по selectedCoatingId.
- При смене покрытия/цвета **coatingKey** меняется → сбрасывается цена и перезапускается эффект расчёта с новым finish/color. **Связь и обновление цены обеспечены.**

### 4.6 Реверс, зеркало, порог, кромка

- Передаются в selection и обрабатываются в price/doors (надбавки или учёт в подборе, где применимо). Доступность реверса в UI синхронизирована с modelOptionsData.revers_available (сброс reversible при недоступности).

---

## 5. Краткая схема связей

```
complete-data → allModels (filling_names, style, sizes, …)
       ↓
filteredModels = f(selectedStyle, selectedFilling)
       ↓
selectedModelId → useModelDetails → selectedModelData, coatings, finishes, edges, …
       ↓
modelOptionsParams = { reversible, filling, width, height, finish, color }
       ↓
useModelOptions → modelOptionsData (finishes, colorsByFinish, edges, revers_available, …)
       ↓
UI: размеры из selectedModelData.sizes + диапазоны; типы покрытия/цвета с учётом modelOptionsData
       ↓
canCalculatePrice && selectedModelData?.id === selectedModelId
       ↓
calculatePrice({ door_model_id, style, finish, color, width, height, filling, reversible, mirror, threshold, edge_id, … })
       ↓
POST /api/price/doors → filterProducts (model, style, finish, color, width, heightForMatching(height), filling) → pickMaxPriceProduct → база + надбавки
       ↓
priceData (total, breakdown, sku) → отображение и «В корзину»
```

---

## 6. Проверочный список (верификация)

- [ ] **Стиль:** При смене стиля список моделей меняется; выбранная модель сбрасывается, если не входит в новый список.
- [ ] **Наполнение:** При выборе «Голд» показываются только модели с Голд; цена считается по товару с наполнением Голд (проверка по SKU/названию в ответе или в корзине).
- [ ] **Высота 2301–2500 / 2501–3000:** В каскаде model-options не пустые опции; цена считается с надбавкой за высоту, если в товаре заданы проценты.
- [ ] **Смена модели:** При переключении на другую модель цена сбрасывается, затем показывается расчёт для новой модели (нет «прилипания» старой цены).
- [ ] **Смена покрытия/цвета:** При переключении с ПВХ на Эмаль и выборе цвета цена пересчитывается и отображается новая (нет старой цены).
- [ ] **Реверс:** При включении реверса надбавка добавляется в breakdown и total (если у товара заполнена Domeo_Опции_Надбавка_реверс_руб).
- [ ] **Кромка:** При выборе кромки с наценкой она отображается в breakdown; при «Кромка не доступна» в UI и спецификации показывается «Кромка не доступна».
- [ ] **Корзина:** Добавление в корзину использует priceData.total и priceData.sku; параметры (модель, размеры, покрытие, реверс, наполнение и т.д.) соответствуют текущему выбору.

---

## 7. Устаревшие/неиспользуемые в калькуляторе (legacy) — обновлено

1. **Тип конструкции** — не используется, в БД параметра нет. Проверка `typeMatch` в price/doors **удалена** (фильтр по типу конструкции больше не применяется).
2. **Звукоизоляция (Стандартное/Хорошее/Отличное)** — устаревшие данные **удалены** из конфигуратора: убран state `filling` (standard/good/excellent), массив fillingOptions, функция getFillingText. В спецификации остаётся только «Наполнение (каталог)» (selectedFilling: Голд, Сильвер и т.д.).
3. **Domeo_Цвет в товаре:** в товаре поле может быть пустым; в фильтре цены допускается `color == null`. Фактический цвет для пользователя берётся из выбора в конфигураторе (покрытие + цвет).

---

## 8. Статус ранее выявленных проблем (CONFIGURATOR_FILTERS_AUDIT / CONFIGURATOR_FIX_PLAN)

| № | Проблема | Статус |
|---|----------|--------|
| 1 | Цена не учитывала наполнение (filling) | **Исправлено:** в selection передаётся filling, в price/doors фильтр по Domeo_Опции_Название_наполнения |
| 2 | При высотах 2350/2750 model-options возвращал пустой каскад | **Исправлено:** в model-options для фильтра подставляется height 2000 |
| 3 | selectedModelId не сбрасывался при сужении фильтров | **Исправлено:** useEffect сбрасывает на первую модель из filteredModels при выпадении текущей |
| 4 | Дефолтный стиль «Современные» мог отсутствовать в данных | **Исправлено:** инициализация selectedStyle из availableStyles[0] при первой загрузке |
| 5 | Два «наполнения» в UI | **Уточнено:** в спецификации разделены «Наполнение (каталог)» и «Звукоизоляция» |
| 6 | Цена не обновлялась при смене модели | **Исправлено:** сброс цены при смене modelId + расчёт только при selectedModelData?.id === selectedModelId + игнор устаревших ответов (request id) |
| 7 | Цена не обновлялась при смене покрытия/цвета | **Исправлено:** сброс цены при смене coatingKey + зависимость эффекта от coatingKey |
| 8 | Кромка: при недоступности показывалось «Без кромки» | **Исправлено:** при отсутствии вариантов кромки показывается «Кромка не доступна» |

---

## 9. Итог

- Источники данных (complete-data, useModelDetails, model-options, price/doors) и их контракты зафиксированы.
- Цепочки фильтров на странице и в API согласованы: стиль → модель → наполнение → размеры → покрытие и цвет; каскад и расчёт цены используют одни и те же идентификаторы и названия.
- Движок расчёта цены: подбор товара по selection (включая filling и height 2350/2750 → 2000), надбавки по свойствам товара; защита от гонки запросов и сброс цены при смене модели/покрытия обеспечивают актуальное отображение.
- Для уверенности в работе достаточно пройти проверочный список из раздела 6 вручную или автоматизированно.

Связанные документы: `CONFIGURATOR_FILTERS_AUDIT.md`, `CONFIGURATOR_FIX_PLAN.md`, `DOOR_ATTRIBUTES_MAP.md`.
