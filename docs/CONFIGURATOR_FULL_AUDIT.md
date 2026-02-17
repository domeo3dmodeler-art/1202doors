# Полный аудит конфигуратора дверей: данные, связи, расчёты

Дата: 2026-02-15

Цель: исчерпывающая фиксация источников данных, цепочек от выбора до экспорта, расчёта цены и точек возможного рассогласования.

---

## 1. Обзор: один конфигуратор

Единственный конфигуратор дверей: **app/doors/page.tsx** (маршрут `/doors`).

- **Данные:** useConfiguratorData + useModelDetails(selectedModelId, rawModels) — детали модели из кэша, без повторного запроса.
- **Опции по модели:** useModelOptions(selectedModelId, selectedStyle, params) — каскад finishes/colors по фильтрам.
- **Корзина:** finish/color из getCoatingForCart() (значения из БД: Тип покрытия, Domeo_Цвет).
- **Расчёт цены:** usePriceCalculation(); door_model_id = selectedModelId (= код модели).
- **Документ:** POST /api/documents/generate (из корзины).

---

## 2. Источники данных (строго из БД)

### 2.1 Каталог дверей: GET /api/catalog/doors/complete-data

- **Кто вызывает:** useConfiguratorData (при загрузке страницы), при необходимости — useModelDetails (если нет rawModels).
- **Кэш:** 30 мин (completeDataCache); сброс: DELETE с авторизацией или ?refresh=1.
- **БД:** `Product` (catalog_category = «Межкомнатные двери», is_active = true), `PropertyPhoto`, `ProductImage`.

Что строится по продуктам:

- **Группировка моделей:** по `properties_data['Код модели Domeo (Web)']` (modelKey). В ответе: model, modelKey, style (`Domeo_Стиль Web`), products[], suppliers (из `Поставщик`).
- **Покрытия (coatings):**  
  - Основной источник — лист «Цвет» (PropertyPhoto): значение вида `factoryName|coatingType|colorName` → в API отдаётся coating_type, color_name.  
  - Fallback в клиенте (applyFoundModel): если в ответе нет coatings — собираются из products по `Тип покрытия` и `Domeo_Цвет`.
- **Опции модели:** по всем products модели: реверс, порог, зеркало, наполнение, кромка (Domeo_Опции_*, Domeo_Кромка_*).
- **Размеры (sizes):** из products: Ширина/мм, Высота/мм.

Риск: coatings из complete-data могут приходить из PropertyPhoto (формат «Цвет»), а не из properties товаров. Тогда coating_type/color_name в UI могут не совпадать с полями в Product.properties_data (Тип покрытия, Domeo_Цвет). В applyFoundModel при отсутствии coatings используется fallback по products — тогда значения совпадают с БД. Рекомендация: гарантировать, что значения в PropertyPhoto для «Цвет» совпадают с Тип покрытия/Domeo_Цвет в товарах, либо отдавать coatings из products в приоритете.

### 2.2 Оборудование: GET /api/catalog/hardware

- **Параметры:** type=handles | limiters | architraves | kits.
- **Кто вызывает:** useConfiguratorData (все типы).
- **БД:** Product по категориям «Ручки»/«Ручки и завертки», «Ограничители», опции (наличники), «Комплекты фурнитуры».

Ручки: id, name, price (Цена РРЦ и т.д.), photos, color, backplate_price_rrc. Ограничители: id, name, price. Наличники: id, option_type, option_name, price_surcharge, supplier.

### 2.3 Каскадные опции: GET /api/catalog/doors/model-options

- **Параметры:** model (обязательный), style, reversible, filling, width, height, finish, color.
- **Кто вызывает:** useModelOptions (только на doors) при изменении модели или параметров.
- **БД:** те же Product «Межкомнатные двери»; фильтрация в lib/catalog/doors-model-options.

Порядок фильтрации:

1. Модель: `Код модели Domeo (Web)` или `Domeo_Название модели для Web` === model.
2. Стиль: `Domeo_Стиль Web` === style.
3. Реверс, наполнение, ширина, высота (в т.ч. высоты 2350/2750 → 2000 для фильтра).
4. **Тип покрытия** === finish (`Тип покрытия` в БД).
5. **Domeo_Цвет** === color.

Результат: fillings, widths, heights, finishes, colorsByFinish, edges, mirror_available, threshold_available. Все значения — из properties_data товаров.

### 2.4 Расчёт цены: POST /api/price/doors

- **Тело:** `{ selection: { model, style, finish, color, width, height, handle, limiter_id, option_ids, reversible, mirror, threshold, filling, hardware_kit, backplate, supplier } }`.
- **Кто вызывает:** usePriceCalculation().calculate(params); params приходят с конфигуратора (/doors): door_model_id (= код модели), finish, color (из coating), width, height и т.д.
- **БД:** Product (Межкомнатные двери, Ручки, Ограничители, Комплекты фурнитуры, опции по id).

