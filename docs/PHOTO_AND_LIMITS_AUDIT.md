# Аудит: отображение фото и ограничения (почему через время перестают подгружаться)

## 1. Цепочка от данных до картинки на экране

### 1.1 Источники URL фото

| Тип фото | API / источник | Поле | Формат пути |
|----------|----------------|------|-------------|
| Модели дверей (обложка) | `GET /api/catalog/doors/complete-data` | `model.photo` | `/uploads/final-filled/doors/...` |
| Цвета/покрытия | complete-data | `color.photo_path` | `/uploads/final-filled/doors/..._cover.png` |
| Древесная палитра (шпон) | complete-data | `wood.photo_path` | `/uploads/...` |
| Ручки | `GET /api/catalog/hardware?type=handles` | `photo_path` | `/uploads/final-filled/04_Ручки_Завертки/...` |
| Наличники | hardware | `photo_path` | `/uploads/final-filled/Наличники/...` |
| Ограничители, кромка, центр | hardware / complete-data | `photo_path` | `/uploads/...` |

Все пути нормализуются в API к виду `/uploads/...` (или остаются внешние http(s)). Фронт не меняет их на `/api/uploads/`.

### 1.2 Запрос картинки браузером

- В разметке: `<img loading="lazy" src={getImageSrc(path)} />`.  
- `getImageSrc()` (lib/configurator/image-src.ts) возвращает путь как есть (например `/uploads/final-filled/doors/X_cover.png`).
- Браузер выполняет **GET** к тому же origin: `GET /uploads/final-filled/doors/X_cover.png`.

### 1.3 Nginx (на ВМ)

- **location /uploads/**  
  - `root` = каталог `public` приложения.  
  - `try_files $uri @backend_uploads` — если файл **есть на диске**, Nginx отдаёт его сам (без Node).  
  - Если файла **нет** — внутренний redirect в `@backend_uploads`: rewrite в `/api/uploads/$1`, proxy_pass на Node (127.0.0.1:3000).
- **Ограничения для /uploads/ и @backend_uploads / /api/uploads/:**  
  - **limit_req zone=uploads_limit burst=200 nodelay**  
  - В зоне: **rate=100r/s**.  
  - Итого: первые 200 запросов в «пачке» проходят сразу; дальше — не более 100 запросов в секунду. Лишние получают **503**.

### 1.4 Next.js (без Nginx, dev)

- В next.config.mjs: rewrite **/uploads/:path* → /api/uploads/:path***.  
- Запрос обрабатывает **app/api/uploads/[...path]/route.ts**: поиск файла в `public/uploads/`, при отсутствии — fallback (ручки по коду, двери по префиксу, наличники по имени). Ответ с телом файла, заголовок Cache-Control. В обработчике есть in-memory кеш (LRU, макс. 500 записей).

### 1.5 Middleware (Node)

