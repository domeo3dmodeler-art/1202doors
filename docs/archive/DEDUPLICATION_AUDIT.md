# Полный аудит системы дедубликации заказов и документов

## 1. Цель и границы

**Цель:** не создавать повторные документы при повторных действиях (двойной клик, повторная отправка формы, одна и та же корзина для нескольких типов документов).

**Где работает дедубликация:**
- Создание **Order** (POST /api/orders, documentService, export)
- Создание **Quote**, **Invoice**, **SupplierOrder** через documentService и create-batch
- Генерация документов (documents/generate, puppeteer-generator)
- Группировка «родственных» документов по `cart_session_id` (siblings API)

**Где не используется:** удаление, смена статуса, редактирование — только создание документов.

---

## 2. Ключевые сущности

### 2.1 cart_session_id

- **Назначение:** один идентификатор сессии корзины на один «пакет» действий пользователя (одна корзина → один заказ, один счёт и т.д.).
- **Генерация:** `lib/utils/cart-session.ts` — `generateCartSessionId()` → `cart_${Date.now()}_${random}`.
- **Передача:** клиент может передать `cart_session_id` в теле запроса (например, из состояния корзины). Если не передан — генерируется на сервере при каждом вызове.
- **Важно:** если фронт при «Создать заказ» и «Создать счёт» не передаёт один и тот же `cart_session_id`, дедубликация между заказом и счётом по сессии не сработает (сработает только по совпадению клиента, суммы и содержимого корзины).

### 2.2 parent_document_id

- **Order:** всегда `null` (заказ из корзины — корневой документ).
- **Invoice:** нередко `null` при создании «просто счёта»; при привязке к заказу может использоваться связь через `order_id` в схеме. В дедубликации для Invoice используется `parent_document_id`.
- **Quote:** `null` или ID родительского документа при создании из другого документа.
- **SupplierOrder:** `parent_document_id = orderId` (заказ, для которого создаётся заказ поставщика).

### 2.3 cart_data и total_amount

- В БД хранятся `cart_data` (JSON строка состава) и `total_amount`.
- Дедубликация: сначала отбор по `cart_session_id` / `parent_document_id` / `client_id` / `total_amount`, затем проверка равенства состава через `compareCartContent(items, cart_data)`.

---

## 3. Реализация по слоям

### 3.1 Сравнение содержимого корзины

**Файл:** `lib/documents/deduplication-client.ts`

- **normalizeItems(items)** — приводит позиции к единому виду (тип door/handle/limiter, поля model, finish, color, width, height, quantity, unitPrice и т.д.), сортирует по ключу.
- **compareCartContent(items1, items2String)** — парсит `cart_data` (массив или `{ items }`), нормализует оба набора, сравнивает покомпонентно. Цены сравниваются с допуском ±0.01.

**Ограничения:**
- Не учитываются поля, не входящие в нормализацию (например, произвольные метаданные). Если в корзине есть такие поля и они влияют на «уникальность» заказа, дубликат не будет распознан.
- Формат хранения в `cart_data` в разных местах может отличаться (массив vs `{ items: [] }`) — парсер это учитывает.

### 3.2 Поиск существующего Order

**Файл:** `lib/documents/deduplication.ts` — `findExistingOrder(parentDocumentId, cartSessionId, clientId, items, totalAmount)`

- **Этап 1 (если передан cart_session_id):** поиск Order с `parent_document_id: null`, `cart_session_id`, `client_id`, `total_amount` в диапазоне ±0.01. Если найден и `compareCartContent` совпадает — возврат.
- **Этап 2:** поиск по `parent_document_id: null`, `client_id`, `total_amount` ±0.01, лимит 20 записей, сортировка по `created_at desc`. По очереди проверяется `compareCartContent` с каждым кандидатом.

Итог: дубликат определяется по одному и тому же клиенту, сумме и составу корзины; при наличии общего `cart_session_id` дубликат находится быстрее.

### 3.3 Поиск существующего документа (Quote, Invoice, SupplierOrder)

**Файл:** `lib/documents/deduplication.ts` — `findExistingDocument(type, parentDocumentId, cartSessionId, clientId, items, totalAmount)`

- Сигнатура: тип только `'quote' | 'invoice' | 'supplier_order'`. Тип **order не обрабатывается** в этой функции.
- **Этап 1:** строгий поиск по `parent_document_id`, `cart_session_id`, `client_id`, `total_amount`. Для Quote и Invoice используется **точное** равенство `total_amount` (без допуска ±0.01). Для SupplierOrder — допуск ±0.01. Если найден документ и `compareCartContent` совпадает — возврат.
- **Этап 2:** поиск кандидатов по `client_id`, `parent_document_id`, `total_amount` с допуском ±0.01 (Quote/Invoice), для SupplierOrder — без `client_id`. Перебор кандидатов и проверка `compareCartContent`.

**Несогласованность:** для Quote и Invoice на этапе 1 используется точное `total_amount`. При округлении или разнице в расчётах (Float) возможны ложные «не дубликаты». Рекомендация: для Quote и Invoice на этапе 1 тоже использовать диапазон ±0.01.