Подбор двери: lib/price/doors-price-engine.ts — filterProducts(products, selection, requireStyle, requireFinish):

- model: `Domeo_Название модели для Web` или `Код модели Domeo (Web)` / `Артикул поставщика` (совпадение или includes).
- style: `Domeo_Стиль Web`.
- finish: `Тип покрытия` === selection.finish.
- color: `Domeo_Цвет` === selection.color (или null в товаре).
- width/height: Ширина/мм, Высота/мм (height 2301–2500 / 2501–3000 маппятся в 2000 для подбора).
- filling, supplier — при наличии.

Из подходящих товаров берётся один с максимальной Цена РРЦ. Цена двери = Цена РРЦ (или base_price); надбавки за высоту, реверс, зеркало, порог, кромка, ручка, завертка, ограничитель, наличники — по правилам движка.

Согласованность: если в корзину сохраняются finish и color как в БД (Тип покрытия, Domeo_Цвет), то selection в price/doors и подбор товара совпадают с данными из БД.

---

## 3. Цепочка от выбора до корзины

### 3.1 Код модели и название модели

- **Под капотом** идентификатор модели — **Код модели Domeo (Web)** (в API и коде часто modelKey). На UI для удобства пользователя он отображается как «модель» (выбор модели, превью и т.д.).
- В complete-data: **modelKey** = Код модели Domeo (Web); **model** = displayName (в текущей реализации тоже modelKey).
- В useConfiguratorData модели маппятся: **id** = modelKey, **model_name** = m.model (= modelKey).
- На странице конфигуратора: **selectedModelId** = model.id = modelKey. Он передаётся в calculatePrice как door_model_id и в useModelOptions как modelId.
- В корзину пишется **model** = selectedModelData?.model_name || '' = **код модели** (то же значение).
- **В экспорте Excel** в колонке «Название модели» подставляется не код, а **название модели из БД** — поле **Название модели** (properties_data) у товара, найденного по этому коду (и по выбранным параметрам). С кодом модели в БД связаны товары; у них берётся человекочитаемое «Название модели» для отображения в Excel.

Итог: от UI до корзины и до price/doors везде используется **код модели**; в Excel для людей показывается **название модели** из БД.

### 3.2 Покрытие и цвет

- В complete-data/applyFoundModel покрытия имеют **coating_type**, **color_name** (из API или из product.properties: Тип покрытия, Domeo_Цвет).
- Пользователь выбирает покрытие (selectedCoatingId). В корзину сохраняются (getCoatingForCart): **finish** = coating.coating_type, **color** = coating.color_name.
- В расчёт цены уходит selection.finish и selection.color (те же значения).
- В экспорте (product-match) сопоставление двери: item.finish с Материал/Покрытие или Тип покрытия, item.color с Цвет/Отделка или Domeo_Цвет — строгое равенство.

Итог: при условии, что coatings в UI соответствуют полям БД (Тип покрытия, Domeo_Цвет), цепочка конфигуратор → цена → корзина → экспорт согласована.

### 3.3 Размеры, ручка, ограничитель, опции

- **width, height:** из состояния; в БД сравниваются Ширина/мм, Высота/мм (и нормализация высоты в price-engine).
- **handleId, limiterId:** id продукта из каталога; в экспорте поиск по id в категориях Ручки, Ограничители.
- **optionIds:** id опций (наличники и т.д.); в расчёте цены — getOptionProducts(option_ids).
- **edge, mirror, threshold, reversible:** в корзине и в selection для цены; в экспорте берутся из item (опции двери не ищутся по БД для колонок Кромка/Зеркало/Порог/Реверс).

---

## 4. Документы и экспорт

### 4.1 Создание документа (заказ/счёт/КП)

- **API:** POST /api/documents/generate (или аналог для заказа).
- **Вход:** clientId, items (из корзины), totalAmount. Items содержат: model, finish, color, width, height, handleId, limiterId, optionIds, architraveNames, edge, edgeColorName, glassColor, reversible, mirror, threshold и т.д.
- **Сохранение:** в Order/Document сохраняется cart_data (JSON с items). Эти же items потом попадают в экспорт.

### 4.2 Экспорт в Excel (заказ / заказ поставщика)

- **Источник строк:** items из cart_data (те же поля, что в корзине).
- **Поиск товара в БД:** lib/catalog/product-match.ts — getMatchingProducts(item):
  - Двери: строгое совпадение по model, finish, color, width, height с полями БД (Domeo_Название модели для Web / Код модели, Материал/Покрытие или Тип покрытия, Цвет/Отделка или Domeo_Цвет, Ширина/мм, Высота/мм).
  - Ручки/завертки: по handleId в категории «Ручки».
  - Ограничители: по limiterId в категории «Ограничители».
