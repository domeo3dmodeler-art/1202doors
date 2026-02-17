# Окончательная проверка модели фильтров калькулятора

**Дата:** 2026-02-15  
**Цель:** Единая матрица фильтров — где применяется, по какому полю БД, порядок, согласованность между UI, complete-data, model-options, price.

---

## 1. Сводная матрица: фильтр → где применяется → поле/условие

| Фильтр | UI (состояние) | Список моделей (filteredModels) | complete-data | model-options API | price/doors |
|--------|----------------|----------------------------------|--------------|-------------------|-------------|
| **Стиль** | selectedStyle | `m.style === selectedStyle` | При запросе с `?style=` — в modelMap попадают только товары с этим стилем. Без style: по одному объекту на (modelKey, style). | query `style` → **getProductsByModelAndStyle**: `Domeo_Стиль Web === style` | **filterProducts**: `Domeo_Стиль Web === selection.style` (или начало по 8 символам) |
| **Наполнение** | selectedFilling | При не null: `m.filling_names?.includes(selectedFilling)` (fallback doorOptions.filling_name) | Не фильтрует товары. **filling_names** по коду: из **fillingByModelKey** (все товары с этим кодом, поле `Domeo_Опции_Название_наполнения`). | query `filling` → **filterByFilling**: `Domeo_Опции_Название_наполнения === filling` | **filterProducts**: `Domeo_Опции_Название_наполнения === selection.filling` |
| **Модель (код)** | selectedModelId | — | Группировка по `Код модели Domeo (Web)`; ответ: modelKey, по одному объекту на (modelKey[, style]). | query `model` → **getProductsByModelAndStyle**: `Код модели Domeo (Web) === model` или `Domeo_Название модели для Web === model` | **filterProducts**: `Код модели Domeo (Web)` === selection.model (или включение) |
| **Реверс** | reversible | — | — | query `reversible=true` → **filterByReversible**: `Domeo_Опции_Реверс_доступен` содержит «да» | selection.reversible → надбавка из товара; подбор товара не фильтрует по реверсу |
| **Ширина** | width | — | — | query `width` → **filterBySize**: `Ширина/мм === width` | **filterProducts**: `Ширина/мм == selection.width` |
| **Высота** | height | — | — | query `height`: при 2350/2750 подставляется **2000** (**heightForFilter**), затем **filterBySize**: `Высота/мм === height` | **heightForMatching**: 2350/2750 → 2000 для подбора; `Высота/мм == heightToMatch`. Надбавки за 2350/2750 по полям товара. |
| **Тип покрытия** | selectedFinish → finish в API | — | Покрытия из товаров: `Тип покрытия` + цвет (см. Цвет). | query `finish` → **filterByFinish**: `Тип покрытия === finish` | **filterProducts**: `Тип покрытия === selection.finish` |
| **Цвет** | selectedCoatingId → color_name | — | Покрытия из товаров: **Цвет/Отделка** ?? (fallback не используется в products). | query `color` → **filterByColor**: канонический цвет = **Цвет/Отделка ?? Domeo_Цвет**; сравнение с color. **collectOptions** цвета по тому же каноническому полю. | **filterProducts**: **Цвет/Отделка ?? Domeo_Цвет** === selection.color (или dbColor == null) |
| **Кромка** | selectedEdgeId | — | edge_options из товаров (Кромка, Domeo_Кромка_*). | **collectOptions** по отфильтрованному набору: `Кромка` (не «-»). | selection.edge_id → надбавка из товара; подбор по остальным полям |
| **Поставщик** | от наличника (selectedArchitraveId → supplier) | — | — | — | **filterProducts**: `Поставщик === selection.supplier` |

Согласованность по цвету: complete-data и price используют приоритет **Цвет/Отделка**; model-options приведён к тому же правилу (getCanonicalColor = Цвет/Отделка ?? Domeo_Цвет) в filterByColor и collectOptions.

---

## 2. Порядок применения фильтров

### 2.1 Список моделей (UI)

1. **allModels** (из complete-data; при отсутствии style в запросе — несколько записей на один modelKey по разным стилям).
2. По **selectedStyle**: оставить модели с `m.style === selectedStyle`.
3. По **selectedFilling** (если задан): оставить модели, у которых в `filling_names` (или doorOptions.filling_name) есть выбранное наполнение.

### 2.2 model-options API

Порядок в route (последовательно по отфильтрованному массиву товаров):

1. **getProductsByModelAndStyle**(products, model, style) — код модели + стиль.
2. **filterByReversible**(filtered, true) — только если reversible=true.
3. **filterByFilling**(filtered, filling) — если передан filling.
4. **filterBySize**(filtered, width, null) — если передан width.
5. **filterBySize**(filtered, width, height) — если передан height (уже с heightForFilter: 2350/2750 → 2000).
6. **filterByFinish**(filtered, finish) — если передан finish.
7. **filterByColor**(filtered, color) — если передан color (канонический цвет: Цвет/Отделка ?? Domeo_Цвет).

