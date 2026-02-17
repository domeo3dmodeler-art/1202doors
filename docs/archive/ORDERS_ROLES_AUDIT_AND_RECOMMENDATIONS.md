# Аудит: заказы, роли, статусы, уведомления — итоги и рекомендации

Документ фиксирует результаты проверки системы заказов и ролей, внесённые исправления и рекомендуемые сценарии.

---

## 1. Внесённые исправления (код)

### 1.1 POST /api/supplier-orders

- **Проблема:** В создании SupplierOrder передавались `executor_id: order.client_id` (ID клиента вместо исполнителя) и несуществующее в схеме поле `created_by`.
- **Исправление:** `executor_id` устанавливается в `user.userId` (кто создал заказ у поставщика). Поле `created_by` убрано; для опциональных полей используется `null` вместо пустых строк где уместно.

### 1.2 Статистика исполнителя /api/executor/stats

- **Проблема:** Для заказов поставщика использовались несуществующие поля и статусы: `created_by`, статусы `DRAFT`, `SENT`, `ORDER_PLACED`, `RECEIVED`.
- **Исправление:** Фильтр по `executor_id: user.userId`. Статусы приведены к схеме: в работе — `PENDING`, `ORDERED`, `RECEIVED_FROM_SUPPLIER`; завершённые — `COMPLETED`.

### 1.3 document.repository createSupplierOrder

- **Проблема:** В репозитории передавались поля, отсутствующие в схеме (`created_by`, `subtotal`, `tax_amount`), статус `DRAFT` вместо `PENDING`, и вызывался `prisma.supplierOrderItem.createMany` при отсутствии модели SupplierOrderItem.
- **Исправление:** Создание SupplierOrder только с полями из схемы: `executor_id: data.created_by`, `supplier_name: 'Поставщик не указан'`, `status: 'PENDING'`, состав в `cart_data`. Вызов createMany для элементов заказа удалён.

### 1.4 Типы и статистика менеджера

- В тип `OrderStatus` добавлен статус `PAID` (используется в фильтрах и отображении).
- В статистике менеджера «оплаченные» заказы считаются по `status in ['PAID', 'NEW_PLANNED']`.

---

## 2. Рекомендуемые сценарии использования

### 2.1 Создание заказа из корзины (основной поток)

1. Комплектатор формирует корзину и выбирает клиента.
2. **POST /api/orders** с `client_id`, `items`, опционально `executor_id`, `lead_number`.
3. Система создаёт Order со статусом **DRAFT** и при необходимости Invoice (через document service).
4. Уведомления: комплектатор (создатель), все активные менеджеры.
5. Дальнейшие шаги: DRAFT → SENT (счёт выставлен) → NEW_PLANNED (оплачен / в работу).

Рекомендация: не использовать устаревший **POST /api/orders/create-with-invoice** (создаёт заказ сразу в NEW_PLANNED, без этапа DRAFT).

### 2.2 Переход заказа к исполнителю

1. Комплектатор переводит заказ в **SENT**, затем в **NEW_PLANNED** (или сразу в NEW_PLANNED при оплате).
2. Назначается **executor_id** (вручную в карточке заказа или при смене статуса), иначе уведомления исполнителю не уйдут.
3. Исполнитель видит заказ в списке (фильтр по статусам NEW_PLANNED и далее) и получает in-app уведомление.

Рекомендация: всегда заполнять `executor_id` до перевода в NEW_PLANNED или сразу после, чтобы исполнитель получал уведомления.

### 2.3 Возврат в комплектацию

1. Исполнитель переводит заказ в **RETURNED_TO_COMPLECTATION**, при смене статуса можно передать **notes** (причина возврата).
2. Уведомление уходит комплектатору (создателю заказа), в сообщение подставляется причина из notes.
3. Комплектатор переводит заказ обратно в **DRAFT**, **SENT** или **NEW_PLANNED** и дорабатывает.

Рекомендация: в UI при возврате показывать обязательное или рекомендуемое поле «Причина возврата» и передавать его в `notes`.

### 2.4 Заказ у поставщика

1. Создание только через **POST /api/supplier-orders** с `orderId`, `supplierName` и при необходимости контактами, датой, составом.
2. В БД сохраняется **executor_id** = текущий пользователь (исполнитель).
3. Статусы: **PENDING** → **ORDERED** → **RECEIVED_FROM_SUPPLIER** → **COMPLETED** (или **CANCELLED**). Менять может только admin или executor.
4. Уведомления по смене статуса — по конфигу в `lib/notifications/status-notifications.ts` (complectator, executor).