- **Заполнение колонок:** при найденном товаре — Название модели только из props['Название модели'], Цена опт / Цена РРЦ из props; Поставщик из props; наличники — названия из item (architraveNames/optionNames) или «да».

Согласованность: корзина хранит значения из БД (finish, color, model = code), поэтому при корректных данных в БД и в PropertyPhoto совпадение в product-match ожидаемо.

---

## 5. Матрица полей БД и их использование

| Поле в БД (properties_data) | complete-data | model-options | price/doors (filter) | product-match (export) | Корзина (item) |
|-----------------------------|---------------|---------------|----------------------|-------------------------|-----------------|
| Код модели Domeo (Web)      | modelKey      | model         | model                | model                   | model           |
| Domeo_Название модели для Web | model, factoryNames | model     | model                | model                   | —               |
| Название модели             | —             | —             | —                    | колонка Excel           | —               |
| Domeo_Стиль Web             | style         | style         | style                | —                       | style           |
| Тип покрытия                | coatings, products | finish   | finish               | finish                  | finish          |
| Материал/Покрытие           | —             | —             | —                    | finish (альт.)          | —               |
| Domeo_Цвет                  | coatings, products | color  | color                | color                   | color           |
| Цвет/Отделка                | —             | —             | —                    | color (альт.)           | —               |
| Ширина/мм                   | sizes         | width         | width                | width                   | width           |
| Высота/мм                   | sizes         | height        | height               | height                  | height          |
| Цена РРЦ                    | —             | —             | расчёт               | колонка Excel           | —               |
| Цена опт                    | —             | —             | —                    | колонка Excel           | —               |
| Поставщик                   | suppliers     | —             | supplier              | колонка Excel           | —               |

---

## 6. Выявленные риски и рекомендации

### 6.1 Покрытия из complete-data

- **Риск:** coatings могут строиться из PropertyPhoto (лист «Цвет») с форматом `factoryName|coatingType|colorName`. Если там опечатки или отличия от Тип покрытия/Domeo_Цвет в товарах, в корзину попадёт значение, по которому не найдётся товар при экспорте или при расчёте цены.
- **Рекомендация:** либо формировать coatings в complete-data из products (уникальные пары Тип покрытия + Domeo_Цвет), либо верифицировать, что значения в PropertyPhoto совпадают с properties_data.

### 6.2 Кэш complete-data (30 мин)

- После обновления каталога в БД клиент может до 30 минут видеть старые данные, если не вызван DELETE или ?refresh=1.
- Рекомендация: документировать сброс кэша после импорта; при необходимости уменьшить TTL или делать инвалидацию по событию.

### 6.3 Высота 2301–2500 / 2501–3000

- В model-options и в price-engine высоты 2350 и 2750 при фильтрации маппятся в 2000. В product-match (экспорт) такого маппинга нет — сравнение по фактическим Высота/мм. Если в БД у товаров для «высоких» полотен указана высота 2000, совпадение будет; если 2350/2750 — нужно добавить ту же логику в product-match или хранить в корзине нормализованную высоту.

### 6.4 Ручки: категория «Ручки и завертки»

- В price/doors при наличии handle загружаются категории ['Ручки', 'Ручки и завертки']. В lib/catalog/product-match findHandleById учитывает обе категории — расхождение устранено.

---

## 7. Краткая схема потока данных

```
БД (Product, PropertyPhoto)
  → GET complete-data (кэш 30 мин)
  → useConfiguratorData / useModelDetails
  → Модели, покрытия (coatings), опции

Выбор пользователя (модель, покрытие, размеры, ручка, опции)
  → getCoatingForCart() → finish, color (из БД)
  → calculatePrice({ door_model_id, finish, color, width, height, ... })
  → POST /api/price/doors → filterProducts → Цена РРЦ + надбавки

Добавление в корзину
  → item: model (modelKey), finish, color, width, height, handleId, optionIds, architraveNames, ...
  → cart_data при создании заказа/документа

Экспорт Excel
  → items из cart_data
  → getMatchingProducts(item) (product-match) — строгое совпадение с БД
  → Название модели, Цена опт, Цена РРЦ, Поставщик, наличники (названия) из БД/item
```

---

## 8. Связанные документы

- **CALCULATOR_FULL_AUDIT.md** — детали движка расчёта цены (filterProducts, надбавки, breakdown).
- **EXCEL_EXPORT_FULL_ANALYSIS.md** — сценарии отсутствия совпадения в экспорте, имена полей БД.
- **EXCEL_EXPORT_MATCH_AND_FIELDS.md** — поля для экспорта, сценарии fallback.
- **lib/catalog/product-match.ts** — единый модуль поиска товара по конфигурации для экспорта.
