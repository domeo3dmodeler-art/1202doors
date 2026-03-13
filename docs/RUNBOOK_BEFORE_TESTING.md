# Пошаговый runbook перед тестированием

Выполняйте шаги **по порядку**. После каждого шага — проверка (галочка или команда).

---

## Шаг 0. Переменные окружения на вашем ПК (для скриптов)

Скрипты подключаются к ВМ по SSH. Нужны:

- **1002DOORS_SSH_KEY** — путь к приватному ключу (например `C:\Users\...\.ssh\ssh-key-...\ssh-key-...`)
- **1002DOORS_STAGING_HOST** — пользователь и хост ВМ (например `ubuntu@89.169.181.191`)

В PowerShell один раз (или добавьте в профиль):

```powershell
$env:1002DOORS_SSH_KEY = "C:\путь\к\вашему\ssh-key"
$env:1002DOORS_STAGING_HOST = "ubuntu@IP_ВАШЕЙ_ВМ"
```

Опционально: **1002DOORS_UPLOADS_PATH** — если фото лежат не в `public/uploads`, а в отдельной папке (для sync и деплоя).

- [ ] Переменные заданы, ключ и хост верные

---

## Шаг 1. Swap на ВМ (один раз)

Чтобы при пиках нагрузки (несколько PDF, много пользователей) не было OOM и 502.

**На вашем ПК:**

```powershell
cd C:\01_conf\1002doors
.\scripts\vm-add-swap.ps1
```

В выводе должно быть `Swap` и размер (например 1G). Если уже есть — скрипт просто включит swap и выведет `free -h`.

- [ ] Выполнено, в выводе есть строка Swap

**При необходимости 2 GB swap:** зайдите на ВМ по SSH и выполните там (один раз):

```bash
sudo swapoff /swapfile 2>/dev/null
sudo rm -f /swapfile
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
grep -q /swapfile /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```

- [ ] (Опционально) Увеличил swap до 2 GB

---

## Шаг 2. Проверка .env на ВМ (один раз)

Зайдите на ВМ по SSH:

```powershell
ssh -i $env:1002DOORS_SSH_KEY $env:1002DOORS_STAGING_HOST
```

На ВМ:

```bash
cd ~/domeo-app
cat .env | grep -E '^[A-Z]' | sed 's/=.*/=***/'   # показать только имена переменных (значения скрыты)
```

Должны быть минимум:

- **DATABASE_URL** — строка подключения к PostgreSQL
- **JWT_SECRET** — не короче 32 символов

Для экспорта PDF на ВМ должен быть Chromium. Если установлен в нестандартный путь:

- **PUPPETEER_EXECUTABLE_PATH** — путь к исполняемому файлу (например `/usr/bin/chromium-browser`)

Если чего-то нет — создайте/дополните `.env` в `~/domeo-app` и перезапустите приложение (шаг 5).

- [ ] DATABASE_URL и JWT_SECRET есть; при необходимости добавлен PUPPETEER_EXECUTABLE_PATH

---

## Шаг 3. Сборка и деплой приложения

**На вашем ПК** из корня проекта:

```powershell
cd C:\01_conf\1002doors
.\scripts\deploy-standalone-to-vm.ps1
```

Скрипт: `npm ci` → `npm run build` (NODE_ENV=production) → упаковка standalone → загрузка на ВМ → распаковка в `~/domeo-app` → `prisma migrate deploy` → перезапуск (systemd или nohup).

Если нужно только обновить код без перезаливки фото:

```powershell
.\scripts\deploy-standalone-to-vm.ps1 -AppOnly
```

С опцией **-Rsync** (если установлен rsync): загрузка только изменённых файлов, быстрее при мелких правках:

```powershell
.\scripts\deploy-standalone-to-vm.ps1 -Rsync
```

- [ ] Деплой завершился без ошибок

---

## Шаг 4. Синхронизация фото (uploads) на ВМ

Чтобы фото ручек, дверей и цветов отображались и не было 502 по путям `/uploads/...`.

**На вашем ПК:**

```powershell
cd C:\01_conf\1002doors
.\scripts\sync-uploads-to-vm.ps1
```

Источник по умолчанию: `public/uploads`. Если фото в другой папке — задайте `1002DOORS_UPLOADS_PATH` перед запуском.

