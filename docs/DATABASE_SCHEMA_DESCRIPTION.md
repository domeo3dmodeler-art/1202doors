# Полная структура БД приложения 1002doors

Документ для архитектурного аудита и интеграции с PIM3. СУБД: **PostgreSQL**. ORM: **Prisma**.

---

## Оглавление

1. [Расположение артефактов](#расположение-артефактов)
2. [ENUM-типы](#enum-типы)
3. [Назначение таблиц](#назначение-таблиц)
4. [Связи между таблицами](#связи-между-таблицами)
5. [Получение pg_dump --schema-only](#получение-pg_dump---schema-only)
6. [Файл схемы Prisma](#файл-схемы-prisma)

---

## Расположение артефактов

| Артефакт | Путь |
|----------|------|
| Полный DDL (CREATE TABLE, PK, FK, UNIQUE, INDEX) | `docs/DATABASE_SCHEMA_FULL_DDL.sql` |
| Описание таблиц и связей | `docs/DATABASE_SCHEMA_DESCRIPTION.md` (этот файл) |
| Схема ORM | `prisma/schema.prisma` |
| Миграции | `prisma/migrations/` |

---

## ENUM-типы

В миграции `20250115000000_init_postgresql` созданы следующие ENUM (в приложении через Prisma используются как `TEXT`):

| ENUM | Значения |
|------|----------|
| `UserRole` | `'admin'`, `'complectator'`, `'executor'` |
| `DocumentStatus` | `'DRAFT'`, `'SENT'`, `'PAID'`, `'CANCELLED'` |
| `OrderStatus` | `'PENDING'`, `'PROCESSING'`, `'SHIPPED'`, `'DELIVERED'`, `'CANCELLED'` |
| `InvoiceStatus` | `'DRAFT'`, `'SENT'`, `'PAID'`, `'OVERDUE'`, `'CANCELLED'` |
| `ImportStatus` | `'pending'`, `'processing'`, `'completed'`, `'failed'` |

---

## Назначение таблиц

### Пользователи и клиенты

| Таблица | Назначение |
|---------|------------|
| **users** | Пользователи системы (админ, комплектатор, исполнитель). Аутентификация, роль, активность, последний вход. |
| **clients** | Клиенты/заказчики: ФИО, контакты, адрес, `objectId` объекта, номер лида комплектации, произвольные поля (JSON). |

### Каталог и товары

| Таблица | Назначение |
|---------|------------|
| **catalog_categories** | Иерархия категорий каталога (дерево по `parent_id`, `path`, `level`). Счётчик товаров, сортировка. |
| **product_properties** | Справочник свойств товаров: имя, тип, опции, обязательность. Используются для разных категорий через привязки. |
| **category_property_assignments** | Привязка свойств к категориям каталога: какие свойства у категории, для калькулятора/экспорта, порядок. |
| **products** | Товары: SKU (уникальный), категория, название, описание, бренд/модель/серия, цена, остаток, габариты, спецификации, **properties_data** (JSON), теги, активность, признак «избранное». Ключевая сущность для PIM. |
| **product_images** | Изображения товаров: файл, URL, размеры, MIME, главное фото, порядок. Связь с `products`. |

### Импорт и экспорт каталога

| Таблица | Назначение |
|---------|------------|
| **import_templates** | Шаблоны импорта по категории каталога: обязательные/калькулятор/экспорт поля, маппинг, валидация (JSON). Один шаблон на категорию. |
| **import_history** | История импортов: файл, категория, шаблон, кол-во импортированных/ошибок, статус, ошибки (JSON). |
| **export_settings** | Настройки экспорта по категории и типу экспорта: поля, отображение (JSON). Уникальность по (категория, тип экспорта). |

### Фронт и конструктор

| Таблица | Назначение |
|---------|------------|
| **frontend_categories** | Категории для фронта: имя, slug, иконка, привязка к ID категорий каталога (JSON), настройки отображения, маппинг свойств и фото (JSON). |
| **constructor_configs** | Глобальные конфигурации конструктора (JSON). |
| **constructor_configurations** | Конфигурации конструктора по категории (categoryId, JSON). |

### Документы (универсальные и типизированные)

| Таблица | Назначение |
|---------|------------|
| **documents** | Универсальные документы: тип (quote/invoice/order), статус, содержимое и доп. данные (JSON), привязка к клиенту. |
| **quotes** | КП (коммерческие предложения): номер, клиент, создатель, статус, суммы, валюта, срок действия. Поля для дедубликации: `parent_document_id`, `cart_session_id`, `cart_data`. |
| **quote_items** | Строки КП: товар, количество, цена, сумма. |
| **orders** | Заказы: номер, клиент, счёт (invoice_id), лид, комплектатор/исполнитель, статус (NEW_PLANNED и др.), проект/замер, размеры дверей (JSON), оптовые счета/техзадания (JSON), проверка, дедубликация (parent_document_id, cart_session_id, cart_data). |
| **invoices** | Счета: номер, заказ (order_id, один к одному), клиент, создатель, даты, суммы. Аналогично — parent_document_id, cart_session_id, cart_data. |
| **invoice_items** | Строки счёта: товар, количество, цена, сумма. |
| **supplier_orders** | Заказы поставщику: исполнитель, поставщик, статус, даты, parent_document_id, cart_session_id, cart_data, total_amount. |

### Работа с документами и уведомления

| Таблица | Назначение |
|---------|------------|
| **document_comments** | Комментарии к документам (по document_id, без FK на таблицы документов — универсальный ID). Связь с пользователем. |
| **document_history** | История изменений документов: document_id, пользователь, действие, old_value/new_value, details (JSON). |
| **document_templates** | Шаблоны документов (тип, JSON template_data, создатель). В миграции есть, в текущем Prisma-схеме модели нет. |
| **notifications** | Уведомления пользователям: тип, заголовок, текст, прочитано. Опционально — клиент, документ. |

### Контент и настройки

| Таблица | Назначение |
|---------|------------|
| **pages** | Страницы (page builder): заголовок, описание, url (уникальный), признак публикации. |
| **page_elements** | Элементы страницы: тип, props/position/size (JSON), zIndex, родитель, привязка к странице. |
| **system_settings** | Системные настройки «ключ — значение» (уникальный key). |

### Фото по свойствам (калькулятор/конфигуратор)

| Таблица | Назначение |
|---------|------------|
| **property_photos** | Фото, привязанные к значению свойства в рамках категории: categoryId, propertyName, propertyValue, photoType (cover, gallery_1, …), путь, размер, MIME. Уникальность по (categoryId, propertyName, propertyValue, photoType). Важно для PIM/визуализации вариантов. |

---

## Связи между таблицами

### Граф зависимостей (родитель → дочерние)

```
users
  ├── document_comments (user_id)
  ├── document_history (user_id)
  └── notifications (user_id)

clients
  ├── documents (clientId)
  ├── quotes (client_id)
  ├── invoices (client_id)
  ├── orders (client_id)
  └── notifications (client_id, опционально)

catalog_categories
  ├── catalog_categories (parent_id, самореференс)
  ├── category_property_assignments (catalog_category_id)
  ├── import_templates (catalog_category_id)
  ├── export_settings (catalog_category_id)
  └── products (catalog_category_id)

product_properties
  └── category_property_assignments (product_property_id)

products
  └── product_images (product_id)

import_templates
  └── import_history (template_id, опционально)

quotes
  └── quote_items (quote_id)

orders
  └── (связь 1:1 с invoices: orders.invoice_id ↔ invoices.order_id)

invoices
  ├── invoice_items (invoice_id)
  └── orders (order_id, опционально)

pages
  └── page_elements (pageId)
```

### Ключевые связи для PIM3

- **Товары**: `products` — центральная сущность; категория `catalog_categories`; атрибуты в `properties_data` (JSON) и при необходимости в `product_properties` + `category_property_assignments`.
- **Изображения товаров**: `product_images` → `products`.
- **Фото по свойствам (варианты)**: `property_photos` по (categoryId, propertyName, propertyValue, photoType) — без FK на таблицу категорий в текущей схеме (categoryId — текстовый ID категории).

### Связь заказ ↔ счёт (1:1)

- `orders.invoice_id` → `invoices.id`
- `invoices.order_id` → `orders.id`  
Один заказ — один счёт; связь двусторонняя.

---

## Получение pg_dump --schema-only

Чтобы получить актуальный дамп только схемы из реальной БД PostgreSQL:

```bash
# Windows (PowerShell), подставьте свои хост, порт, пользователь и БД
$env:PGPASSWORD = "your_password"
pg_dump -h localhost -p 5432 -U postgres -d your_database_name --schema-only --no-owner --no-privileges -f docs/pg_dump_schema_only.sql
```

Или из `DATABASE_URL`:

```bash
# Если DATABASE_URL в .env
pg_dump "$env:DATABASE_URL" --schema-only --no-owner --no-privileges -f docs/pg_dump_schema_only.sql
```

Результат: файл со всеми CREATE TABLE, индексами, FK, ENUM и т.д. по текущему состоянию БД (в т.ч. если миграции применялись не по порядку или были ручные изменения).

---

## Файл схемы Prisma

Полная схема ORM находится в файле:

**`prisma/schema.prisma`**

Он содержит все модели (таблицы), поля, связи, индексы и уникальные ограничения. Для интеграции с PIM3 и аудита используйте:

- **Полный DDL**: `docs/DATABASE_SCHEMA_FULL_DDL.sql` — воспроизводимая схема «как задумано» по Prisma и миграциям.
- **Реальное состояние БД**: `pg_dump --schema-only` (команда выше) — если нужно сравнить с фактической базой.

---

## Замечания по расхождениям

1. **document_history**  
   В миграции `20250120000000_enhance_document_relationships` в таблице есть поля `document_type` и `notes`. В текущем `schema.prisma` у модели `DocumentHistory` используются поля `document_id`, `details` (вместо части notes) и нет `document_type`. DDL в `DATABASE_SCHEMA_FULL_DDL.sql` приведён к текущей Prisma-модели; в реальной БД могут быть колонки из старой миграции.

2. **document_templates**  
   Таблица создаётся в миграции; в основном `schema.prisma` модели нет. В полном DDL таблица включена для полноты и аудита.

3. **Доп. таблицы из sql/**  
   В `sql/database_optimization.sql` описаны таблицы для кэша и мониторинга (`performance_stats`, `query_cache`, `product_stats_cache`, `product_property_values`, `slow_query_log`) и триггеры в стиле SQLite. Они не входят в основной Prisma-схему и в `DATABASE_SCHEMA_FULL_DDL.sql` не добавлены. При необходимости их можно внедрить отдельной миграцией под PostgreSQL.

Если нужен отдельный файл только с перечислением всех таблиц и колонок в виде таблицы (для PIM3), его можно сгенерировать дополнительно.
