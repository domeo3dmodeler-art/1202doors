# 📚 Документация проекта Domeo

> **Статус**: Актуализировано 2026-02  
> В корне `docs/` только актуальные документы. Устаревшие перенесены в [archive/](./archive/ARCHIVE_INDEX.md).

---

## 📖 Основные документы

### 🏗️ Архитектура и инфраструктура

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** ⭐ — Архитектура приложения, модули, API
- **[AGENT_ONBOARDING.md](./AGENT_ONBOARDING.md)** ⭐ — Инфраструктура и текущее состояние (онбординг)
- **[PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)** — Структура проекта
- **[PROJECT_OVERVIEW.md](./PROJECT_OVERVIEW.md)** — Обзор проекта (технологии, API)
- **[DATABASE_STRUCTURE.md](./DATABASE_STRUCTURE.md)** — Структура БД
- **[C4_ARCHITECTURE.md](./C4_ARCHITECTURE.md)** — C4 диаграммы

### 🚀 Разработка и деплой

- **[DEVELOPMENT_WORKFLOW_COMPLETE.md](./DEVELOPMENT_WORKFLOW_COMPLETE.md)** ⭐ — Workflow доработки
- **[LOCAL_DEVELOPMENT_SETUP.md](./LOCAL_DEVELOPMENT_SETUP.md)** — Локальная настройка
- **[DEPLOY.md](./DEPLOY.md)** — Деплой (Yandex Cloud K8s)
- **[HOT_RELOAD_STAGING_SETUP.md](./HOT_RELOAD_STAGING_SETUP.md)** — Hot reload на staging
- **[LOGGING_GUIDE.md](./LOGGING_GUIDE.md)** — Логирование
- **[CURSOR_DEVELOPMENT_METHODOLOGY.md](./CURSOR_DEVELOPMENT_METHODOLOGY.md)** ⭐ — Методология Cursor
- **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** ⭐ — Быстрая справка
- **[AI_DEVELOPER_METHODOLOGY.md](./AI_DEVELOPER_METHODOLOGY.md)** ⭐ — Методология AI + бизнес

### 🏛️ Система правил и документы

- **[SYSTEM_RULES_AND_PERMISSIONS.md](./SYSTEM_RULES_AND_PERMISSIONS.md)** ⭐ — Правила, роли, документы
- **[SYSTEM_FLOW_DIAGRAM.md](./SYSTEM_FLOW_DIAGRAM.md)** — Схемы процессов
- **[DOCUMENT_LINKS_LOGIC.md](./DOCUMENT_LINKS_LOGIC.md)** — Связи документов
- **[DOCUMENT_LOGIC_COMPLETE.md](./DOCUMENT_LOGIC_COMPLETE.md)** — Логика работы с документами

### 🚪 Конфигуратор, каталог, экспорт

- **[CONFIGURATOR_FULL_AUDIT.md](./CONFIGURATOR_FULL_AUDIT.md)** ⭐ — Аудит конфигуратора: данные, цепочки, код vs название модели
- **[REMAINING_ISSUES.md](./REMAINING_ISSUES.md)** — Оставшиеся проблемы (высота в экспорте, покрытия, кэш, fallback)
- **[HEIGHT_MARKUP_FIELDS.md](./HEIGHT_MARKUP_FIELDS.md)** — Надбавки за высоту 2301–2500 / 2501–3000, поля БД, округление
- **[ORDER_FILE_FACTORY_MAP.md](./ORDER_FILE_FACTORY_MAP.md)** — Экспорт в Excel: поиск товара, поля, поставщик
- **[EXCEL_EXPORT_MATCH_AND_FIELDS.md](./EXCEL_EXPORT_MATCH_AND_FIELDS.md)** — Сценарии «нет совпадения», имена полей БД для экспорта
- **[IMPORT_FINAL_FILLED.md](./IMPORT_FINAL_FILLED.md)** — Импорт из final_filled (листы, маппинг)
- **[CALCULATOR_FULL_AUDIT.md](./CALCULATOR_FULL_AUDIT.md)** — Движок расчёта цены дверей
- **[CALCULATOR_AUDIT_ISSUES_LIST.md](./CALCULATOR_AUDIT_ISSUES_LIST.md)** — Список проблем, выявленных при аудите калькулятора (исправленные и оставшиеся)
- **[COMPLETE_DATA_LOGIC_QA.md](./COMPLETE_DATA_LOGIC_QA.md)** — Вопросы по логике complete-data (открытые)
- **[CONFIGURATOR_STYLE_MODEL_UX.md](./CONFIGURATOR_STYLE_MODEL_UX.md)** — UX стилей и моделей
- **[VERIFICATION_CHECKLIST.md](./VERIFICATION_CHECKLIST.md)** — Чеклист верификации
- **[FULL_SYSTEM_AUDIT.md](./FULL_SYSTEM_AUDIT.md)** ⭐ — Полный аудит: от данных БД до экспорта документов
- **[DATA_AND_CACHE_RECOMMENDATIONS.md](./DATA_AND_CACHE_RECOMMENDATIONS.md)** — Покрытия complete-data и кэш: что делать

