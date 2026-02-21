# Аудит и настройка ВМ — единый цикл

Документ объединяет результаты аудита и фиксирует один предсказуемый цикл работы с приложением на ВМ **89.169.181.191** (каталог `~/domeo-app`).

---

## Итоги аудита

### Сборка и деплой
- **Next.js:** `output: 'standalone'` включается при `NODE_ENV=production` или `NODE_ENV=staging` или `NEXT_BUILD_ARTIFACT=1`. Деплой-скрипт ставит `NODE_ENV=production` перед `npm run build` — сборка создаёт `.next/standalone` с `server.js`.
- **На ВМ** приложение должно работать либо из **standalone** (результат деплоя), либо в режиме **next dev** (после синхронизации исходников). Смешивать нельзя: если на ВМ только исходники без production-сборки, `node server.js` падает с «Could not find a production build».

### Скрипты (единая точка входа)
| Задача | Команда (ПК, из корня) |
|--------|------------------------|
| **Production на ВМ (полный цикл)** | `.\scripts\deploy-standalone-to-vm.ps1 -AppOnly` |
| **Перезапуск production** | `.\scripts\restart-vm-app.ps1` (сначала systemd, при отсутствии — nohup node server.js) |
| **Dev на ВМ** | `.\scripts\stop-vm-production.ps1` → `.\scripts\start-vm-dev.ps1` или один раз `.\scripts\sync-and-run-vm.ps1` |
| **Диагностика 502** | `.\scripts\diagnose-502-on-vm.ps1` |
| **Проверка SSH и порта** | `.\scripts\verify-vm-steps.ps1` или `-CheckPort` |
| **Nginx** | `.\scripts\apply-nginx-to-vm.ps1` |

### Требования к ВМ
1. **Каталог:** `~/domeo-app` (для пользователя ubuntu = `/home/ubuntu/domeo-app`). В `scripts/output/domeo-nginx.conf` пути зашиты под этот каталог; при другом пути конфиг нужно править вручную.
2. **.env:** Обязательны `DATABASE_URL`, `JWT_SECRET`. `DATABASE_URL` должен указывать на хост, **доступный с ВМ** (иначе таймауты и падения с 502).
3. **Systemd (production):** Юнит `domeo-standalone` запускает `node server.js` из `~/domeo-app` с `EnvironmentFile=~/domeo-app/.env`. Настройка один раз — см. docs/DEPLOY_STANDALONE_ARTIFACT.md.

### Защита от падений в dev
- В режиме **next dev** на ВМ при таймауте к БД (ETIMEDOUT/ECONNREFUSED) процесс раньше падал и возникал 502. Добавлен **instrumentation.ts**: в `NODE_ENV=development` такие ошибки логируются, но процесс не завершается. Остальные необработанные исключения по-прежнему роняют приложение.

---

## Полный цикл: первый запуск и ежедневная работа

### Вариант A: только production на ВМ
1. Один раз на ВМ: Node.js 20+, каталог `~/domeo-app`, файл `.env`, systemd-юнит `domeo-standalone`, Nginx (см. VM_STEP_BY_STEP.md, части A и B).
2. С ПК: `.\scripts\deploy-standalone-to-vm.ps1 -AppOnly` (сборка локально, загрузка на ВМ, распаковка, миграции, перезапуск).
3. Открыть http://89.169.181.191 (или ваш IP). При правках кода — повторить п.2 или только `.\scripts\restart-vm-app.ps1` после ручного обновления файлов.

### Вариант B: dev на ВМ для быстрых правок
1. Остановить production: `.\scripts\stop-vm-production.ps1`.
2. Синхронизация и запуск dev: `.\scripts\sync-and-run-vm.ps1` (или по шагам: sync → npm install на ВМ → apply nginx → start-vm-dev).
3. Открыть http://89.169.181.191. Локальные правки подтягивать через `.\scripts\push-one-file-to-vm.ps1 app\...`.
4. По окончании правок — снова production: локально `npm run build`, затем `.\scripts\deploy-standalone-to-vm.ps1 -AppOnly`.

### 502 Bad Gateway
- Обычно значит: на порту 3000 ничего не слушает (процесс не запущен или упал).
- Запустить: `.\scripts\diagnose-502-on-vm.ps1` — вывод покажет порт, логи, systemd. Далее: production — `.\scripts\restart-vm-app.ps1` или полный деплой; dev — `.\scripts\start-vm-dev.ps1`.
- Подробнее: раздел «502 Bad Gateway — что делать» в VM_STEP_BY_STEP.md.

---

## Переменные окружения (ПК)

При необходимости задать до запуска скриптов:
- `1002DOORS_SSH_KEY` — путь к приватному ключу SSH.
- `1002DOORS_STAGING_HOST` — например `ubuntu@89.169.181.191`.
- `1002DOORS_STAGING_REMOTE_PATH` — например `~/domeo-app`.

По умолчанию скрипты используют `ubuntu@89.169.181.191` и `~/domeo-app`.
