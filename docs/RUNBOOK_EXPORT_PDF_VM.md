# Экспорт PDF/Excel на ВМ: 502 и 500

## Причины

- **502 Bad Gateway** — Nginx обрывает запрос по таймауту (генерация PDF занимает 30–90 с) или Node падает при запуске Chromium.
- **500 Internal Server Error** — в приложении: Chromium не найден, неверный `PUPPETEER_EXECUTABLE_PATH` или ошибка snap/cgroup при запуске под systemd.

## Важно: Ubuntu 22.04+

На **Ubuntu 22.04 и новее** пакет `chromium-browser` из apt — это **переходный пакет**: ставится только snap, а `/usr/bin/chromium-browser` становится **скриптом-обёрткой** (запускает snap). Puppeteer при этом падает (snap/cgroup). Нужен **реальный бинарник** Chrome/Chromium.

**Рекомендуемый способ:** установить **Google Chrome из .deb** (скрипт `setup-vm-chromium.ps1`). В `.env` тогда: `PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable`.

## Что сделано в репозитории

1. **Nginx** (`scripts/output/domeo-nginx.conf`): для `location /api/export/` заданы таймауты **300 с** и увеличены буферы. После обновления конфига на ВМ: `.\scripts\apply-nginx-to-vm.ps1`.
2. **Код** (`lib/export/puppeteer-executable.ts`): путь из `.env` и стандартные пути на Linux проверяются на «скрипт vs бинарник»; скрипты (например обёртка chromium-browser) игнорируются, используется только реальный исполняемый файл.

## Как починить одной командой (рекомендуется для Ubuntu 22+)

С ПК (PowerShell из корня репозитория):

```powershell
$env:1002DOORS_SSH_KEY = "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154"
.\scripts\setup-vm-chromium.ps1
```

Скрипт: останавливает приложение → при необходимости создаёт swap → ставит **Google Chrome .deb** → обновляет `PUPPETEER_EXECUTABLE_PATH` в `.env` → перезапускает приложение.

## Варианты установки браузера

| Способ | Скрипт | Когда использовать |
|--------|--------|---------------------|
| **Google Chrome .deb** | `.\scripts\setup-vm-chromium.ps1` | **Рекомендуется** для Ubuntu 22.04+ (реальный бинарник). |
| Chromium из apt | `.\scripts\vm-fix-pdf-export.ps1` | Только если на ВМ старая Ubuntu (до 22), где apt ставит настоящий chromium. |

## Почему снова перестало работать

Экспорт PDF «вчера починили, сегодня снова не работает» — типично по одной из причин:

1. **Перезаписан `.env`**  
   Скрипт первичной настройки ВМ (`setup-new-vm.ps1`) создаёт `~/domeo-app/.env` **без** `PUPPETEER_EXECUTABLE_PATH`. Если настройку запускали заново (новая ВМ, «чистая установка») или вручную пересоздали `.env` — переменная пропадает. **Что делать:** снова выполнить `.\scripts\setup-vm-chromium.ps1` (он допишет/обновит строку в `.env`).

2. **Два каталога приложения**  
   В скриптах используются и `~/domeo-app`, и `~/1002doors`. Приложение читает `.env` из текущего каталога запуска и из `~/domeo-app`, `~/1002doors`. Если приложение запущено из `~/1002doors`, а правки вносили в `~/domeo-app/.env` (или наоборот) — переменная не подхватится. **Что делать:** добавить `PUPPETEER_EXECUTABLE_PATH=...` в тот `.env`, из чьего каталога реально стартует приложение (и перезапустить его).

3. **Ubuntu 22+: в `.env` указан скрипт, а не бинарник**  
   На Ubuntu 22+ пакет `chromium-browser` из apt — это обёртка над snap; `/usr/bin/chromium-browser` — скрипт (`#!`). Код специально **игнорирует** такие пути и требует реальный исполняемый файл. Если вручную прописали `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser` и там скрипт — экспорт будет падать. **Что делать:** поставить Chrome из .deb: `.\scripts\setup-vm-chromium.ps1` и в `.env` будет `/usr/bin/google-chrome-stable`.

4. **Chromium/Chrome удалён с ВМ**  
   Обновления, очистка snap (`snap remove chromium`) или ручное удаление пакетов. **Что делать:** заново установить браузер: `.\scripts\setup-vm-chromium.ps1`.

Чтобы починка не терялась: после любой первичной настройки ВМ или пересоздания `.env` снова запускать `.\scripts\setup-vm-chromium.ps1` и перезапускать приложение.

## Проверка на ВМ

```bash
# В .env должен быть путь к бинарнику (не к скрипту)
grep PUPPETEER ~/domeo-app/.env
# Если приложение из ~/1002doors — то и там:
grep PUPPETEER ~/1002doors/.env

# Должен быть реальный бинарник (не "ASCII text" / скрипт)
file /usr/bin/google-chrome-stable

# Перезапуск приложения
sudo systemctl restart domeo-standalone
# или для dev: перезапустить next dev (см. start-vm-dev.ps1)
```

После этого снова вызвать экспорт КП/Счета (api/export/fast).
