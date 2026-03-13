# Выкат последних изменений на ВМ

Чтобы залить на ВМ все текущие правки (кромки Invisible, порог при SECRET DS, подсказка расчёта цены, орфография и т.д.):

## 1. Сборка (локально)

- **Остановите** dev-сервер (`npm run dev`), если он запущен — иначе возможна ошибка EPERM на `.next`.
- В корне проекта выполните:
  ```powershell
  npm run build
  ```
- Дождитесь сообщения о успешной сборке и появления папки `.next\standalone`.

## 2. Деплой на ВМ

- **Для хоста 89.169.181.191** нужен ключ `ssh-key-1771526730154`. Если у вас в окружении задан другой ключ, задайте явно:
  ```powershell
  $env:1002DOORS_SSH_KEY = "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154"
  ```
- Рекомендуемый способ (без передачи архива ~600 MB целиком):
  ```powershell
  .\scripts\deploy-standalone-to-vm.ps1 -AppOnly -Rsync
  ```
  Требуется **rsync** (например, установите [Git for Windows](https://git-scm.com/download/win) — в нём есть `rsync` в `C:\Program Files\Git\usr\bin`). Тогда на ВМ копируются только изменённые файлы, без большого архива.
- Если rsync недоступен:
  ```powershell
  .\scripts\deploy-standalone-to-vm.ps1 -AppOnly
  ```
  Будет создан архив и загрузка через scp. При нестабильном канале возможен обрыв (Broken pipe). При нехватке памяти на ВМ распаковка может падать (Killed) — в таком случае используйте **-Rsync** или добавьте swap на ВМ.

## 3. После деплоя (при необходимости)

- Синхронизация фото (если меняли или добавляли картинки):
  ```powershell
  .\scripts\sync-uploads-to-vm.ps1
  ```
- Перезапуск приложения на ВМ (если само не перезапустилось):
  ```powershell
  .\scripts\restart-vm-app.ps1
  ```

Подробнее: **docs/VM_APPLY_PUSHED_FILES.md**, **docs/DEPLOY_STANDALONE_ARTIFACT.md**.

---

## 4. Nginx: раздача фото с диска (обязательно после деплоя)

После деплоя кода нужно обновить конфиг Nginx на ВМ, чтобы фото раздавались **напрямую с диска** (без проксирования через Node.js). Это критично для 20+ одновременных пользователей.

### Что добавить/изменить в `/etc/nginx/sites-available/domeo`

```nginx
# Фото: Nginx раздаёт с диска, fallback на Node если файл не найден.
# alias — путь к public/uploads/ в директории приложения.
location /uploads/ {
    alias /home/ubuntu/domeo-app/public/uploads/;
    try_files $uri @node_uploads;
    expires 30d;
    add_header Cache-Control "public, max-age=2592000";
    access_log off;
}
location @node_uploads {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    add_header Cache-Control "public, max-age=604800";
}

# /api/uploads/ — без rate-limit, с кэшированием
location /api/uploads/ {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    add_header Cache-Control "public, max-age=604800";
}
```

### Также в блоке rate limiting

- **Убрать** zone `uploads` (фото с диска не нужно лимитировать).
- **Поднять** zone `api`: `rate=30r/s`, `burst=60 nodelay` (было 10r/s, burst=20).

### Применить

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### Путь alias зависит от расположения приложения

| Расположение приложения | alias |
|---|---|
| `~/domeo-app/` | `/home/ubuntu/domeo-app/public/uploads/` |
| `~/1002doors/` | `/home/ubuntu/1002doors/public/uploads/` |
| Docker (`./uploads:/app/uploads`) | `/usr/share/nginx/uploads/` (нужен volume в docker-compose) |

### Что даёт эта настройка

- Nginx раздаёт файлы через `sendfile` (zero-copy) — на порядок быстрее, чем Node.js
- Node.js полностью разгружен от раздачи статики
- Кэширование 30 дней — повторные визиты не создают запросов к серверу
- Нет rate-limit на статику — 20+ пользователей грузят фото без 503