### 👥 Пользовательские инструкции

- **[USER_INSTRUCTIONS.md](./USER_INSTRUCTIONS.md)** — Инструкции для пользователей
- **[USER_GUIDE_COMPLECTATOR_EXECUTOR.md](./USER_GUIDE_COMPLECTATOR_EXECUTOR.md)** — Руководство для комплектатора и исполнителя
- **[HOW_TO_UPLOAD_PHOTOS.md](./HOW_TO_UPLOAD_PHOTOS.md)** — Загрузка фото товаров

### 📊 Планы и задачи

- **[TODO_ROADMAP.md](./TODO_ROADMAP.md)** ⭐ — План доработки
- **[TODO_REMAINING.md](./TODO_REMAINING.md)** — Оставшиеся задачи

### 📋 Тестирование

- **[E2E_TESTING_SETUP.md](./E2E_TESTING_SETUP.md)** — Настройка E2E
- **[E2E_TESTS_STAGING_DB.md](./E2E_TESTS_STAGING_DB.md)** — E2E на staging БД
- **[QUICK_START_E2E_STAGING.md](./QUICK_START_E2E_STAGING.md)** — Быстрый старт E2E
- **[PRE_DEPLOY_TESTING.md](./PRE_DEPLOY_TESTING.md)** — Проверки перед деплоем
- **[ACCESS_WITHOUT_LOGIN.md](./ACCESS_WITHOUT_LOGIN.md)** — Доступ без логина

---

## 📁 Архив

Устаревшие и разовые анализы перенесены в **[docs/archive/](./archive/ARCHIVE_INDEX.md)**. Там же — индекс с причиной архивации каждого файла.

---

## 🎯 Ключевые правила

- **Роли:** ADMIN, COMPLECTATOR, EXECUTOR, GUEST
- **Комплектатор** не создаёт заказы поставщиков; может создавать КП, счета, заказы и редактировать клиентов
- **Типы документов:** КП (Quote) → Счет (Invoice) → Заказ (Order) → Заказ поставщика (SupplierOrder)
- **Конфигуратор:** один — `/doors`; в Excel «Название модели» берётся из БД по коду модели

---

## 📝 История изменений

### 2026-02 — Наведение порядка в документации
- Устаревшие и разовые анализы (27 файлов) перенесены в `docs/archive/`
- В README оставлены только актуальные документы; добавлен раздел «Конфигуратор, каталог, экспорт»
- Удалены из README ссылки на несуществующие документы (NOTIFICATIONS_ANALYSIS, ORDER_STATUSES_AND_NOTIFICATIONS)
- Создан [archive/ARCHIVE_INDEX.md](./archive/ARCHIVE_INDEX.md) с описанием архивированных файлов

### 2025-11-13 — Финальная оптимизация
- Удалены дубликаты разработки и бизнес-логики, устаревшие аудиты
- Создан AI_DEVELOPER_METHODOLOGY.md

---

**Последнее обновление:** 2026-02
