# Полный аудит приложения (Domeo / 1002doors)

**Дата:** 2026-02-13  
**Роль:** Full-stack разработчик и тестировщик  
**Цель:** Аудит и тестирование приложения, предложения по исправлениям и доработкам.

---

## 1. Краткое описание приложения

- **Стек:** Next.js 15, React 19, Prisma, Tailwind, Playwright (e2e).
- **Назначение:** Конфигуратор межкомнатных дверей (каталог, расчёт цены, корзина, генерация КП/Счёта/Заказа).
- **Ключевые потоки:** загрузка моделей (complete-data) → выбор модели/размеров/покрытия → расчёт цены (price/doors) → добавление в корзину → генерация документов (PDF/Excel).

---

## 2. Выполненные исправления (в рамках аудита)

### 2.1 Корзина и документы: передача типа позиции

**Проблема (из CART_AND_DOCUMENTS_AUDIT):** В `generateDocument` в API уходил массив `items` без поля `type`. В `app/api/documents/generate/route.ts` проверки `item.type === 'door'` и `item.type === 'handle'` всегда давали `false`, из‑за чего в PDF/Excel позиции ручек, заверток и ограничителей обрабатывались некорректно.

**Исправление:**

- **`app/doors/page.tsx`:** В тело запроса к `/api/documents/generate` добавлено поле `type` для каждой позиции:
  - `type: item.itemType ?? (item.limiterId ? 'limiter' : item.handleId ? 'handle' : 'door')`
- **`app/api/documents/generate/route.ts`:**
  - В интерфейс `DocumentItem` добавлены поля `type`, `limiterId`, опциональные `name`, `quantity`, `total`, `qty`.
  - `buildProductName()` переведён на учёт `type`: отдельные ветки для door / handle / backplate / limiter.
  - Поиск SKU поставщика для PDF (КП и Счёт): для `handle` и `backplate` — категория «Ручки»/«Ручки и завертки», для `limiter` — категория «Ограничители».
  - Для заказа (Excel) обогащение по конфигурации двери выполняется только при `itemType === 'door'`; для ручек/заверток/ограничителей возвращается строка без поиска по каталогу дверей.

### 2.2 Дедупликация: backplate и limiter

**Проблема:** В `lib/documents/deduplication-client.ts` все позиции с `handleId` сводились к типу `handle`, а позиции без `handleId` (в т.ч. ограничители) нормализовались как «дверь», из‑за чего дедупликация давала неверные совпадения.

**Исправление:**

- **`normalizeItems`:**
  - Учитывается `item.type` или `item.itemType`; при отсутствии — вывод типа из `limiterId` / `handleId`.
  - Отдельные нормализованные объекты для `handle`, `backplate` (handleId + quantity + unitPrice) и `limiter` (limiterId + quantity + unitPrice).
  - В ключ сортировки добавлен `limiterId`.
- **`compareCartContent`:** Добавлено сравнение пар для типа `backplate` (аналогично handle) и отдельная ветка для `limiter` (по limiterId, quantity, unitPrice).

---

## 3. Сводка по существующим аудитам

| Документ | Основные выводы |
|----------|------------------|
| **CALCULATOR_FULL_AUDIT.md** | Цепочки данных (complete-data → model-options → price/doors) согласованы; сброс цены при смене модели/покрытия и защита от гонки запросов реализованы. Рекомендуется пройти проверочный список из раздела 6 вручную или e2e. |
| **CART_AND_DOCUMENTS_AUDIT.md** | Описаны проблемы с передачей `type` и дедупликацией — **частично устранены** правками выше. |
| **CONFIGURATOR_FILTERS_AUDIT.md** | Критичные пункты (наполнение в цене, высоты 2350/2750 в model-options, сброс модели при сужении фильтров) отмечены как исправленные в CALCULATOR_FULL_AUDIT. |

---

## 4. Тестирование

### 4.1 Юнит-тесты

- В `package.json`: `"test": "echo 'No tests configured yet'"` — **юнит-тесты не настроены.**

### 4.2 E2E (Playwright)

- Настроены сценарии: `e2e/health.spec.ts`, `e2e/auth.spec.ts`, `e2e/documents.spec.ts`.
- Документы: логин, переход на `/doors`, добавление в корзину, создание КП (при наличии кнопки «В корзину»).
- Зависимость от тестовой БД и учётных данных (env: `TEST_BASE_URL`, `TEST_COMPLECTOR_EMAIL` и т.д.).

**Рекомендация:** Добавить e2e-кейс «генерация КП/Счёта с корзиной, содержащей дверь + ручка + ограничитель» и проверку, что в скачанном PDF/Excel типы позиций и названия соответствуют ожиданию (дверь, ручка, завертка, ограничитель).

### 4.3 Ручная проверка (калькулятор)

По CALCULATOR_FULL_AUDIT, раздел 6:

- [ ] Стиль: смена стиля меняет список моделей; выбранная модель сбрасывается, если не входит в новый список.
- [ ] Наполнение: при «Голд» — только модели с Голд; цена считается по товару с наполнением Голд.
- [ ] Высота 2301–2500 / 2501–3000: каскад и цена с надбавкой за высоту.
- [ ] Смена модели/покрытия: цена сбрасывается и пересчитывается.
- [ ] Реверс, кромка, корзина: надбавки и состав соответствуют выбору.

---

## 5. Рекомендации по доработкам

### 5.1 Критичные / высокий приоритет

1. **Валидация тела запроса в API документов**  
   В `POST /api/documents/generate` тело парсится как `request.json()` без схемы (Zod/йоп и т.п.). Добавить валидацию полей `type`, `clientId`, `items`, `totalAmount` и при неверном формате возвращать 400 с понятным сообщением.

