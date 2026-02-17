# Аудит использования данных в калькуляторе: связи, фильтры, влияния

**Дата:** 2026-02-15  
**Цель:** Максимально полный профессиональный разбор — что откуда берётся, что на что влияет, что что фильтрует, и какие реальные проблемы при этом возникают.

---

## 1. Источники данных (API и хуки)

| Источник | Когда вызывается | Что возвращает |
|----------|------------------|----------------|
| **GET /api/catalog/doors/complete-data** | Один раз при загрузке страницы (useConfiguratorData), без query-параметров (в т.ч. без `style`) | `models[]`, `styles[]`, `totalModels`, `timestamp`. Кэш 30 мин, ключ `style \|\| 'all'`. |
| **useConfiguratorData()** | Один раз при монтировании | `models` (мапп complete-data → DoorModelWithOptions), `rawModels`, `handles`, `limiters`, `architraves`, `kits`, `loading`, `error`. |
| **useModelDetails(selectedModelId, rawModels)** | При смене selectedModelId | Данные одной модели из `rawModels` (или повторный GET complete-data при отсутствии): `model`, `coatings`, `finishes`, `colorsByFinish`, `edges`, `options`. |
| **GET /api/catalog/doors/model-options** | При смене модели или любого из: reversible, filling, width, height, finish, color (useModelOptions) | Каскадные опции по отфильтрованным товарам: `fillings`, `widths`, `heights`, `finishes`, `colorsByFinish`, `edges`, `revers_available`, `mirror_available`, `threshold_available`, `filteredCount`. |
| **POST /api/price/doors** | При изменении выбора (модель, покрытие, размеры, наполнение, реверс и т.д.), если canCalculatePrice и selectedModelData синхронизированы | Подбор товара по selection, расчёт базы и надбавок, ответ: `currency`, `base`, `breakdown`, `total`, `sku`. |
| **GET /api/catalog/hardware?type=...** | При загрузке (handles, limiters, architraves, kits) | Ручки, ограничители, наличники, комплекты фурнитуры. |

---

## 2. Полная таблица состояния (page.tsx) и влияний

Каждое состояние: что оно фильтрует, что от него зависит, в какие API уходит.

| Состояние | Тип | Что фильтрует / от чего зависит | Влияет на |
|-----------|-----|----------------------------------|-----------|
| **selectedStyle** | string | Список моделей: `filteredModels = allModels.filter(m => m.style === selectedStyle)`. Инициализация из `availableStyles[0]`. | filteredModels, сброс selectedModelId при выпадении, **model-options** (query `style`), **price** (selection.style из selectedModelData). |
| **selectedFilling** | string \| null | Список моделей: при не null — только модели с `filling_names.includes(selectedFilling)`. | filteredModels, сброс selectedModelId, **modelOptionsParams.filling** → model-options, **price** (selection.filling). |
| **selectedModelId** | string \| null | — | useModelDetails, useModelOptions (query `model`), price (door_model_id). Сброс цены при смене. |
| **selectedModel** | string | Только отображение (название). | UI. |
| **selectedFinish** | string \| null | Типы покрытия в UI; цвета ограничиваются modelOptionsData.colorsByFinish[selectedFinish]. | modelOptionsParams.finish → model-options, **price** (selection.finish из coating). |
| **selectedCoatingId** | string \| null | Конкретный цвет в выбранном типе покрытия. | modelOptionsParams.color (coating?.color_name) → model-options, **price** (selection.color, coatingKey → сброс цены). |
| **selectedColor, selectedWood** | string \| null | Отображение; при смене типа покрытия сбрасываются. | Синхронизация с selectedCoatingId. |
| **selectedEdgeId** | string \| null | Вариант кромки. | **price** (selection.edge_id). Список edgeOptions от modelOptionsData.edges и edges модели. |
| **width, height** | number | — | **modelOptionsParams** → model-options (фильтр товаров), **price** (selection.width, selection.height; при 2350/2750 в API подставляется 2000 для подбора). |
| **reversible** | boolean | — | modelOptionsParams → model-options; **price** (selection.reversible). Сброс при !modelOptionsData.revers_available. |
| **selectedGlassColor** | string \| null | Только спецификация, на цену не влияет. | Документ/спецификация. |
| **selectedHardwareKit, selectedHandleId, hasLock** | разное | — | **price** (hardware_kit, handle, backplate). |
| **selectedArchitraveId** | string \| null | — | **price** (option_ids, supplier от наличника). architraveOptions фильтруются по modelSuppliers. |
| **selectedStopperId, selectedMirrorId, selectedThresholdId** | string \| null / boolean | — | **price** (limiter_id, mirror, threshold). |

**Итог:** Стиль и наполнение фильтруют **список моделей**. Модель + размеры + наполнение + реверс + покрытие/цвет фильтруют **каскад model-options** и **подбор товара в price**.

