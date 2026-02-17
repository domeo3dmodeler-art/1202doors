# Поток данных: конфигуратор дверей → корзина → заказ → экспорт в Excel

Цель: из конфигуратора на странице «Двери» в Excel должны попадать **все** выбранные опции (кромка, порог, наличники, фурнитура, реверс, зеркало и т.д.).

## Цепочка (где что заполняется)

```
Конфигуратор (Doors)  →  Корзина (cart)  →  Заказ (POST /api/orders)  →  cart_data  →  Экспорт Excel
     app/doors/page       CartItem[]         items в body                 БД              generateExcelOrder
```

## 1. Конфигуратор → корзина

**Файл:** `app/doors/page.tsx`, функция `addToCart`.

При нажатии «В корзину» в корзину кладётся объект `CartItem` с полями:

| Поле | Откуда |
|------|--------|
| model, style, finish, color, width, height | Выбор модели и покрытия |
| edge | `'да'` / `'нет'` по выбранной кромке |
| edgeId | ID выбранной кромки |
| edgeColorName | Название цвета кромки (для Excel «Цвет кромки») |
| threshold | `selectedThresholdId != null` (boolean) |
| optionIds | Массив ID выбранных наличников (пока один: selectedArchitraveId) |
| architraveNames | Названия наличников для колонки «Наличники» |
| reversible, mirror, glassColor | Реверс, зеркало, цвет стекла |
| hardwareKitId | ID комплекта фурнитуры (hardwareKitName конфигуратор не кладёт) |
| handleId, handleName, sku_1c, unitPrice, qty | Ручка, артикул, цена, кол-во |

Тип корзины: `components/doors/types.ts` — `CartItem`.

## 2. Корзина → заказ (создание заказа)

**Файлы:**  
- `components/doors/CartManager.tsx` — кнопка «Создать заказ» на странице Двери  
- `app/components/cart/QuickCartSidebar.tsx`, `EnhancedCartSidebar.tsx` — создание заказа из боковой корзины  

При создании заказа массив `items` для `POST /api/orders` собирается из каждой позиции корзины. **Обязательно передаются** (иначе в Excel будут пустые ячейки):

- `edge`, `edgeId`, `edgeColorName`
- `threshold` (нормализуется: true / 1 / "да" → boolean)
- `optionIds`, `architraveNames`, `optionNames`
- `reversible`, `mirror`, `glassColor`
- `hardwareKitId`, `hardwareKitName` (если в корзине нет `hardwareKitName`, подставляется из справочника комплектов по `hardwareKitId`)

Раньше в этом маппинге были только базовые поля (модель, размер, цена и т.д.), из‑за чего в `cart_data` не попадали кромка, порог и наличники. Сейчас все перечисленные поля передаются.

## 3. API заказа и сохранение cart_data

**Файлы:**  
- `app/api/orders/route.ts` — принимает `body.items`  
- `lib/validation/document.schemas.ts` — схема `documentItemSchema`  
- `lib/repositories/document.repository.ts` — сохраняет `cart_data: JSON.stringify(data.items)`  

В схеме элемента документа:

- `threshold` может прийти как boolean, 1 или строка «да» — приводится к boolean.
- Поддерживаются и camelCase, и snake_case: `option_ids` / `optionIds`, `architrave_names` / `architraveNames`, чтобы данные не терялись при разных форматах.

В БД в заказе хранится строка `cart_data` — это JSON массива позиций с теми же полями, что были в `items`.

## 4. Экспорт заказа в Excel

**Источники данных для экспорта:**  
- ЛК исполнителя: `invoice?.cart_data || order.cart_data` (полный заказ подгружается через `GET /api/orders/[id]`).  
- Данные в экспорт передаются как массив позиций из этого `cart_data`.

**Файлы:**  
- `lib/export/puppeteer-generator.ts`:  
  - `exportDocumentWithPDF` строит объект для генератора: для каждой позиции подставляются `edge`, `edgeId`, `edgeColorName`, `threshold` (нормализация через `normalizeThreshold`), `optionIds`, `architraveNames`, `optionNames`.  
  - `generateExcelOrder` заполняет лист «Заказ»; для опций двери используются:
    - **Кромка:** `hasEdgeSelected(item)` (edge === 'да' или есть edgeId / edgeColorName)
    - **Цвет кромки:** `item.edgeColorName` / `item.edge_color_name` / `item.edgeId`
    - **Порог:** `hasThreshold(item)` (true, 1 или строка «да»)
    - **Наличники:** `formatArchitraveDisplay(item)` (architraveNames / optionNames или «да» при наличии optionIds)

Итог: если на каждом шаге (конфигуратор → корзина → заказ → cart_data → экспорт) эти поля не теряются, в Excel они отображаются корректно.

## Где могли теряться данные (и что исправлено)

1. **Корзина → заказ**  
   В CartManager / QuickCartSidebar / EnhancedCartSidebar в объект позиции для `POST /api/orders` не входили `edge`, `edgeId`, `edgeColorName`, `threshold`, `optionIds`, `architraveNames` и др.  
   → В маппинг при создании заказа добавлены все эти поля.

2. **Валидация API**  
   `threshold` только как boolean — при значении 1 или «да» поле могло отбрасываться или ломать запрос.  
   → В схеме `threshold` принимается как boolean / 1 / строка и приводится к boolean; добавлены `option_ids` / `architrave_names`.

3. **Экспорт**  
   В объекте для Excel порог и опции должны приходить в едином виде.  
   → В экспорте используется `normalizeThreshold`, в объект позиции явно передаются `optionIds` и `architraveNames` (в т.ч. из snake_case).

4. **Название фурнитуры в Excel**  
   В корзине из конфигуратора есть только `hardwareKitId`, без `hardwareKitName`.  
   → При формировании позиции заказа в CartManager подставляется `hardwareKitName` из справочника комплектов по `hardwareKitId`, если в корзине его не было.

## Проверка цикла

Скрипт `scripts/verify-order-export-cycle.ts`:

1. Создаёт заказ в БД с одной дверью, в `cart_data` у которой заданы кромка, порог и наличники.
2. Вызывает экспорт в Excel (тот же путь, что и из ЛК исполнителя).
3. Проверяет в сгенерированном файле ячейки «Кромка», «Цвет кромки», «Порог», «Наличники».

Запуск: `npx tsx scripts/verify-order-export-cycle.ts`

Для проверки конкретного заказа (есть ли в cart_data нужные поля):  
`npx tsx scripts/inspect-order-cart-data.ts [номер или id заказа]`
