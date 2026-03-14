# Настройка rsync для деплоя на ВМ

Чтобы на ВМ менялись **только нужные файлы** (код приложения), без перезаписи `.env` и без удаления `public/uploads`, используется rsync с правильными исключениями и защитой.

## 1. Установка rsync (Windows)

**Вариант A — Git for Windows**  
Установите [Git for Windows](https://git-scm.com/download/win). Rsync будет в:
```text
C:\Program Files\Git\usr\bin\rsync.exe
```
Добавьте эту папку в PATH или задайте переменную:
```powershell
$env:1002DOORS_RSYNC_PATH = "C:\Program Files\Git\usr\bin\rsync.exe"
```

**Вариант B — WSL**  
Если установлен WSL с rsync:
```bash
sudo apt install -y rsync
```
Скрипт сам подхватит `wsl rsync`.

## 2. Запуск деплоя через rsync

После сборки (`npm run build`):

```powershell
$env:1002DOORS_SSH_KEY = "C:\Users\petr2\.ssh\ssh-key-1773410153319\ssh-key-1773410153319"
.\scripts\deploy-standalone-to-vm.ps1 -SkipBuild -AppOnly -Rsync
```

- **-AppOnly** — в синхронизацию не входит `public/uploads` (фото остаются те, что уже на ВМ).
- **-Rsync** — передаются только изменённые файлы, без одного большого архива.

## 3. Что именно меняется на ВМ

| На ВМ | Действие |
|-------|----------|
| Код приложения (server.js, .next/, node_modules/ из standalone, prisma/) | Обновляется по содержимому локального standalone (только изменённые файлы). |
| Файлы, удалённые в новом билде | Удаляются на ВМ (флаг `--delete`), **кроме** защищённых. |
| **.env** | **Не передаётся и не удаляется** (исключён + фильтр `P .env`). |
| **public/uploads** (при -AppOnly) | **Не передаётся и не удаляется** (исключён + фильтр `P public/uploads/`). |

Используемые опции rsync:
- `--exclude=.env`, `--exclude=public/uploads` — не копировать с локальной машины.
- `--filter=P .env`, `--filter=P public/uploads/` — при `--delete` **не удалять** эти пути на ВМ.
- `--times` — обновлять только по времени изменения (быстрее).
- `--no-perms`, `--no-owner`, `--no-group` — не менять права/владельца (удобно при синке с Windows на Linux).

В итоге на ВМ обновляется только то, что относится к новому билду приложения; конфиг и загруженные фото не трогаются.