---

## 3. Цепочки фильтрации по шагам

### 3.1 Список моделей (карточки)

```
allModels (из complete-data, id = modelKey)
    ↓
filteredModels = allModels
    .filter(m => !selectedStyle || m.style === selectedStyle)
    .filter(m => !selectedFilling || (m.filling_names ?? [m.doorOptions?.filling_name].filter(Boolean)).includes(selectedFilling))
```

- **availableStyles** = уникальные `m.style` по allModels.
- **availableFillingsFromAll** = объединение всех `m.filling_names` (и fallback doorOptions.filling_name) по allModels.
- **availableFillings** = если выбрана модель и modelOptionsData.fillings.length > 0 → modelOptionsData.fillings, иначе availableFillingsFromAll.

При изменении filteredModels: если **selectedModelId** не входит в filteredModels, он сбрасывается на первую модель из списка.

### 3.2 Каскад опций (model-options)

Параметры запроса: `model`, `style`, `reversible`, `filling`, `width`, `height`, `finish`, `color`.

Порядок фильтрации в API (doors-model-options.ts + route):

1. **getProductsByModelAndStyle** — Код модели Domeo (Web) + при наличии style: Domeo_Стиль Web.
2. **filterByReversible** — при reversible=true только товары с Реверс_доступен = да.
3. **filterByFilling** — Domeo_Опции_Название_наполнения === filling.
4. **filterBySize** — Ширина/мм, Высота/мм (при height 2350/2750 в фильтр подставляется 2000).
5. **filterByFinish** — Тип покрытия.
6. **filterByColor** — Domeo_Цвет (или Цвет/Отделка, если используется).

По отфильтрованному набору **collectOptions** собирает fillings, widths, heights, finishes, colorsByFinish, edges, revers_available, mirror_available, threshold_available.

### 3.3 Расчёт цены (price/doors)

- **canCalculatePrice** = selectedStyle && selectedModelId && width && height && selectedFinish && selectedCoatingId.  
  **Наполнение (selectedFilling) в canCalculatePrice не входит** — цена может считаться и без выбора наполнения; при этом в selection всё равно уходит selectedFilling, и подбор товара идёт по нему.
- **selection** в API: model, style (из selectedModelData), finish, color (из coatings по selectedCoatingId), width, height, filling, reversible, mirror, threshold, edge_id, option_ids, handle, hardware_kit, backplate, limiter_id, supplier (от наличника).
- В движке (doors-price-engine): **filterProducts** по style, model, finish, color, width, heightForMatching(height), filling, supplier; при отсутствии совпадений — ослабление по finish, затем по style. Из совпадений выбирается товар с **максимальной Цена РРЦ**. Затем к базе добавляются надбавки (высота 2301–2500/2501–3000, реверс, зеркало, порог, кромка и т.д.).

---

## 4. Критические проблемы (которые аудит должен учитывать)

### 4.1 Одна запись на код модели и один стиль (complete-data)

**Проблема:**  
Фронт вызывает complete-data **без** параметра `style`. В API при отсутствии `style` в modelMap попадают **все** товары (фильтр `if (style && styleString !== style) return` не срабатывает). Но у каждой записи в modelMap поле **style** задаётся один раз — при создании записи, из **первого** попавшего товара. То есть для одного и того же кода модели (например, Base 1) в ответе одна запись с `style = "Современные"` (если первым обработан товар в стиле «Современные»). Товары этого же кода в стиле «Классика» или «Неоклассика» в эту же запись попадают (products есть), но **m.style остаётся одним**. В UI фильтр по стилю: `m.style === selectedStyle`. Поэтому при выборе «Классика» модель Base 1 **исчезает** из списка, хотя в каталоге у Base 1 есть товары в стиле Классика.

**Следствие:** Наполнение для «всех моделей выбранного кода» не может быть предложено для «всех», потому что часть моделей по коду не показывается вообще — они «склеены» в одну карточку с одним стилем.

**Рекомендация:**  
Либо возвращать из complete-data **несколько записей на один modelKey** — по одной на каждый стиль, в котором есть товары (у каждой записи свой `style`, общий `modelKey`; `filling_names` по коду — уже собираются по всем товарам через fillingByModelKey). Либо ввести у модели поле **styles: string[]** и на клиенте фильтровать по `m.styles.includes(selectedStyle)`.

### 4.2 Наполнение по коду (filling_names) — исправлено

**Было:** В complete-data при запросе **с** параметром `style` в modelMap попадали только товары этого стиля; `filling_names` строился по ним — для одного кода могли быть видны не все варианты наполнения.