Проверка на ВМ (после sync):

```bash
ssh -i $env:1002DOORS_SSH_KEY $env:1002DOORS_STAGING_HOST "ls -la ~/domeo-app/public/uploads/final-filled/ 2>/dev/null | head -20"
```

Должны быть папки вроде `04_Ручки_Завертки`, `doors`, `Наличники` (или аналогичные).

- [ ] Sync выполнен, в `~/domeo-app/public/uploads/final-filled/` есть нужные папки

---

## Шаг 5. Nginx (если перед приложением стоит Nginx)

Конфиг лежит в `scripts/output/domeo-nginx.conf`. Применение на ВМ:

**На вашем ПК:**

```powershell
cd C:\01_conf\1002doors
.\scripts\apply-nginx-to-vm.ps1
```

Должно вывести: `Nginx config applied and reloaded.`

Если Nginx на ВМ не используется (доступ напрямую на порт 3000) — шаг пропустить.

- [ ] Применён или Nginx не используется

---

## Шаг 6. Проверка, что приложение запущено и отвечает

**Вариант А — с вашего ПК (если открыт порт 3000 или доступ через Nginx на 80):**

Подставьте ваш URL (через Nginx или напрямую :3000):

```powershell
$base = "http://89.169.181.191"   # замените на IP/домен вашей ВМ
Invoke-WebRequest -Uri "$base/api/health" -UseBasicParsing | Select-Object StatusCode, Content
```

Ожидается: **StatusCode 200**, в Content — JSON с `database.status === 'ok'` (или аналогично).

**Вариант Б — с ВМ по SSH:**

```bash
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health
```

Должно вывести **200**.

Дополнительно откройте в браузере главную страницу — она должна загрузиться без 502.

- [ ] Health возвращает 200, главная открывается

---

## Шаг 7. Проверка структуры на ВМ (при повторяющихся 502)

Если после деплоя по-прежнему 502, на ВМ проверьте:

```bash
ssh -i $env:1002DOORS_SSH_KEY $env:1002DOORS_STAGING_HOST
cd ~/domeo-app
ls -la server.js .next/standalone/server.js 2>/dev/null
ls -la .next/static 2>/dev/null | head -5
```

Должны быть: `server.js` в корне `~/domeo-app`, папка `.next/static`. Если `server.js` нет или `.next` пустой — деплой прошёл в другую папку или билд не standalone. Запускайте деплой снова (шаг 3) без `-SkipBuild`.

Проверка процесса:

```bash
pgrep -af "node.*server.js" || pgrep -af "node.*standalone"
sudo systemctl status domeo-standalone 2>/dev/null || true
```

- [ ] На ВМ есть server.js и .next; процесс приложения запущен

---

## Шаг 8. Краткое сообщение тестировщикам

Можно отправить после выполнения шагов 1–6:

- Мы запускаем тестирование. URL: **<ваш URL>**.
- Это тестовое окружение: возможны кратковременные сбои — пожалуйста, опишите, что сделали и что увидели (скрин/текст ошибки).
- Экспорт в PDF: при одновременной выгрузке несколькими пользователями возможна очередь (ожидание до нескольких минут или сообщение «Сервер занят экспортом PDF. Попробуйте через минуту»).
- Если не загружаются фото цветов или ручек — мы проверим синхронизацию на сервере; напишите, на какой модели/экране это видно.

---

## Итоговая последовательность (копипаст)

Для быстрого прогона после первой настройки ВМ:

```powershell
cd C:\01_conf\1002doors
# 0. Переменные (один раз)
# $env:1002DOORS_SSH_KEY = "..."; $env:1002DOORS_STAGING_HOST = "ubuntu@..."

# 1. Swap (один раз)
.\scripts\vm-add-swap.ps1

# 2. .env на ВМ — проверить вручную по SSH

# 3. Деплой
.\scripts\deploy-standalone-to-vm.ps1

# 4. Фото
.\scripts\sync-uploads-to-vm.ps1

# 5. Nginx (если используется)
.\scripts\apply-nginx-to-vm.ps1

# 6. Проверка
Invoke-WebRequest -Uri "http://ВАШ_ХОСТ/api/health" -UseBasicParsing
```

Готово.