- Для **/api/** запросов: глобальный лимит **globalApiRateLimiter** (1200 запросов / 15 мин с одного IP).  
- Запросы **/api/uploads/** явно исключены из этого лимита — на 429 из-за него фото не должны уходить.

---

## 2. Почему «через какое-то время перестают подгружаться» фото

### 2.1 Исчерпание burst для /uploads/ (главная причина)

- На странице конфигуратора одновременно в разметке десятки–сотни картинок (модели, цвета, ручки, наличники, центр и т.д.).  
- У всех стоит **loading="lazy"** — браузер запрашивает их по мере попадания в viewport (и с запасом). При скролле или открытии панелей за короткий момент может уйти **200+ запросов** к `/uploads/...`.
- У Nginx: **burst=200**, затем **100 r/s**. С **nodelay** запросы сверх лимита не ждут, а получают **503**.  
- В результате: сначала грузятся те, что успели в первые 200; остальные получают 503, картинки не показываются (сломанное изображение или onError → плейсхолдер). «Через время» = как только очередь «прорвалась» и лимит начал резать.

### 2.2 Файлов нет на диске — всё идёт в Node

- Если **sync uploads на ВМ не делали** или файлы лежат под другими именами, Nginx по `try_files` не находит файл и **каждый** запрос уходит в Node.  
- Тогда и 200 burst, и 100 r/s упираются уже в Node: fallback (readdir и т.п.) тяжёлый, при большом числе одновременных запросов — очередь, таймауты, 502. В итоге часть картинок снова не грузится.

### 2.3 Жёсткий лимит на complete-data

- **location ~ ^/api/(health|catalog/doors/complete-data)** в Nginx: **limit_req zone=strict_limit burst=15 nodelay** (rate=3r/s), **limit_conn conn_limit 10**.  
- При частом переключении моделей или обновлении страницы несколько запросов complete-data подряд могут упираться в лимит и получать 503. Тогда не грузятся не только фото, но и сами данные (модели/цвета). Пользователь может воспринимать это как «перестали подгружаться и фото, и контент».

### 2.4 Таймауты и нагрузка на Node

- Для **@backend_uploads** и **/api/uploads/** заданы proxy_read_timeout 120s, proxy_send_timeout 120s.  
- Если Node под нагрузкой долго обрабатывает fallback или очередь большая, часть запросов может обрываться по таймауту — картинка не догружается.

### 2.5 Лимит соединений для location /

- **location /** (в т.ч. HTML, API hardware и др.): **limit_conn conn_limit 25**.  
- Запросы к **/uploads/** идут в свой location и **не** считаются в эти 25. Поэтому прямой причины «фото перестали грузиться» здесь нет, но общая загрузка страницы (скрипты, API) конкурирует за 25 соединений.

### 2.6 429 на complete-data (publicApiRateLimiter)

- Эндпоинты **GET /api/health** и **GET /api/catalog/doors/complete-data** в коде Node используют **publicApiRateLimiter**: лимит запросов в минуту с одного IP.
- Ранее лимит был **60/мин**. При 10 пользователях с одного IP (NAT) или при нагрузочном тесте с одного клиента запросов к complete-data больше 60 в минуту → **429 Too Many Requests**. В отчёте нагрузочного теста это отображалось как «Other errors».
- **Исправление:** лимит поднят до **400/мин** по умолчанию и настраивается через **PUBLIC_API_RATE_LIMIT_PER_MINUTE** (60–1000). См. `lib/security/rate-limiter.ts`.

---

## 3. Сводка ограничений (текущее состояние)

| Место | Ограничение | Влияние на фото |
|-------|-------------|------------------|
| Nginx **/uploads/**, **/api/uploads/** | limit_req uploads_limit **100 r/s, burst 200** nodelay | После 200 запросов в короткий период — 503, фото не грузятся. |
| Nginx **complete-data** | strict_limit **3 r/s, burst 15**, limit_conn **10** | 503 при частых перезапросах данных → нет данных и пустые места под фото. |
| Nginx **location /** | api_limit 15 r/s burst 50, **limit_conn 25** | Не касается /uploads/; может влиять на загрузку HTML и API (hardware и т.д.). |
| Middleware **/api*** | globalApiRateLimiter **1200 / 15 мин** | **/api/uploads/** исключены — на фото не влияет. |
| Node **uploads route** | Кеш 500 записей, fallback readdir | При отсутствии файлов на диске — нагрузка и задержки, косвенно таймауты/502. |

---

## 4. Рекомендации (внедрённые и дальнейшие)

### 4.1 Уже сделано в конфиге и коде (после аудита)

- **Nginx uploads:** в `scripts/output/domeo-nginx.conf` заданы **rate=150r/s**, **burst=500** для зоны uploads_limit (location /uploads/ и /api/uploads/). Меньше 503 при массовой подгрузке картинок.  
- **Nginx complete-data:** запросы к `^/api/(health|catalog/doors/complete-data)` переведены на **api_limit** (15 r/s, burst 50) вместо strict_limit (3 r/s, burst 15), убран limit_conn для этого location — меньше 503 при переключении моделей и обновлении.  
- **Фронт — дроссель загрузки:** компонент **ThrottledImage** и очередь **image-load-queue** (макс. **48** одновременных загрузок к /uploads/). Цель — загрузка страницы с любым числом фото ≤3 с.
- **Тест скорости фото:** `npm run test:load:photo-speed` — complete-data + все URL фото из ответа, параллельная загрузка; критерий — ≤3 с и 0 ошибок.

### 4.2 Обязательно на ВМ

- Регулярно выполнять **sync uploads** на ВМ, чтобы файлы лежали в `public/uploads/` (в т.ч. final-filled/doors, ручки, наличники) под теми именами, которые отдаёт API. Тогда Nginx по `try_files` отдаёт большую часть фото с диска и не нагружает Node.

### 4.3 Фронт (по желанию)

- Ограничить число одновременных загрузок картинок с одного экрана (например, очередь до 12–20 параллельных запросов к `/uploads/`), чтобы не выстреливать 200+ запросов за секунду и не упираться в burst даже при быстром скролле.

### 4.4 Мониторинг

- При повторении проблемы смотреть логи Nginx (503 по uploads_limit) и логи Node (таймауты, ошибки в app/api/uploads/[...path]/route.ts). По ним можно решить, нужно ли ещё поднимать burst/rate или добавлять дроссель на фронте.

---

## 5. Ссылки на код и конфиг

- Пути и нормализация: `lib/configurator/image-src.ts` (getImageSrc, getImageSrcWithPlaceholder).  
- Очередь загрузки и дроссель: `lib/configurator/image-load-queue.ts`, `components/configurator/ThrottledImage.tsx`.  
- Обработчик раздачи: `app/api/uploads/[...path]/route.ts`.  
- Данные дверей/цветов: `app/api/catalog/doors/complete-data/route.ts` (normalizePhotoPath, resolveDoorPhotoToExistingFile).  
- Ручки/наличники: `app/api/catalog/hardware/route.ts`.  
- Nginx: `scripts/output/domeo-nginx.conf`.  
- Middleware (исключение /api/uploads/ из globalApiRateLimiter): `middleware.ts`.