**Сделано:** Введён отдельный проход по **всем** товарам (без фильтра по стилю), строится **fillingByModelKey** (код модели → Set наполнений). В ответе у каждой модели `filling_names` берётся из этой карты; fallback — прежняя логика по products. В результате для выбранного кода в UI предлагается полный список наполнений по каталогу.  
(Если фронт не передаёт `style`, раньше products уже были все — но тогда style у модели один, и проблема п.4.1 остаётся; исправление filling_names всё равно полезно для консистентности и на случай вызова API с style.)

### 4.3 Несоответствие подсказки и условия расчёта цены

В подсказке при отсутствии цены указано: «Для расчета цены выберите Стиль, Модель, Размеры, **Наполнение**, Покрытие и Цвет». В **canCalculatePrice** наполнение не входит — расчёт возможен и без selectedFilling. При этом в selection наполнение передаётся и влияет на подбор товара. Имеет смысл либо добавить selectedFilling в canCalculatePrice, либо убрать «Наполнение» из текста подсказки.

### 4.4 Согласованность стиля между списком моделей и расчётом

В price передаётся **selectedModelData?.style**. После синхронизации selectedModelData с selectedModelId это всегда стиль той единственной записи модели из complete-data. Из-за п.4.1 этот стиль может не совпадать с **selectedStyle** в UI (если бы мы показывали одну и ту же модель в нескольких стилях — пока не показываем). После исправления п.4.1 (несколько записей на код или styles[]) нужно гарантировать, что в price уходит стиль, соответствующий выбранной карточке (т.е. выбранному стилю или явному полю стиля у выбранной записи).

---

## 5. Граф зависимостей (кратко)

```
complete-data (без style) → allModels [одна запись на modelKey, style = первый товар]
       ↓
availableStyles, availableFillingsFromAll
       ↓
selectedStyle, selectedFilling → filteredModels
       ↓
selectedModelId (сброс при выпадении из filteredModels)
       ↓
useModelDetails(rawModels) → selectedModelData, coatings, finishes, colorsByFinish, edges, options
       ↓
modelOptionsParams = { reversible, filling: selectedFilling, width, height, finish, color }
       ↓
useModelOptions(model, style, params) → modelOptionsData (fillings, widths, heights, finishes, colorsByFinish, edges, …)
       ↓
widthOptions (из selectedModelData.sizes), heightOptions (sizes + 2350, 2750)
cascadeFinishes, filteredCoatings (по modelOptionsData.colorsByFinish)
edgeOptions (по modelOptionsData.edges и edges)
       ↓
canCalculatePrice && selectedModelData?.id === selectedModelId
       ↓
calculatePrice(selection) → POST price/doors → filterProducts → pickMaxPriceProduct → надбавки → priceData
       ↓
Отображение цены, кнопка «В корзину», документ/спецификация
```

---

## 6. Что что фильтрует — сводка

| Что фильтруется | Где | Условие |
|----------------|-----|---------|
| Список моделей (карточки) | UI, filteredModels | selectedStyle (m.style), selectedFilling (m.filling_names) |
| Товары в model-options | API model-options | model, style, reversible, filling, width, height, finish, color |
| Товар для цены | API price/doors | model, style, finish, color, width, height, filling, supplier |
| Типы покрытия в UI | cascadeFinishes | modelOptionsData.finishes или finishes модели |
| Цвета в UI | filteredCoatings | selectedFinish + modelOptionsData.colorsByFinish[selectedFinish] |
| Кромки в UI | edgeOptions | modelOptionsData.edges, edges, edge_in_base |
| Наличники | architraveOptions | modelSuppliers (поставщики выбранной модели) |
| Варианты наполнения в UI | availableFillings | modelOptionsData.fillings (если модель выбрана и есть) или availableFillingsFromAll |

---

## 7. Рекомендации по исправлениям

1. **Обязательно:** Реализовать в complete-data либо несколько записей на (modelKey, style), либо поле `styles: string[]` и фильтр на клиенте по `styles.includes(selectedStyle)`, чтобы одна и та же модель по коду была видна во всех стилях, где есть товары.
2. **Проверить:** После изменения — что в price и model-options передаётся корректный стиль (соответствующий выбранной карточке/стилю).
3. **Уточнить:** Требование к расчёту цены без выбора наполнения: либо добавить selectedFilling в canCalculatePrice и в подсказку оставить «Наполнение», либо убрать «Наполнение» из подсказки.
4. Оставить и при необходимости расширить верификационный список из CALCULATOR_FULL_AUDIT.md (раздел 6), добавив проверку: «При смене стиля все коды моделей, у которых есть товары в этом стиле, отображаются в списке (в т.ч. Base 1 в Классика, если такие товары есть)».

---

## 8. Связанные документы

- **CALCULATOR_FULL_AUDIT.md** — контракты API, движок расчёта, согласованность.
- **CALCULATOR_AUDIT_ISSUES_LIST.md** — список проблем и статусы.
- **REMAINING_ISSUES.md** — общие оставшиеся задачи.
