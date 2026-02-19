# Применение мер безопасности на ВМ

Пошагово: деплой приложения с усиленной защитой и настройка ВМ (Nginx + Fail2ban).

---

## Что делаем

1. **В коде (уже внесено):** глобальный rate limit на все API, CORS по origin в production, cookie httpOnly/secure, security headers, закрыт /api/test-env в production.
2. **Деплой:** собираем и загружаем приложение на ВМ (standalone).
3. **На ВМ:** ставим Nginx (reverse proxy с лимитами) и Fail2ban (бан по логам).
4. **В Yandex Cloud:** в группе безопасности открываем порт 80, закрываем 3000 снаружи (трафик только через Nginx).

---

## Шаг 1. Деплой приложения на ВМ

С вашего ПК (из корня проекта). Сначала убедитесь, что `NODE_ENV` не установлен в `production` в текущей сессии (иначе `npm ci` не поставит devDependencies и сборка упадёт):

```powershell
$env:NODE_ENV = ""
$env:1002DOORS_SSH_KEY = "C:\Users\petr2\.ssh\ssh-key-1771392782781\ssh-key-1771392782781"
$env:1002DOORS_STAGING_HOST = "ubuntu@84.201.160.50"
npm run deploy:standalone
```

Если SSH ещё не работает — восстановите доступ по [VM_SSH_AND_TRAFFIC_ISSUES.md](./VM_SSH_AND_TRAFFIC_ISSUES.md) и добавьте ключ в метаданные ВМ.

---

## Шаг 2. Применить настройки безопасности на ВМ

### Вариант A: одной командой с ПК (PowerShell)

Скрипт загрузит `vm-security-setup.sh` на ВМ и выполнит его под sudo:

```powershell
.\scripts\apply-vm-security.ps1
```

Убедитесь, что переменные `1002DOORS_SSH_KEY` и `1002DOORS_STAGING_HOST` заданы (как в шаге 1).

### Вариант B: вручную по SSH

1. Подключитесь к ВМ:
   ```bash
   ssh -i "C:\Users\petr2\.ssh\ssh-key-1771392782781\ssh-key-1771392782781" ubuntu@84.201.160.50
   ```

2. Скопируйте содержимое `scripts/vm-security-setup.sh` в файл на ВМ и выполните:
   ```bash
   sudo bash vm-security-setup.sh
   ```

   Либо с ПК скопируйте файл и запустите:
   ```powershell
   scp -i $env:1002DOORS_SSH_KEY scripts/vm-security-setup.sh ${env:1002DOORS_STAGING_HOST}:~/
   ssh -i $env:1002DOORS_SSH_KEY $env:1002DOORS_STAGING_HOST "sudo bash ~/vm-security-setup.sh"
   ```

---

## Шаг 3. Группа безопасности Yandex Cloud

1. Консоль Yandex Cloud → VPC → Группы безопасности → группа вашей ВМ.
2. **Входящие правила:**
   - **Порт 80 (HTTP):** добавить правило, источник — ваш IP или 0.0.0.0/0 (если нужен доступ с любого IP; лучше ограничить своим IP).
   - **Порт 3000:** удалить правило с источником 0.0.0.0/0 или не добавлять. Приложение остаётся слушать 3000 локально; снаружи доступ только через Nginx на 80.
   - **Порт 22 (SSH):** оставить только ваш IP.

После этого трафик к приложению идёт только через Nginx (лимиты, логи), сканеры по 3000 снаружи не достают.

---

## Шаг 4. Проверка

- Открыть в браузере: `http://<IP_ВМ>` (порт 80). Должна открыться страница приложения.
- Health: `http://<IP_ВМ>/api/health` — ответ 200 и JSON.
- Прямой доступ по порту 3000 снаружи после закрытия правила — недоступен.

На ВМ:

```bash
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:80/api/health
# Ожидается 200
sudo systemctl status nginx fail2ban
```

---

## Если приложение слушает только 0.0.0.0:3000

Текущий standalone слушает `0.0.0.0:3000` (доступ с любого интерфейса). Nginx на той же ВМ обращается к `127.0.0.1:3000` — это работает. Снаружи порт 3000 закрываем в группе безопасности, поэтому доступ только через 80 → Nginx → 3000.

---

## Экспорт в PDF на ВМ

Для экспорта счёта/КП в PDF на ВМ нужен Chrome или Chromium (**не** из snap — snap не запускается из systemd).

**Рекомендуемый способ — Google Chrome (.deb):**

1. На **вашем ПК** скачайте установщик:
   - https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb

2. Скопируйте на ВМ и установите (PowerShell с ПК):
   ```powershell
   scp -i $env:USERPROFILE\.ssh\ssh-key-1771392782781\ssh-key-1771392782781 google-chrome-stable_current_amd64.deb ubuntu@84.201.160.50:~/
   ssh -i $env:USERPROFILE\.ssh\ssh-key-1771392782781\ssh-key-1771392782781 ubuntu@84.201.160.50 "sudo apt install -y ./google-chrome-stable_current_amd64.deb"
   ```

3. Перезапустите приложение на ВМ:
   ```bash
   sudo systemctl restart domeo-staging
   ```
   Переменная `PUPPETEER_EXECUTABLE_PATH` не нужна — приложение само ищет `/usr/bin/google-chrome-stable`.

Если Chrome установлен в другое место, задайте в `~/1002doors/.env`:  
`PUPPETEER_EXECUTABLE_PATH=/путь/к/chrome`

---

## Краткий чеклист

- [ ] SSH на ВМ работает, ключ добавлен в метаданные ВМ.
- [ ] Выполнен `npm run deploy:standalone`.
- [ ] На ВМ выполнен `sudo bash vm-security-setup.sh` (или `.\scripts\apply-vm-security.ps1` с ПК).
- [ ] В группе безопасности открыт порт 80, порт 3000 закрыт для 0.0.0.0/0.
- [ ] Проверка: `http://<IP_ВМ>/api/health` по порту 80 возвращает 200.