После этого по отфильтрованному набору вызывается **collectOptions** (fillings, widths, heights, finishes, colorsByFinish, edges, revers_available, mirror_available, threshold_available).

### 2.3 price/doors (filterProducts)

Один проход по товарам: для каждого товара проверяются одновременно style, model, finish, color (Цвет/Отделка ?? Domeo_Цвет), width, height (через heightForMatching), filling, supplier. При отсутствии совпадений — повтор с ослаблением requireFinish, затем requireStyle. Из совпадений выбирается товар с максимальной **Цена РРЦ**.

---

## 3. Сбросы выбора при сужении фильтров

| Условие | Действие |
|---------|----------|
| selectedStyle или selectedFilling изменились и **selectedModelId** нет в **filteredModels** | selectedModelId и selectedModel сбрасываются на первую модель из filteredModels (или null). |
| Нет доступных **filteredCoatings** для выбранной модели/типа покрытия | selectedCoatingId, selectedColor, selectedWood сбрасываются. |
| selectedCoatingId не в **filteredCoatings** | Выбирается первый элемент из filteredCoatings. |
| Реверс включён, но **modelOptionsData.revers_available** false | reversible сбрасывается в false. |
| Кромка в базе у модели, но selectedEdgeId не в списке | Выбирается первая кромка из edges. |
| Кромка не в базе, но selectedEdgeId не в списке | selectedEdgeId сбрасывается (в т.ч. «Без кромки» при необходимости). |

---

## 4. Источники списков опций в UI

| Опция в UI | Источник | Примечание |
|------------|----------|------------|
| Стили | **availableStyles** = уникальные m.style по allModels. | |
| Наполнение (блоки Сильвер/Голд/Платинум) | **availableFillings** = при выбранной модели и непустом modelOptionsData.fillings → modelOptionsData.fillings, иначе **availableFillingsFromAll** (объединение filling_names по allModels). | fillingBlockMatches — сопоставление по regex с названиями из availableFillings. |
| Ширина | **widthOptions** = уникальные ширины из selectedModelData.sizes (complete-data), иначе дефолт [600,700,800,900]. | Не из model-options, чтобы список не сужался текущим выбором. |
| Высота | **heightOptions** = уникальные высоты из selectedModelData.sizes + диапазоны 2301–2500 (2350), 2501–3000 (2750). | |
| Тип покрытия | **cascadeFinishes** = при выбранной модели и непустом modelOptionsData.finishes → modelOptionsData.finishes, иначе finishes из useModelDetails. | |
| Цвет (по типу покрытия) | **filteredCoatings** = coatings по selectedFinish, затем по modelOptionsData.colorsByFinish[selectedFinish] (если есть). | Цвет из coating = color_name (в complete-data из Цвет/Отделка). |
| Кромка | **edgeOptions** = edges модели; при непустом modelOptionsData.edges — только разрешённые; при edge_in_base — без варианта «Без кромки». | |
| Наличники | **architraveOptions** = фильтр по **modelSuppliers** (поставщики выбранной модели); при отсутствии совпадений — все (fallback). | |

---

## 5. Проверочный список (финальная верификация)

- [ ] **Стиль:** Смена selectedStyle обновляет список карточек; выбранная модель сбрасывается, если не входит в новый список. В model-options и price передаётся тот же стиль (selectedModelData.style = выбранная карточка).
- [ ] **Наполнение:** При выборе наполнения список моделей сужается по filling_names; model-options и price получают filling; цена считается по товару с этим наполнением.
- [ ] **Цвет:** В model-options и price используется один и тот же канонический цвет (Цвет/Отделка ?? Domeo_Цвет); список цветов в model-options (colorsByFinish) строится по тому же полю.
- [ ] **Высота 2350/2750:** В model-options для фильтра подставляется 2000; в price то же для подбора; надбавки за высоту считаются по полям товара.
- [ ] **Модель:** Один код модели может иметь несколько записей в allModels (по стилям); useModelDetails и price получают modelKey и style выбранной карточки.
- [ ] **Сбросы:** При сужении фильтров (стиль/наполнение) selectedModelId сбрасывается; при недоступности покрытия/кромки/реверса соответствующий выбор сбрасывается или подставляется первый допустимый вариант.

---

## 6. Внесённые изменения при верификации (2026-02-15)

- **Цвет в model-options:** filterByColor и collectOptions переведены на канонический цвет **Цвет/Отделка ?? Domeo_Цвет** (функция getCanonicalColor в doors-model-options.ts), чтобы совпадать с complete-data и price/doors.

Связанные документы: **CALCULATOR_DATA_FLOW_AUDIT.md**, **CALCULATOR_FULL_AUDIT.md**, **CALCULATOR_AUDIT_ISSUES_LIST.md**.