Рекомендация: не создавать SupplierOrder через общий document service / create-batch без доработки (нет передачи supplier_name и т.д.); основной сценарий — форма по заказу с выбором поставщика.

### 2.5 Руководитель (manager)

- Просмотр всех заказов и статистики, получение уведомлений при **COMPLETED**.
- Смена статусов заказов и заказов поставщика недоступна (только просмотр).

Рекомендация: в дашборде руководителя явно показывать «только просмотр» и не показывать кнопки смены статуса.

---

## 3. Что проверить и доработать (без изменений в этой задаче)

### 3.1 Документация

- **docs/SYSTEM_RULES_AND_PERMISSIONS.md** — устаревшие статусы Order (CONFIRMED, IN_PRODUCTION, READY). Привести к актуальным: DRAFT, SENT, NEW_PLANNED, UNDER_REVIEW, AWAITING_MEASUREMENT, AWAITING_INVOICE, READY_FOR_PRODUCTION, COMPLETED, RETURNED_TO_COMPLECTATION, CANCELLED.
- Там же — актуальные правила переходов и ролей из `lib/auth/permissions.ts` и `lib/validation/status-transitions.ts`.

### 3.2 Схема Prisma Order

- В `schema.prisma` у Order указан `@default("NEW_PLANNED")`, но новый заказ из корзины создаётся репозиторием со статусом **DRAFT**. Оставить как есть (явная установка DRAFT в коде приоритетнее) или поменять default на DRAFT для единообразия.

### 3.3 Уведомления

- Клиент в конфиге указан как получатель (например, для Invoice SENT), но логика не отправляет ему in-app (клиенты не в системе). При появлении email/SMS — добавить канал для клиента.
- Дубликаты: окно 5 минут и проверка по type/title — при необходимости сузить или расширить критерии.

### 3.4 Требования к переходу в READY_FOR_PRODUCTION / COMPLETED

- В `status-requirements.ts` заложена проверка project_file_url и door_dimensions; для READY_FOR_PRODUCTION в комментарии упомянуты оптовые счета/техзадания, но явной проверки wholesale_invoices/technical_specs нет. При необходимости добавить проверку «хотя бы один из документов загружен».

### 3.5 Роль executor в middleware

- **requireAuthAndPermission(handler, 'executor')** проверяет роль по строке. Убедиться, что во всех вызовах передаётся именно роль (например `'executor'`), а не permission, и что значение совпадает с полем `role` в БД (регистр: в запросах к User используется и верхний, и нижний регистр).

---

## 4. Краткая сводка по ролям и статусам

| Роль           | Создание Order | Смена статуса Order (зона) | Создание/смена SupplierOrder | Уведомления |
|----------------|----------------|----------------------------|------------------------------|-------------|
| admin          | да             | все переходы               | да                           | —           |
| complectator   | да             | DRAFT ↔ SENT ↔ NEW_PLANNED, RETURNED_* → DRAFT/SENT/NEW_PLANNED | нет                          | по созданию и смене статуса (если complectator_id задан) |
| executor       | нет            | NEW_PLANNED … COMPLETED, возврат в комплектацию | создание и смена статуса      | если executor_id задан |
| manager        | нет            | нет                        | нет                          | при COMPLETED |

Статусы Order (кратко): **DRAFT** → **SENT** → **NEW_PLANNED** → **UNDER_REVIEW** → **AWAITING_MEASUREMENT** / **AWAITING_INVOICE** → **READY_FOR_PRODUCTION** → **COMPLETED**. Из многих статусов возможны **CANCELLED** и **RETURNED_TO_COMPLECTATION** (возврат комплектатору).

---

## 5. Файлы для справки

- Роли и права: `lib/auth/roles.ts`, `lib/auth/permissions.ts`
- Переходы статусов: `lib/validation/status-transitions.ts`
- Требования к полям при переходах: `lib/validation/status-requirements.ts`
- Подписи статусов и отображение: `lib/utils/document-statuses.ts`, `lib/utils/order-status-display.ts`
- Уведомления при смене статуса: `lib/notifications/status-notifications.ts`, `lib/notifications.ts`
- API заказов: `app/api/orders/route.ts`, `app/api/orders/[id]/status/route.ts`
- API заказов поставщика: `app/api/supplier-orders/route.ts`, `app/api/supplier-orders/[id]/status/route.ts`