### 3.4 DocumentService

**Файл:** `lib/services/document.service.ts`

- При создании документа вызывается внутренний `findExistingDocument(type, ...)`, который для `type === 'order'` вызывает **findExistingOrder**, для остальных — **findExistingDocument** из deduplication.
- Используется общий `finalCartSessionId = cart_session_id || generateCartSessionId()`.
- Если `prevent_duplicates === true` и найден существующий документ — возвращается он (id, number, isNew: false), запись в БД не создаётся.
- При создании нового документа в запись всегда пишется `cart_session_id: finalCartSessionId` и сохраняются items в виде, принятом в репозитории (для Order — в `cart_data`).

Дедубликация для Order в основном потоке (POST /api/orders) полностью идёт через DocumentService и `findExistingOrder`.

### 3.5 POST /api/orders

- В запрос передаётся `cart_session_id` (опционально), `client_id`, `items`, и т.д.
- Вызывается `documentService.createDocument({ type: 'order', ... })` с `prevent_duplicates: true`.
- Один и тот же `cart_session_id` + клиент + сумма + состав → возврат существующего заказа и флаг `isNew: false`.

### 3.6 POST /api/documents/create-batch

- Принимает `cart_session_id`, `client_id`, `items`, `total_amount`, `document_types` (массив, например `['quote', 'invoice']`).
- Для **каждого** типа из `document_types` сначала вызывается **findExistingDocument** из `lib/documents/deduplication.ts` (не documentService). Для типа `'order'` эта функция не умеет искать Order и всегда возвращает `null`.
- Если существующий не найден — вызывается `documentService.createDocument(type, ...)`. Для Order documentService внутри вызывает `findExistingOrder`, так что дубликат Order в create-batch всё равно будет найден при втором проходе по тому же запросу (если бы создавали два раза order в одном batch — не создаём; но при одном вызове batch для order создаётся один раз, и при повторном вызове batch findExistingDocument('order') даёт null, а documentService.createDocument('order') уже находит существующий заказ). Итог: дубликаты Order в create-batch не создаются, но логика избыточна и вводящая в заблуждение. Рекомендация: в create-batch для типа `order` не вызывать findExistingDocument из deduplication, а сразу вызывать documentService.createDocument, либо расширить findExistingDocument в deduplication на тип `order` (делегировать findExistingOrder).

### 3.7 POST /api/supplier-orders

- Создание заказа поставщика по `orderId` (и опционально старый `invoiceId`). Берётся `order.cart_session_id` или генерируется новый.
- Проверка дубликата: поиск SupplierOrder по `parent_document_id: orderId` и `cart_session_id`. Совпадение по составу корзины **не** проверяется — достаточно одного и того же Order и той же сессии. То есть дедубликация «один заказ поставщика на один Order в рамках одной сессии» реализована в самом route, а не через findExistingDocument. Если нужно считать дубликатом только совпадение по составу и сумме — текущая логика это не делает.

### 3.8 Генерация документов (documents/generate и puppeteer-generator)

- **documents/generate:** для типа документа генерируется `cartSessionId` как хеш от `clientId`, `items`, `totalAmount` (короткий base64). Вызывается **findExistingDocument** из `@/lib/export/puppeteer-generator`. В puppeteer-generator для `type === 'order'` вызывается **findExistingOrder**, для quote/invoice — **findExistingDocument** из deduplication. При нахождении существующего документа он переиспользуется. При создании нового Order в generate используется `prisma.order.create` с полями `created_by`, `status: 'PENDING'`, `subtotal`, `currency` — в текущей схеме Order этих полей **нет** (есть только `status`, `total_amount`, без `created_by`, `subtotal`, `currency`). Это приведёт к ошибке Prisma при создании Order через generate. Рекомендация: создание Order в generate делать через documentRepository.createOrder или documentService.createDocument, либо привести данные к полям текущей схемы Order и не передавать лишние поля.
- **puppeteer-generator:** использует findExistingOrder / findExistingDocument, при существующем документе переиспользует его; при создании новых записей использует свою функцию createDocumentRecordsSimple с полями под текущие модели — нужно проверить соответствие схеме Order/Invoice/Quote.

### 3.9 Siblings (документы одной «сессии»)

**Файл:** `app/api/documents/[id]/siblings/route.ts`

- По текущему документу (quote, invoice, order, supplier_order) определяется его `cart_session_id`.
- Выбираются все документы того же типа и других типов с тем же `cart_session_id`. Это не дедубликация при создании, а группировка уже созданных документов для отображения «родственных» (одна корзина → КП, счёт, заказ и т.д.).

---

## 4. Сводка по потокам создания

