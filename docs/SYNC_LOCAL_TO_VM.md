# Синхронизация разработки: локально → ВМ

Один поток: правите код локально, быстро применяете на ВМ и смотрите результат в браузере.

**Сделать всё по шагам с нуля:** **[VM_STEP_BY_STEP.md](VM_STEP_BY_STEP.md)** — пошаговая настройка ПК и ВМ с проверкой после каждого шага.

---

## Что нужно один раз

### На вашем ПК (Windows)

1. **SSH-ключ** — путь в переменной или по умолчанию:
   - `$env:1002DOORS_SSH_KEY = "C:\Users\petr2\.ssh\ssh-key-1771526730154\ssh-key-1771526730154"`
2. **Хост ВМ** (если не 89.169.181.191):
   - `$env:1002DOORS_STAGING_HOST = "ubuntu@IP_ВМ"`
3. **Путь на ВМ** (если не ~/domeo-app):
   - `$env:1002DOORS_STAGING_REMOTE_PATH = "~/domeo-app"`
4. Для быстрого sync желательно **rsync** (ставится с [Git for Windows](https://git-scm.com)).

### На ВМ

1. **Node.js 20** (или 18+), **npm**.
2. В каталоге приложения файл **.env** с `DATABASE_URL`, `JWT_SECRET` и при необходимости `PUPPETEER_EXECUTABLE_PATH`.  
   (Скрипты синхронизации .env не трогают — не перезаписывают.)
3. **Nginx** — конфиг применяется скриптом `apply-nginx-to-vm.ps1` (входит в полный цикл ниже).

---

## Ежедневный workflow

### Вариант A: один скрипт (рекомендуется)

Из корня проекта в PowerShell:

```powershell
.\scripts\sync-and-run-vm.ps1
```

Скрипт по очереди:

1. Проверяет SSH.
2. Останавливает production на ВМ (освобождает порт 3000).
3. Синхронизирует исходники (rsync, если есть, иначе tar+scp).
4. Запускает `npm install` на ВМ (при первом развёртывании или после смены зависимостей).
5. Применяет Nginx.
6. Запускает на ВМ `next dev` в фоне.

После этого открываете в браузере **http://89.169.181.191** (или IP вашей ВМ).

**Флаги:**

- `.\scripts\sync-and-run-vm.ps1 -SyncOnly` — только синхронизация, без install и без запуска dev.
- `.\scripts\sync-and-run-vm.ps1 -NoInstall` — sync + start dev без `npm install` (если зависимости не менялись).
- `.\scripts\sync-and-run-vm.ps1 -NoNginx` — не трогать Nginx (если уже настроен).

### Вариант B: по шагам

Если нужно контролировать каждый шаг:

```powershell
.\scripts\stop-vm-production.ps1
.\scripts\sync-to-vm.ps1                    # или sync-full-sources-to-vm.ps1, если нет rsync
.\scripts\apply-nginx-to-vm.ps1             # при необходимости
.\scripts\start-vm-dev.ps1
```

На ВМ при первом развёртывании или после смены package.json в screen/tmux:

```bash
cd ~/domeo-app && npm install --include=dev
```

---

## Быстрые правки после sync

1. Меняете файл локально (в Cursor/IDE).
2. Копируете его на ВМ:

   ```powershell
   .\scripts\push-one-file-to-vm.ps1 app\api\catalog\hardware\route.ts
   ```

   Путь — **от корня проекта**, с обратными слэшами в PowerShell.
3. Next dev на ВМ пересобирает за несколько секунд; обновляете страницу в браузере.

Примеры:

```powershell
.\scripts\push-one-file-to-vm.ps1 lib\configurator\image-src.ts
.\scripts\push-one-file-to-vm.ps1 app\doors\page.tsx
.\scripts\push-one-file-to-vm.ps1 next.config.mjs
```

---

## Если что-то пошло не так

| Проблема | Что сделать |
|----------|-------------|
| **502 Bad Gateway** | На ВМ порт 3000 не слушает или процесс упал. Проверить: `ss -tlnp \| grep 3000`, `tail -50 ~/domeo-app/logs/next-dev.log`. Заново: `.\scripts\stop-vm-production.ps1`, затем `.\scripts\start-vm-dev.ps1`. |
| **SSH failed** | Проверить ключ (`1002DOORS_SSH_KEY`), IP/хост (`1002DOORS_STAGING_HOST`), доступность ВМ (firewall, сеть). |
| **npm install на ВМ обрывается** | Запустить на ВМ в **screen**: `screen -S dev`, `cd ~/domeo-app`, `npm install --include=dev`. При OOM: добавить swap или `npm install --ignore-scripts`, затем `npx prisma generate`. |
| **Страница пустая / нет стилей** | В `next.config.mjs` должен быть `allowedDevOrigins` с IP ВМ. После правки конфига — снова sync и перезапуск dev. Nginx применить: `.\scripts\apply-nginx-to-vm.ps1`. |
| **rsync not found** | Установить Git for Windows или вызывать только `.\scripts\sync-and-run-vm.ps1` — он при отсутствии rsync использует полную синхронизацию (tar+scp). |

Подробнее: **docs/VM_DEV_MODE.md**, **docs/VM_APPLY_PUSHED_FILES.md**.

---

## Переход обратно на production

Когда закончите итерации и нужно поднять на ВМ готовый билд:

1. Локально: `npm run build`
2. Деплой: `.\scripts\deploy-standalone-to-vm.ps1 -AppOnly`
3. При необходимости: `.\scripts\sync-uploads-to-vm.ps1`, `.\scripts\restart-vm-app.ps1`

На ВМ снова будет работать `node server.js` (standalone), порт 3000 займёт production.
