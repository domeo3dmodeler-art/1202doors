# Аудит: корзина, экспорт документов и дедупликация

## 1. Структура корзины

### 1.1 Типы позиций (CartItem, `components/doors/types.ts`)

- **CartItemType:** `'door' | 'handle' | 'backplate' | 'limiter'`
- **door** — полная конфигурация двери (модель, размеры, покрытие, ручка, комплект, наличники, ограничитель, зеркало, порог и т.д.), одна строка на «комплект».
- **handle** — ручка отдельной строкой (с ценой).
- **backplate** — завертка отдельной строкой (при «Да» в блоке ЗАВЕРТКА).
- **limiter** — ограничитель отдельной строкой.

### 1.2 Формирование позиций при добавлении в корзину (`app/doors/page.tsx`, `addToCart`)

- Из расчёта цены берутся слагаемые: дверь (total − ручка − завертка − ограничитель), ручка, завертка, ограничитель.
- В корзину добавляются массивом:
  - 1× door (id: `door-${modelId}-${ts}`)
  - 1× handle (если выбрана ручка)
  - 1× backplate (если выбрана завертка)
  - 1× limiter (если выбран ограничитель)
- В каждой позиции хранятся: `id`, `itemType`, `model`, `style`, `width`, `height`, `color`, `unitPrice`, `qty`, `handleId`/`handleName`, `limiterId`/`limiterName`, `hardwareKitId`, `coatingId`, `edgeId`, `optionIds`, `reversible`, `mirror`, `threshold`, `sku_1c` и др.

---

## 2. Генерация документов (экспорт из корзины)

### 2.1 Вызов API (`app/doors/page.tsx`, `generateDocument`)

- **Endpoint:** `POST /api/documents/generate`
- **Тело:** `{ type: 'quote' | 'invoice' | 'order', clientId, items, totalAmount }`
- **items** формируются как:
  ```js
  cart.map(item => ({
    id, model, style, color, width, height, qty, unitPrice,
    sku_1c, handleId, limiterId, coatingId, edgeId, optionIds,
    hardwareKitId, reversible, mirror, threshold
  }))
  ```

**Проблема:** в `items` **не передаётся** `type` / `itemType`. В API приходит объект без поля `type`, поэтому в `app/api/documents/generate/route.ts` везде `item.type === 'door'` и `item.type === 'handle'` дают `false`. В результате:
- в PDF не различаются позиции «дверь» и «ручка/завертка» при поиске SKU в БД;
- `buildProductName(item)` опирается на `item.handleId` (для ручки/завертки), но логика по `item.type` не срабатывает.

### 2.2 Обработка в API (`app/api/documents/generate/route.ts`)

- **cart_session_id:** считается от хэша `{ clientId, items: items.map(i => ({ id, type, model, qty, unitPrice })), totalAmount }`. Поле `type` в payload не приходит → в хэше `type` всегда `undefined` → один и тот же состав корзины может дать другой `cart_session_id` при разных заказах.
- **Дедупликация:** вызывается `findExistingDocument(type, null, cartSessionId, clientId, items, totalAmount)` (импорт из `@/lib/export/puppeteer-generator`, там — из `@/lib/documents/deduplication`).
- **Сохранение:** для нового Quote/Invoice/Order в БД пишется `cart_data: JSON.stringify(items)` (те же `items` без `type`).
- **PDF (КП/Счёт):** таблица по `items`; для SKU используется `item.type === 'door'` / `item.type === 'handle'` — из-за отсутствия `type` ветки не работают.
- **Excel (Заказ):** обогащение позиций из БД по конфигурации двери (по `sku_1c` или по стиль/модель/покрытие/цвет/размеры); для ручек/заверток/ограничителей отдельной логики по типу нет — все позиции обрабатываются как «дверь» при поиске товара.

### 2.3 Экспорт по ID документа (`app/api/documents/[id]/export/route.ts`)

- Определяется тип документа (Invoice / Quote / Order) по таблице.
- Данные для экспорта:
  - если есть дочерние позиции (`quote_items` / `invoice_items` / `order_items`) — строки строятся из них (id, name из notes, quantity, unitPrice, total);
  - иначе берётся `cart_data` (JSON), массив — как есть, иначе `parsed.items`.
- Для Order при отсутствии `cart_data` может использоваться `invoice.cart_data`. Формат экспорта (PDF/Excel) далее генерируется по этому набору строк.

---

## 3. Система дедупликации

### 3.1 Серверная логика (`lib/documents/deduplication.ts`)

- **findExistingOrder:** поиск Order по `cart_session_id` + `client_id` + совпадение суммы; при совпадении — проверка идентичности состава через `compareCartContent(items, order.cart_data)`. Если по session не нашли — перебор последних заказов по клиенту и сумме и сравнение через `compareCartContent`.
- **findExistingDocument** (Quote/Invoice/SupplierOrder): сначала строгий поиск по `parent_document_id`, `cart_session_id`, `client_id`, `total_amount`; при нахождении — проверка `compareCartContent`. Если не нашли — выбор кандидатов по клиенту и сумме (диапазон ±0.01), затем сравнение содержимого через `compareCartContent`.

### 3.2 Нормализация и сравнение (`lib/documents/deduplication-client.ts`)

