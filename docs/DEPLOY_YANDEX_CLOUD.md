# Деплой на Yandex Cloud

**Рекомендуемый способ (без npm на ВМ — нет риска перегрузки и потери SSH):** деплой **артефактом** — сборка только на вашем ПК, на ВМ загружается готовый архив. См. [DEPLOY_STANDALONE_ARTIFACT.md](./DEPLOY_STANDALONE_ARTIFACT.md). Команда: **`npm run deploy:standalone`** (или `.\scripts\deploy-standalone-to-vm.ps1`).

**SSH и новая ВМ:** [SSH_KEY_AND_YC_VM.md](./SSH_KEY_AND_YC_VM.md) — ключ, права, `~/.ssh/config`, переменные `1002DOORS_SSH_KEY` и `1002DOORS_STAGING_HOST`.  
**Создать новую ВМ с нуля:** [NEW_YC_VM_CORRECT_DEPLOY.md](./NEW_YC_VM_CORRECT_DEPLOY.md).  
**Если используете деплой через git + npm на ВМ:** [VM_SSH_AND_TRAFFIC_ISSUES.md](./VM_SSH_AND_TRAFFIC_ISSUES.md) — почему пропадает SSH и как снизить риски.

## Текущее состояние (актуально после синхронизации)

- **Рабочая staging ВМ:** **84.201.160.50** — приложение в `~/1002doors`, systemd `domeo-staging`. Каталог дверей: **http://84.201.160.50:3000/doors**
- **Локальные данные:** товары и каталог хранятся в **SQLite** — `prisma/database/dev.db` (в репозитории 1002doors). Для выгрузки на ВМ данные сначала переносятся в PostgreSQL, затем делается дамп и синхронизация.
- **Локальный PostgreSQL:** `127.0.0.1:6432`, БД `domeo_production`, пользователь `domeo_user` (`.env.postgresql`). Нужен для дампа перед отправкой на ВМ.
- **На ВМ:** БД `domeo`, пользователь `domeo_user`. Фото в `~/1002doors/public/uploads/`. Обязательные подпапки в `public/uploads/final-filled/`: **`04_Ручки_Завертки`**, **`Наличники`**, при необходимости `doors/`, `05 Ограничители/`.
- **Перенос с диска на ВМ (одной командой):**  
  1) Перенести данные из SQLite в PostgreSQL: `npx tsx scripts/sqlite-to-postgres.ts`  
  2) Выполнить `npm run sync:staging` — скрипт упаковывает **public/uploads**, загружает на ВМ, дамп БД и перезапуск.  
  Только БД без фото: `.\scripts\sync-staging-full.ps1 -SkipPhotos`.  
  Полный цикл с SQLite: `npm run sync:staging:from-sqlite`.
- **Проверка:** http://84.201.160.50:3000 , http://84.201.160.50:3000/doors , http://84.201.160.50:3000/api/health

### Если http://84.201.160.50:3000 не открывается

1. **Группа безопасности в Yandex Cloud** — порт 3000 должен быть открыт для входящего трафика:
   - Консоль Yandex Cloud → Compute Cloud → ВМ → вкладка «Сеть» → группа безопасности.
   - Добавьте правило: входящий TCP, порт 3000, источник 0.0.0.0/0 (или ваш IP).

2. **Приложение слушает на всех интерфейсах** — иначе снаружи не подключиться. В скрипте sync и в `package.json` используется `next start -H 0.0.0.0 -p 3000`. Если запускали вручную, перезапустите:
   ```bash
   ssh petr@158.160.72.3
   cd ~/1002doors
   pkill -f 'node.*next' 2>/dev/null; sleep 2
   NODE_ENV=production nohup npx next start -H 0.0.0.0 -p 3000 > /tmp/domeo.log 2>&1 &
   sleep 3
   curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health
   ```
   Должно вывести `200`.

3. **Проверить, что процесс жив и лог:**
   ```bash
   pgrep -af next
   tail -30 /tmp/domeo.log
   ```