2. **Проверка прав на клиента**  
   Убедиться, что `clientId` в запросе принадлежит текущему пользователю/организации (если в приложении есть мультитенантность или разграничение по ролям).

3. **E2E для документов с разными типами позиций**  
   Сценарий: корзина с door + handle + backplate + limiter → генерация КП → проверка, что в PDF есть строки с корректными наименованиями и типами (или артикулами).

### 5.2 Средний приоритет

4. **Юнит-тесты**  
   Настроить Jest/Vitest; в первую очередь покрыть:
   - `lib/documents/deduplication-client.ts` (normalizeItems, compareCartContent) для комбинаций door/handle/backplate/limiter;
   - ключевые функции в `app/api/price/doors/route.ts` (filterProducts, расчёт надбавок), если они вынесены в отдельные функции.

5. **Обработка ошибок на клиенте**  
   В `generateDocument` при `!response.ok` показывается только `alert('Ошибка при генерации документа')`. Имеет смысл показывать текст из ответа (если API возвращает сообщение) и логировать ответ для отладки.

6. **Типизация корзины в API**  
   Заменить `any` в дедупликации на типы (например, общий тип позиции корзины с полями `type`, `handleId`, `limiterId`, и т.д.) для согласованности с фронтом и документ-API.

### 5.3 Низкий приоритет

7. **Звукоизоляция (standard/good/excellent)**  
   По CALCULATOR_FULL_AUDIT это legacy; на расчёт и подбор товара не влияет. Либо убрать из UI, либо явно пометить как справочное.

8. **Тип конструкции (selection.type)**  
   В price/doors есть проверка типа конструкции, но в конфигураторе тип не выбирается. При желании упростить API — рассмотреть удаление этого условия.

9. **Лимиты и таймауты**  
   Проверить лимиты размера тела для `/api/documents/generate` и таймауты запуска Puppeteer/Chromium при большой корзине.

---

## 6. Безопасность (кратко)

- Генерация документов защищена `requireAuth` (проверка выполнена в коде).
- Не проверялось: хранение JWT, CORS, rate limiting, санитизация данных для PDF/Excel (подстановка в шаблоны). Рекомендуется отдельный security-review при необходимости.

---

## 7. Итог

- **Исправлено:** передача `type` позиции из корзины в API документов; учёт типов door/handle/backplate/limiter в генерации PDF/Excel и в дедупликации.
- **Рекомендовано:** валидация входящих данных документ-API, e2e для сценария «корзина с разными типами позиций → КП», юнит-тесты для дедупликации и при необходимости для расчёта цены.
- Существующие аудиты калькулятора и фильтров актуальны; проверочный список из CALCULATOR_FULL_AUDIT стоит пройти для регрессии после любых изменений в конфигураторе или API цены.

Связанные файлы: `CALCULATOR_FULL_AUDIT.md`, `CART_AND_DOCUMENTS_AUDIT.md`, `CONFIGURATOR_FILTERS_AUDIT.md`, `DOOR_ATTRIBUTES_MAP.md`.

---

## 8. Выполненные доработки (шаг за шагом, 2026-02-13)

| № | Задача | Статус | Файлы |
|---|--------|--------|-------|
| 1 | Zod-валидация тела `POST /api/documents/generate` | Выполнено | `lib/validation/document.schemas.ts` (схемы `generateDocumentItemSchema`, `generateDocumentFromDoorsSchema`), `app/api/documents/generate/route.ts` (safeParse, 400 при ошибке) |
| 2 | Обработка ошибок в `generateDocument`: показ текста ответа API | Выполнено | `app/doors/page.tsx`: при `!response.ok` парсинг JSON и вывод `error.message`; в catch — сообщение из Error |
| 3 | Проверка прав на clientId | Не требуется | В схеме БД у Client нет привязки к пользователю; клиенты общие. В коде добавлен комментарий. |
| 4 | Типизация в deduplication-client (убрать any) | Выполнено | `lib/documents/deduplication-client.ts`: интерфейсы `CartItemInput`, `NormalizedDoor`, `NormalizedHandleLike`, `NormalizedLimiter`, `NormalizedCartItem` |
| 5 | Юнит-тесты для normalizeItems / compareCartContent | Выполнено | Vitest добавлен в devDependencies; `lib/documents/deduplication-client.test.ts` — 14 тестов |
| 6 | E2E: корзина с разными типами позиций → КП | Выполнено | `e2e/documents.spec.ts`: тест «6b. Генерация КП из корзины с разными типами позиций» (дверь, проверка скачивания PDF при наличии клиента) |

### Продолжение: каскад model-options и тесты

- **`lib/catalog/doors-model-options.ts`** — вынесена логика каскада (getProductsByModelAndStyle, filterByReversible, filterByFilling, filterBySize, filterByFinish, filterByColor, heightForFilter, collectOptions). API `GET /api/catalog/doors/model-options` переведён на этот модуль.
- **`lib/catalog/doors-model-options.test.ts`** — 18 тестов: фильтры по модели/стилю, реверс, наполнение, размер, высота 2350/2750→2000, сбор опций (fillings, widths, heights, finishes, colorsByFinish, revers_available, mirror_available, threshold_available), полный каскад.
- **`vitest.config.ts`** — добавлен exclude для `e2e/**`, чтобы Vitest не подхватывал Playwright-спеки. Юнит-тесты: `npm run test` — 57 тестов (25 price engine + 18 model-options + 14 deduplication).
- **`components/cart/ClientSelector.tsx`** — исправлена разметка (добавлен закрывающий `</div>` для контейнера списка). Ошибки type-check в других файлах (admin, categories) остаются и требуют отдельного исправления.