| Точка входа | Тип документа | Откуда дедубликация | cart_session_id |
|-------------|---------------|---------------------|------------------|
| POST /api/orders | Order | documentService → findExistingOrder | из тела или новый |
| POST /api/documents/create | любой | documentService (order → findExistingOrder, остальные → findExistingDocument) | из тела или новый |
| POST /api/documents/create-batch | quote, invoice, order, supplier_order | Сначала findExistingDocument (order не поддерживается), затем documentService | общий на batch |
| POST /api/supplier-orders | SupplierOrder | Свой поиск по parent_document_id + cart_session_id, без compareCartContent | от Order |
| POST /api/documents/generate | quote, invoice, order | findExistingDocument / findExistingOrder (через puppeteer re-export) | хеш от client+items+total |
| puppeteer-generator | quote, invoice, order | findExistingOrder / findExistingDocument | переданный или новый |

---

## 5. Выявленные риски и рекомендации

### 5.1 Критично

1. **documents/generate для type === 'order':** создание через `prisma.order.create` с полями `created_by`, `status: 'PENDING'`, `subtotal`, `currency` не соответствует текущей схеме Order (нет этих полей). Нужно создавать заказ через documentRepository.createOrder или documentService.createDocument с корректным набором полей и статусом DRAFT.
2. **Единый cart_session_id на фронте:** для сценария «создать заказ и счёт из одной корзины» клиент должен передавать один и тот же `cart_session_id` в оба запроса. Иначе дедубликация по сессии не сработает (останется только по client_id + total_amount + составу).

### 5.2 Желательно

3. **Quote/Invoice — допуск по total_amount на этапе 1:** в findExistingDocument для quote и invoice на первом этапе использовать `total_amount` в диапазоне ±0.01, как для Order и SupplierOrder, чтобы избежать ложных «не дубликатов» из-за Float.
4. **create-batch и тип order:** не вызывать findExistingDocument из deduplication для type 'order' (он всё равно возвращает null), а сразу использовать documentService.createDocument; либо в deduplication в findExistingDocument для type 'order' вызывать findExistingOrder и возвращать его результат.
5. **SupplierOrder дедубликация по составу:** сейчас в POST /api/supplier-orders дубликат определяется только по (orderId + cart_session_id). Если нужно считать дубликатом заказ поставщика с тем же составом и суммой при том же Order — добавить вызов findExistingDocument('supplier_order', orderId, cartSessionId, clientId, items, totalAmount) перед созданием (и передавать clientId из order).

### 5.3 Дополнительно

6. **Время жизни cart_session_id:** в cart-session есть `isCartSessionValid(sessionId, maxAgeMinutes)`. В логике дедубликации при создании документов возраст сессии не проверяется — «старый» cart_session_id по-прежнему связывает документы. Если нужно не считать дубликатом документ, созданный по той же корзине, но через N часов, можно учитывать возраст сессии (например, не возвращать существующий документ, если его cart_session_id старше maxAgeMinutes).
7. **Лимиты кандидатов:** Order — take 20, Quote/Invoice/SupplierOrder — take 10. При очень большом числе документов у клиента теоретически дубликат может быть за пределами лимита. При необходимости увеличить лимит или добавить приоритет по cart_session_id (сначала кандидаты с тем же cart_session_id).
8. **Атомарность и гонки:** при двух одновременных запросах с одними данными оба могут не найти существующий документ и оба создать новый. Для полного устранения дубликатов при гонках нужна блокировка или уникальный ключ (например, уникальный индекс по хешу client_id + cart_session_id + total_amount + hash(cart_data)) и обработка конфликта.

---

## 6. Файлы для правок и справки

- Логика сравнения корзины: `lib/documents/deduplication-client.ts`
- Поиск существующих Order/документов: `lib/documents/deduplication.ts`
- Использование в сервисе: `lib/services/document.service.ts`
- Генерация/проверка cart_session_id: `lib/utils/cart-session.ts`
- API: `app/api/orders/route.ts`, `app/api/documents/create-batch/route.ts`, `app/api/supplier-orders/route.ts`, `app/api/documents/generate/route.ts`
- Экспорт: `lib/export/puppeteer-generator.ts`
- Группировка по сессии: `app/api/documents/[id]/siblings/route.ts`
- Схема полей для дедубликации: `prisma/schema.prisma` (поля `cart_session_id`, `parent_document_id`, `cart_data`, `total_amount` у Quote, Invoice, Order, SupplierOrder)

---

## 7. Краткий чеклист проверки после изменений

- [ ] При повторной отправке POST /api/orders с тем же client_id, items, total и при том же cart_session_id возвращается существующий заказ (isNew: false).
- [ ] При создании Order через documentService (в т.ч. create-batch) дубликат находится по client_id + total_amount + cart_data (и при совпадении cart_session_id — быстрее).
- [ ] Quote и Invoice при одинаковых parent_document_id, cart_session_id, client_id, total_amount и составе не дублируются (после возможного введения ±0.01 для total_amount — проверить граничные случаи).
- [ ] SupplierOrder при том же orderId и том же cart_session_id не создаётся второй раз (текущее поведение).
- [ ] Siblings по cart_session_id возвращают все документы одной «сессии».
- [ ] Генерация (generate) для order не падает с ошибкой Prisma и при повторном запросе с теми же данными переиспользует существующий документ (после исправления создания Order).