### Если при входе 500 «Server configuration error»

На ВМ в `~/1002doors/.env` должны быть заданы **JWT_SECRET** (не короче 32 символов) и **DATABASE_URL**. Без них `/api/auth/login` возвращает 500.

На сервере создайте или отредактируйте `.env`:
```bash
cd ~/1002doors
cat >> .env << 'EOF'
DATABASE_URL="postgresql://domeo_user:d0me0Stag1ngPg2025@localhost:5432/domeo?schema=public"
NODE_ENV=production
JWT_SECRET=staging-secret-key-min-32-chars-change-in-production
EOF
```
(или подставьте свой длинный JWT_SECRET). Затем перезапустите приложение (pkill + nohup npx next start ...).

### Обновление БД на ВМ (товары дверей)

Чтобы на ВМ остались только «старые» товары дверей (как до размножения по цвету), выполните на **самой ВМ** скрипт удаления по дате создания.

1. Подключитесь по SSH и обновите код (если скрипт ещё не залит):
   ```bash
   ssh petr@158.160.72.3
   cd ~/1002doors
   git pull
   ```

2. Убедитесь, что в `~/1002doors/.env` задан **DATABASE_URL** (подключение к PostgreSQL на ВМ).

3. Сначала — отчёт без удаления:
   ```bash
   cd ~/1002doors
   npx tsx scripts/delete-door-products-by-date.ts --dry-run
   ```
   Должно показать: «Оставляем … 2204», «Удаляем … 10768» (или актуальные числа).

4. Выполнить удаление:
   ```bash
   npx tsx scripts/delete-door-products-by-date.ts
   ```

5. Очистить кэш complete-data и перезапустить приложение:
   ```bash
   curl -s http://localhost:3000/api/catalog/doors/complete-data/refresh
   sudo systemctl restart domeo-staging
   ```
   (Если приложение запущено вручную — перезапустите процесс вручную.)

6. Проверка: http://158.160.72.3:3000/doors — модели должны загружаться, каталог работать со старым набором (~2204 товара).

### Перезагрузка ВМ

Если нужно перезагрузить саму ВМ (не только приложение):

1. **Через скрипт (по SSH):**  
   `.\scripts\reboot-staging-vm.ps1`  
   Используется неинтерактивная команда `sudo reboot`. Если интерактивный SSH обрывается (см. docs/SSH_VM_CONNECTION_CLOSED.md), скрипт всё равно может отправить перезагрузку. Подождите 1–2 минуты и проверьте доступ.

