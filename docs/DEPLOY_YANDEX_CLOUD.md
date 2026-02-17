# Деплой на Yandex Cloud

Обязательные условия:
- **Перенос всей БД** со всеми данными (каталог, товары, свойства, property_photos и т.д.).
- **Фото товаров хранятся в проекте** — каталог `public/uploads/` (в т.ч. `public/uploads/final-filled/doors/`) должен быть перенесён на сервер; раздача через Next.js статику по путям `/uploads/...`.

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

Рекомендуется:
- Отдельный инстанс PostgreSQL (Managed Service) для надёжности.
- VM с минимум 2 GB RAM для Next.js.

---

## 3. Развёртывание приложения

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

### Вариант B: Node.js без Docker

1. На VM: Node.js 20, npm.
2. Клонируйте репозиторий или скопируйте собранный артефакт (например `.next/standalone` + `public`).
3. Установите зависимости, сгенерируйте Prisma Client, примените миграции:

   ```bash
   npm ci --omit=dev
   npx prisma generate
   npx prisma migrate deploy
   ```

4. Распакуйте архив с фото в `public/uploads/` в корне приложения.
5. Запуск:

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

---

## 6. Краткий чеклист

- [ ] Дамп БД с текущей среды создан и перенесён.
- [ ] Архив `public/uploads/` создан и перенесён на сервер.
- [ ] На Yandex Cloud развёрнуты VM и (при необходимости) Managed PostgreSQL.
- [ ] `DATABASE_URL` и остальные переменные окружения заданы на сервере.
- [ ] БД восстановлена из дампа (или применены миграции и импорт данных).
- [ ] Папка `public/uploads/` распакована в каталог приложения на сервере.
- [ ] Приложение запущено (Docker или Node.js).
- [ ] Health и раздача фото проверены.
- [ ] При необходимости настроены Nginx/балансировщик и SSL (например, сертификат в Yandex Cloud).
