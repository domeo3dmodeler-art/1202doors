# Фото на ВМ: 502 и 404

Кратко: что сделано в коде и что проверить на ВМ, чтобы фото ручек/дверей/наличников отображались без 502 и лишних 404.

## Что исправлено в репозитории

### 1. 404 на `/data/mockups/ruchki/...`

Раньше при отсутствии фото ручки в API фронт запрашивал `/data/mockups/ruchki/Имя_ручки.png`. На ВМ этой папки часто нет → 404.

**Сделано:** для ручек без фото используется единый плейсхолдер `/placeholder-handle.svg` (файл в `public/`). Запросы к `/data/mockups/ruchki/` для выбора ручки больше не выполняются.

### 2. 404 на путях с кириллицей и Unicode

Часть 404 была из‑за разной нормализации Unicode (NFC/NFD) и пробелов в именах файлов.

**Сделано:** в `app/api/uploads/[...path]/route.ts` добавлены fallback’и при отсутствии файла по точному пути:
- попытка по пути с именем файла в форме NFD (для файлов, сохранённых в NFD на диске);
- попытка с заменой пробелов в имени на подчёркивания.

### 3. 502 при запросах к `/uploads/` и `/api/uploads/`

При массовой загрузке картинок Node может долго обрабатывать fallback (readdir и т.п.). При коротких таймаутах Nginx отдавал 502.

**Сделано:** в `scripts/output/domeo-nginx.conf` для `@backend_uploads` и `location /api/uploads/` увеличены таймауты до 60 с (`proxy_read_timeout`, `proxy_send_timeout`).

## Что сделать на ВМ после обновления кода

1. **Задеплоить приложение**  
   Обычный деплой (standalone или dev). Новые `image-src`, API uploads и `public/placeholder-handle.svg` попадут на ВМ с билдом/синхронизацией.

2. **Применить конфиг Nginx**  
   Чтобы вступили в силу увеличенные таймауты:
   ```powershell
   .\scripts\apply-nginx-to-vm.ps1
   ```

3. **Синхронизировать фото**  
   Чтобы по путям `/uploads/final-filled/...` находились файлы (и Nginx по `try_files` отдавал их с диска, не нагружая Node):
   ```powershell
   .\scripts\sync-uploads-to-vm.ps1
   ```

4. **Проверить каталог uploads на ВМ**  
   В конфиге Nginx для `location /uploads/` задан `root /home/ubuntu/domeo-app/public`. Убедитесь, что после sync в `~/domeo-app/public/uploads/` есть нужные папки (например `final-filled/04_Ручки_Завертки`, `final-filled/doors`, наличники и т.д.).

## Если 502 всё ещё появляются

- Убедиться, что приложение на ВМ запущено и слушает порт 3000: `.\scripts\vm-diagnose-502.sh` (или вручную: `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/api/health`).
- Посмотреть логи приложения и Nginx на ВМ (error.log, логи Node).
- При необходимости ещё увеличить таймауты в `scripts/output/domeo-nginx.conf` для `@backend_uploads` и `/api/uploads/`, затем снова `apply-nginx-to-vm.ps1`.