2. **Через консоль Yandex Cloud (надёжный способ):**  
   [Консоль Yandex Cloud](https://console.yandex.cloud/) → Compute Cloud → Виртуальные машины → выберите ВМ с IP 158.160.72.3 → **«Подключиться»** или меню **Действия** → **Перезапустить** (или Остановить → Запустить). Так перезагрузка не зависит от SSH.

---

Обязательные условия:
- **Перенос всей БД** со всеми данными (каталог, товары, свойства, property_photos и т.д.).
- **Фото товаров хранятся в проекте** — каталог `public/uploads/` должен быть перенесён на сервер; раздача через Next.js статику по путям `/uploads/...`. В `public/uploads/final-filled/` нужны: **`04_Ручки_Завертки`** (ручки), **`Наличники`** (наличники, внутри — подпапки по поставщику), при необходимости `doors/`, `05 Ограничители/`. Имена папок должны совпадать с путями в БД (ручки — с подчёркиваниями).

---

## 1. Подготовка к переносу

### 1.1 Очистка данных (опционально)

Если перед деплоем нужно очистить тестовые данные клиентов, документов, уведомлений и заказов:

```bash
npx tsx scripts/clean-data-before-deploy.ts --yes
```

Удаляются: Order, Invoice, Quote, SupplierOrder, Notification, Client. Каталог (Product, CatalogCategory, PropertyPhoto и т.д.) и пользователи не затрагиваются.

### 1.2 Дамп БД

На текущей машине (источник):

**PostgreSQL:**

```bash
pg_dump -h <host> -U <user> -d <database> -F c -f backup_$(date +%Y%m%d).dump
# или без сжатия (plain SQL):
pg_dump -h <host> -U <user> -d <database> -f backup_$(date +%Y%m%d).sql
```

**SQLite (если использовалась):**

```bash
# просто скопировать файл БД
cp prisma/dev.db backup_dev_$(date +%Y%m%d).db
```

### 1.3 Копирование фото

Фото лежат в проекте в `public/uploads/` (в репозитории эта папка в `.gitignore`). Для переноса соберите её в архив:

```bash
# из корня проекта
tar -czvf uploads_backup_$(date +%Y%m%d).tar.gz public/uploads/
# или через PowerShell (Windows):
# Compress-Archive -Path public/uploads -DestinationPath uploads_backup.zip
```

Перенесите архив на сервер (SCP, SFTP или объектное хранилище Yandex).

---

## 2. Инфраструктура Yandex Cloud

- **Сервер:** виртуальная машина (Compute Cloud) с Ubuntu 22.04 или аналог.
- **БД:** Managed PostgreSQL (Yandex Cloud) или PostgreSQL на той же VM.
- **Приложение:** Node.js 20, Next.js (standalone или `next start`), либо Docker-образ.

### 2.1 Параметры ВМ для быстрой работы и загрузки фото

| Сценарий | vCPU | RAM | Диск | Примечание |
|----------|------|-----|------|------------|
| **До ~10 пользователей одновременно** (рекомендуемый старт) | 4 | 8 GB | SSD 40–80 GB | Удобный запас по CPU и RAM; фото кэшируются ОС; быстрая отдача статики. |
| Минимум (приложение + БД отдельно) | 2 | 4 GB | SSD 20–40 GB | На 10 одновременных пользователей может быть впритык; лучше для 3–5. |
| Приложение и БД на одной VM | 4 | 8 GB | SSD 60–100 GB | 4 GB под Node.js, 2–4 GB под PostgreSQL, остальное — кэш ОС и статика. |

**Почему так:**

- **Быстрая работа приложения:** Node.js (Next.js) хорошо отзывается на 2–4 vCPU и 4–8 GB RAM (SSR, API, раздача статики). Меньше 4 GB RAM при активных пользователях может давать подтормаживания.
- **Быстрая загрузка фото:**
  - **SSD обязателен** — раздача тысяч файлов из `public/uploads/` с HDD будет узким местом.
  - **Достаточно RAM (4 GB и выше)** — ОС кэширует часто открываемые файлы в памяти, повторные запросы к одним и тем же фото идут из RAM.
  - Пропускная способность сети Yandex Cloud обычно достаточна; при необходимости можно включить кэширование статики в Nginx перед приложением.

**Рекомендация для старта (до ~10 пользователей одновременно):** отдельный Managed PostgreSQL и VM для приложения **4 vCPU, 8 GB RAM, SSD**. Этого хватит с запасом; при меньшей нагрузке (3–5 пользователей) можно взять **2 vCPU, 4 GB RAM, SSD**.

### 2.2 Кластер БД не обязателен: Managed PostgreSQL или PostgreSQL на ВМ

**Кластер создавать не обязательно.** Возможны два варианта:

| | Managed PostgreSQL (кластер) | PostgreSQL на той же ВМ, что и приложение |
|--|-----------------------------|-------------------------------------------|
| **Плюсы** | Автоматические бэкапы, обновления и патчи безопасности. Масштабирование диска/класса без перезапуска приложения. При падении ВМ приложения данные БД в безопасности. Удобно, если не хотите администрировать БД. | Один сервер вместо двух — проще и дешевле. Нет задержки по сети до БД. Подходит для старта и небольшой нагрузки (~10 пользователей). |
| **Минусы** | Отдельная плата за кластер; настройка сети/доступа. | Бэкапы и обновления PostgreSQL делаете сами. Если упадёт ВМ — и приложение, и БД недоступны. |
| **Когда выбирать** | Нужны гарантированные бэкапы, не хотите следить за БД, планируете рост. | Минимальный бюджет, один сервер «всё в одном», готовы настроить бэкапы (cron + pg_dump) сами. |

**Итог:** для старта с 10 пользователями можно поднять **одну ВМ** (4 vCPU, 8 GB RAM, SSD), установить на неё Node.js и PostgreSQL, развернуть приложение и БД на ней — тогда шаг «Создать кластер» в инструкции ниже пропускаете. Если нужны бэкапы «из коробки» и не хотите администрировать БД — создавайте Managed PostgreSQL по шагу 1.

### 2.3 Две ВМ: staging и production (рекомендуемый вариант)

Используем **две виртуальные машины**, на каждой — приложение и PostgreSQL «всё в одном». Кластер Managed PostgreSQL не создаём.

| ВМ | Назначение | Когда использовать |
|----|------------|--------------------|
| **Staging** | Среда для разработки и проверки: деплой, тесты, приёмка. | Сейчас: разворачиваем первыми, гоняем все проверки. |
| **Production** | Боевая среда для пользователей. | После успешных тестов на staging: переносим данные и переключаем трафик. |

**Порядок работы:**

1. Создать **обе ВМ** в Yandex Cloud (одинаковые параметры: 4 vCPU, 8 GB RAM, SSD, Ubuntu 22.04).
2. На **staging** установить PostgreSQL и приложение, восстановить дамп, загрузить фото, прогнать тесты.
3. Когда всё проверено — на **production** установить PostgreSQL и приложение, перенести дамп и фото со staging (или с локальной машины), запустить и переключить домен/трафик на production.

Так вы не трогаете боевую среду до полной уверенности в staging.

### 2.4 Пошаговое создание в Yandex Cloud (вместе)

Порядок: сеть (шаг 0), затем **две ВМ** — staging и production (шаг 1). Кластер БД не создаём; PostgreSQL ставится на каждой ВМ.

**Что понадобится:**
- Аккаунт в [Yandex Cloud](https://console.yandex.cloud/) и выбранный каталог (folder).
- Логин/пароль или OAuth для входа в консоль.

---

#### Шаг 0: Каталог и сеть

1. Откройте [консоль Yandex Cloud](https://console.yandex.cloud/).
2. Вверху выберите **каталог** (или создайте новый: «Создать каталог»).
3. **Сеть:** в меню слева **VPC** → **Сети**. Если сети нет — **Создать сеть** (например, `default`), указать зону (например, `ru-central1-a`), создать подсеть в этой зоне. Запомните зону — её же будем использовать для БД и ВМ.

---

#### Шаг 1: Две виртуальные машины (staging и production)

Кластер Managed PostgreSQL **не создаём** — БД будет на каждой ВМ.

1. В меню: **Compute Cloud** → **Виртуальные машины**.
2. **Создать ВМ** — первую, затем повторить для второй (удобно создать с теми же параметрами, различаются только имена).

**Параметры каждой ВМ** (одинаковые для staging и production):

| Параметр | Значение |
|----------|----------|
| Имя | **domeo-staging** / **domeo-production** |
| Зона доступности | одна и та же (например `ru-central1-a`) |
| Платформа | Intel Ice Lake (или по умолчанию) |
| vCPU | **4** |
| RAM | **8 GB** |
| Диск | загрузочный **SSD**, 60–80 GB, образ **Ubuntu 22.04 LTS** |
| Сеть | выбранная подсеть из шага 0 |
| Публичный IP | **Выдать** (SSH и доступ к приложению по HTTP) |

3. **Доступ:** логин `ubuntu`, **SSH-ключ** (рекомендуется) или пароль.
4. **Группа безопасности:** входящие 22 (SSH), 80 (HTTP), 443 (HTTPS); исходящие — разрешить всё.
5. Создайте обе ВМ, дождитесь статуса «Работает». Сохраните **публичные IP** staging и production (пока работаем только со staging).

---

#### Шаг 2: Staging — установка PostgreSQL и приложения

Подключаемся к **staging**-ВМ и настраиваем «всё в одном»: PostgreSQL + Node.js + приложение.

1. **Подключение по SSH:**
   ```bash
   ssh ubuntu@<IP-domeo-staging>
   ```

2. **Установка PostgreSQL 16:**
   ```bash
   sudo apt update && sudo apt install -y postgresql-16 postgresql-contrib
   sudo -u postgres createuser -s domeo_user
   sudo -u postgres psql -c "ALTER USER domeo_user WITH PASSWORD 'ваш_надёжный_пароль';"
   sudo -u postgres createdb -O domeo_user domeo
   ```
   Проверка: `psql -U domeo_user -d domeo -h localhost -c 'SELECT 1'`

3. **Установка Node.js 20:**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt install -y nodejs
   node -v   # v20.x
   ```

4. **Развёртывание приложения** — по разделу 3 ниже (клонирование репо или копирование артефакта, `npm ci`, `prisma generate`, `prisma migrate deploy`, восстановление дампа из раздела 4, распаковка фото в `public/uploads/`, `.env` с `DATABASE_URL=postgresql://domeo_user:пароль@localhost:5432/domeo`).

5. **Запуск и проверка** — `npm run build && npm run start` или PM2. Проверить: `http://<IP-staging>:3000`, health, каталог, фото.

Когда staging полностью проверен — переходим к переносу на production (раздел ниже).

---

**Группы безопасности (Yandex Cloud):** VPC → Группы безопасности — входящие 22, 80, 443; исходящие — разрешить.

**Что должно получиться после шагов 0–2:**

- [ ] Сеть и подсеть в одной зоне.
- [ ] Две ВМ: **domeo-staging** и **domeo-production** (4 vCPU, 8 GB RAM, SSD), обе с публичным IP.
- [ ] На staging: PostgreSQL и приложение установлены, БД восстановлена, фото загружены, приложение отвечает по HTTP.

Дальше: полное развёртывание на staging по разделам 3–4, затем **перенос на production** (см. ниже).

---

## 3. Развёртывание приложения

Для **двух ВМ (staging/production)** с PostgreSQL на той же машине удобнее **Вариант B: Node.js без Docker** — на каждой ВМ один и тот же набор: PostgreSQL + Node + приложение. Ниже оба варианта.

### Вариант A: Docker на VM

1. Установите Docker и Docker Compose на VM.
2. Соберите образ (на сборщике или на VM):

   ```bash
   docker build -t domeo:latest .
   ```

3. На VM разместите:
   - код или образ;
   - `.env` с `DATABASE_URL` и прочими переменными;
   - папку `public/uploads/` (распаковать из архива в каталог приложения).

4. Запуск контейнера должен монтировать каталог с фото, например:

   ```bash
   docker run -d \
     -p 3000:3000 \
     -e DATABASE_URL="postgresql://..." \
     -v /opt/domeo/public/uploads:/app/public/uploads \
     domeo:latest
   ```

   Тогда фото в проекте будут в `/app/public/uploads` и отдаваться по `/uploads/...`.

### Вариант B: Node.js без Docker (рекомендуется для staging/production ВМ)

1. На VM: Node.js 20, npm (и PostgreSQL на этой же ВМ, если без кластера).
2. Клонируйте репозиторий или скопируйте собранный артефакт (например `.next/standalone` + `public`).
3. В корне проекта создайте `.env` с `DATABASE_URL=postgresql://domeo_user:пароль@localhost:5432/domeo`.
4. Установите зависимости, сгенерируйте Prisma Client, примените миграции:

   ```bash
   npm ci --omit=dev
   npx prisma generate
   npx prisma migrate deploy
   ```

5. Распакуйте архив с фото в `public/uploads/` в корне приложения.
6. Запуск:

   ```bash
   npm run build
   npm run start
   ```

   Или через PM2:

   ```bash
   pm2 start npm --name "domeo" -- start
   pm2 save && pm2 startup
   ```

---

## 4. Восстановление БД на Yandex Cloud

1. Создайте базу PostgreSQL (Managed PostgreSQL или локальный инстанс на VM).
2. Создайте пользователя и базу, задайте `DATABASE_URL` в `.env` на сервере.
3. Восстановите дамп:

   **Custom format (pg_dump -F c):**

   ```bash
   pg_restore -h <yandex-db-host> -U <user> -d <database> --no-owner --no-acl backup_YYYYMMDD.dump
   ```

   **Plain SQL:**

   ```bash
   psql -h <yandex-db-host> -U <user> -d <database> -f backup_YYYYMMDD.sql
   ```

4. Если используете миграции Prisma с нуля:

   ```bash
   npx prisma migrate deploy
   ```

   И затем при необходимости импортируйте данные из дампа в уже созданные таблицы или используйте дамп только для данных.

---

## 5. Проверка после деплоя

- **Health:** `GET https://<your-domain>/api/health` — 200, `checks.database.status === 'ok'`.
- **Фото:** открыть в браузере URL вида `https://<your-domain>/uploads/final-filled/doors/<файл>.jpg` — должна отдаваться картинка из `public/uploads/final-filled/doors/`.
- **Каталог:** страница каталога дверей загружается, у товаров отображаются фото (пути `/uploads/...`).

### 5.1 Перенос со staging на production

Когда на staging всё проверено, поднимаем боевую среду на второй ВМ.

1. **Дамп БД со staging** (выполнить на своей машине или со staging):
   ```bash
   pg_dump -h <IP-staging> -U domeo_user -d domeo -F c -f staging_backup_$(date +%Y%m%d).dump
   ```
   Либо с staging по SSH:
   ```bash
   ssh ubuntu@<IP-staging> "pg_dump -U domeo_user -d domeo -h localhost -F c" > staging_backup.dump
   ```

2. **Архив фото** — уже есть из подготовки (раздел 1.3) или упакуйте `public/uploads/` со staging:
   ```bash
   ssh ubuntu@<IP-staging> "tar -czvf - -C /path/to/app public/uploads" > uploads_from_staging.tar.gz
   ```

3. **На production-ВМ:** подключиться по SSH, установить PostgreSQL и Node.js (аналогично шагу 2 раздела 2.4), создать БД и пользователя.

4. **Восстановить дамп на production:**
   ```bash
   pg_restore -h localhost -U domeo_user -d domeo --no-owner --no-acl staging_backup.dump
   ```
   (файл дампа предварительно скопировать на production, например через `scp`.)

5. **Развернуть приложение** на production (код, `npm ci`, `prisma generate`, `prisma migrate deploy` при необходимости), распаковать фото в `public/uploads/`, задать `.env` с `DATABASE_URL=postgresql://domeo_user:пароль@localhost:5432/domeo`, запустить приложение (или PM2).

6. **Проверка** — открыть `http://<IP-production>:3000`, health, каталог, фото. Затем настроить домен/SSL на production и переключить трафик.

---

## 6. Краткий чеклист

**Инфраструктура (две ВМ, без кластера):**
- [ ] Сеть и подсеть в зоне созданы.
- [ ] ВМ **domeo-staging** и **domeo-production** созданы (4 vCPU, 8 GB RAM, SSD, Ubuntu 22.04), публичный IP выдан.

**Staging:**
- [ ] Дамп БД и архив `public/uploads/` подготовлены и перенесены на staging.
- [ ] На staging установлены PostgreSQL и Node.js, приложение развёрнуто.
- [ ] `DATABASE_URL` и переменные окружения заданы в `.env`.
- [ ] БД восстановлена из дампа, фото распакованы в `public/uploads/`.
- [ ] Приложение запущено, health и раздача фото проверены.

**Production (после проверки staging):**
- [ ] На production установлены PostgreSQL и Node.js.
- [ ] Дамп и фото перенесены со staging (или с локальной машины), БД восстановлена, приложение развёрнуто и запущено.
- [ ] Проверка по IP production; при необходимости настроены домен, Nginx и SSL.
