# Снижение расхода трафика на ВМ

Типичные источники трафика на Ubuntu в Yandex Cloud:

| Источник | Что делать |
|----------|------------|
| **Snap** (snapd refresh) | Автообновление snap-пакетов (в т.ч. chromium, если ставили через snap). Сильно жрёт трафик. |
| **Unattended-upgrades** | Автоматические обновления безопасности Ubuntu (apt). |
| **apt-daily** | Ежедневный `apt update` по таймеру. |
| **Приложение** | Исходящие запросы к Yandex Object Storage (если включён бакет для фото), внешние API — обычно меньше, чем системные обновления. |

## Что сделать на ВМ

### 1. Запустить скрипт снижения трафика

С ПК (PowerShell):

```powershell
scp -i $env:USERPROFILE\.ssh\ssh-key-1771392782781\ssh-key-1771392782781 scripts/vm-reduce-traffic.sh ubuntu@84.201.160.50:~/
ssh -i $env:USERPROFILE\.ssh\ssh-key-1771392782781\ssh-key-1771392782781 ubuntu@84.201.160.50 "sudo bash ~/vm-reduce-traffic.sh"
```

Или по SSH на ВМ: скопировать содержимое `scripts/vm-reduce-traffic.sh` и выполнить `sudo bash` от имени файла.

Скрипт отключает:
- автообновление snap (snap refresh);
- автоматический apt update и unattended-upgrade.

Обновления тогда нужно делать вручную раз в месяц:  
`sudo apt update && sudo apt upgrade -y`.

### 2. Посмотреть, кто жрёт трафик

На ВМ:

```bash
# Установить vnstat (учёт трафика по интерфейсам)
sudo apt install -y vnstat
sudo vnstat -d    # по дням
sudo vnstat -h    # по часам

# В реальном времени — какой процесс сколько качает
sudo apt install -y nethogs
sudo nethogs
```

### 3. Если ставили Chromium через snap

Snap тянет обновления и зависимости. После `vm-reduce-traffic.sh` автообновление snap отключено. Для PDF лучше поставить Chrome из .deb (см. «Экспорт в PDF на ВМ» в `APPLY_SECURITY_ON_VM.md`) и при необходимости удалить snap-пакет chromium:  
`sudo snap remove chromium`.

### 4. Приложение и Yandex Storage

Если в `.env` на ВМ заданы `YANDEX_STORAGE_ACCESS_KEY_ID` и т.п., приложение может ходить в Yandex Object Storage (загрузка/скачивание файлов). Трафик зависит от того, как часто отдаются фото и документы. Кэширование на уровне Nginx или приложения снижает повторные запросы к хранилищу.