- **normalizeItems(items):**
  - для каждой позиции строится объект с полями: `type`, `style`, `model`, `finish`, `color`, `width`, `height`, `quantity`, `unitPrice`, `hardwareKitId`, `handleId`, `sku_1c`.
  - **type:** берётся `item.type` или по умолчанию `'door'`; если `item.type === 'handle'` или есть `item.handleId`, позиция обрабатывается как ручка.
  - **Для «ручки»** в нормализованном объекте остаются только: `type: 'handle'`, `handleId`, `quantity`, `unitPrice`. Остальные поля не участвуют в сравнении.
  - Остальные позиции (двери и всё, что не помечено как ручка) сравниваются по полному набору полей (включая `style`, `model`, `finish`, `color`, `width`, `height`, `hardwareKitId`, `handleId`, `quantity`, `unitPrice`).
  - Массив сортируется по ключу `type:model:finish:color:width:height:hardwareKitId` (для ручки — по handleId).

- **compareCartContent(items1, items2String):**
  - парсит `cart_data` (массив или `{ items }`);
  - нормализует оба набора через `normalizeItems`;
  - сравнивает длину и побайтово пары элементов; для типа `handle` сравниваются только `type`, `handleId`, `quantity`, `unitPrice` (с допуском 0.01 по цене).

### 3.3 Проблемы дедупликации

1. **Ручка и завертка (backplate)**  
   В корзине есть и `handle`, и `backplate` (обе с `handleId`). В `normalizeItems` любая позиция с `handleId` приводится к `type: 'handle'` и сравнивается только по `handleId`, `quantity`, `unitPrice`. Различие «ручка» vs «завертка» теряется: две корзины с одной ручкой и одной заверткой могут сравниться с корзиной из двух ручек с тем же handleId и теми же ценами (если сумма совпадёт).

2. **Ограничитель (limiter)**  
   Позиции с `itemType: 'limiter'` не имеют `handleId`, в нормализации получают `type: 'door'` и сравниваются по `style`, `model`, `finish`, `color`, `width`, `height`, `hardwareKitId`, `handleId`. У ограничителя обычно заданы только `limiterId`, `unitPrice`, `qty` — остальные поля пустые. В итоге разные ограничители могут нормализоваться в одинаковый «пустой» door-объект и считаться одинаковыми, либо порядок/количество позиций разойдётся и дедупликация даст ложный отрицательный результат.

3. **Отсутствие `type` в payload**  
   Так как фронт не передаёт `type`/`itemType`, в сохранённом `cart_data` и в переданных в дедупликацию `items` поле `type` отсутствует. Нормализация использует `item.type || 'door'` и `item.handleId` для определения ручки. Поэтому:
   - все позиции с `handleId` (ручка и завертка) сливаются в один тип «handle»;
   - позиции без `handleId` (дверь и ограничитель) считаются «door», что для ограничителя некорректно.

---

## 4. Рекомендации

### 4.1 Генерация документов

- В `app/doors/page.tsx` в `generateDocument` при формировании `items` передавать тип позиции, например:
  - `type: item.itemType || (item.handleId && !item.limiterId ? 'handle' : item.limiterId ? 'limiter' : 'door')`
  - или явно: `type: item.itemType === 'backplate' ? 'backplate' : item.itemType === 'limiter' ? 'limiter' : item.itemType === 'handle' ? 'handle' : 'door'`.
- В API в `buildProductName` и при выборе SKU учитывать `item.type`: door / handle / backplate / limiter, чтобы в PDF/Excel корректно подставлялись названия и артикулы для ручек, заверток и ограничителей.
- При расчёте `cart_session_id` включать в хэш нормализованное содержимое корзины (в том числе `type`), чтобы один и тот же состав давал один и тот же session_id.

### 4.2 Дедупликация

- В **normalizeItems** явно учитывать тип позиции:
  - если в payload есть `item.type` или `item.itemType`, использовать его;
  - для `backplate` хранить отдельный нормализованный вид (например, `type: 'backplate'`, `handleId`, `quantity`, `unitPrice`), чтобы не смешивать с `handle`;
  - для `limiter` хранить `type: 'limiter'`, `limiterId`, `quantity`, `unitPrice` (и при необходимости имя), не нормализовать ограничитель как дверь.
- В **compareCartContent** при сравнении пар учитывать новый тип: для `backplate` и `limiter` сравнивать только соответствующие поля (как сейчас для `handle`), чтобы разные типы позиций не считались совпадающими.

### 4.3 Хранение cart_data

- Сохранять в `cart_data` полный состав, включая `type` (или `itemType`), чтобы при экспорте по ID и при повторной дедупликации не терялась семантика позиций (дверь / ручка / завертка / ограничитель).

---

## 5. Сводка по файлам

| Участок | Файл | Замечание |
|--------|------|-----------|
| Типы корзины | `components/doors/types.ts` | CartItemType, CartItem с itemType |
| Добавление в корзину | `app/doors/page.tsx` (addToCart) | Формирует door, handle, backplate, limiter |
| Вызов генерации | `app/doors/page.tsx` (generateDocument) | Не передаёт type/itemType в items |
| Проверка существующего заказа | `components/doors/CartManager.tsx` | Строит type из item.type \|\| (handleId ? 'handle' : 'door') для compareCartContent |
| Генерация документа | `app/api/documents/generate/route.ts` | cart_data без type; buildProductName/SKU по item.type не работают |
| Дедупликация (сервер) | `lib/documents/deduplication.ts` | findExistingOrder, findExistingDocument |
| Нормализация/сравнение | `lib/documents/deduplication-client.ts` | normalizeItems не различает handle/backplate, limiter как door |
| Экспорт по ID | `app/api/documents/[id]/export/route.ts` | Использует quote_items/invoice_items/order_items или cart_data |
| Использование дедупликации | `lib/export/puppeteer-generator.ts` | findExistingDocument, findExistingOrder для PDF/Excel |
