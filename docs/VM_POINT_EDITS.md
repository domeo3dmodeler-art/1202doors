# Точечные правки на ВМ (89.169.181.191)

## Варианты (от быстрого к надёжному)

### 1. Быстрый цикл: на ВМ работает `next dev` (рекомендуется для частых правок)

Если на ВМ развёрнут **полный репо** и запущен `npm run dev`, правка занимает **секунды**:

1. Меняете файл локально.
2. Копируете один файл на ВМ:
   ```powershell
   .\scripts\push-one-file-to-vm.ps1 app\api\catalog\hardware\route.ts
   ```
3. Next на ВМ сам пересобирает изменённый модуль (hot reload).

**Один раз настроить на ВМ:** запустить скрипт (проверка SSH, синхронизация кода при наличии rsync, `npm install`, запуск `next dev`):
   ```powershell
   .\scripts\setup-vm-fast-edits.ps1
   ```
   Если репо уже на ВМ: `.\scripts\setup-vm-fast-edits.ps1 -SkipSync`. Только запустить dev: `.\scripts\start-vm-dev.ps1`. Nginx должен проксировать на порт 3000. Подробнее: раздел «Режим dev на ВМ» ниже.

**Переменные:** `1002DOORS_SSH_KEY`, `1002DOORS_STAGING_HOST`, `1002DOORS_STAGING_REMOTE_PATH` (каталог проекта на ВМ, по умолчанию `~/domeo-app`).

---

### 2. Standalone (production): сборка + rsync

На ВМ развёрнут **standalone** — нет исходников, только сборка. Каждая правка = полная сборка локально (~3–7 мин) + rsync дельты:

```powershell
.\scripts\deploy-standalone-to-vm.ps1 -AppOnly -Rsync
```

Узкое место — `npm run build`, не заливка. Rsync отправляет только изменённые файлы.

---

### 3. CI/CD (без ожидания на своей машине)

Сборка в CI (GitHub Actions и т.п.), деплой артефакта на ВМ по пушу в ветку. Локально ничего не собираете; время «правки» = push + время пайплайна.

---

## Режим dev на ВМ (одноразовая настройка)

Чтобы пользоваться вариантом 1 (push одного файла):

**Скрипты с локальной машины:**
- `.\scripts\sync-full-sources-to-vm.ps1` — залить полное дерево исходников (app, lib, prisma, public, config) на ВМ без rsync (tar + scp). Нужен один раз, чтобы на ВМ был полный репо для next dev. См. `docs/VM_APP_STRUCTURE.md`.
- `.\scripts\setup-vm-fast-edits.ps1` — проверка SSH, синхронизация (rsync или sync-full-sources), `npm install` на ВМ, запуск `next dev`. Флаги: `-SkipSync`, `-SkipStart`. Если при `npm install` по SSH соединение обрывается — выполните `npm install` прямо на ВМ (в screen/tmux).
- `.\scripts\start-vm-dev.ps1` — только запуск `next dev` на ВМ.
- `.\scripts\push-one-file-to-vm.ps1 <путь>` — копирование одного файла на ВМ; Next пересоберёт за секунды.

**Вручную на ВМ (если не используете setup):**
1. В домашнем каталоге: `git clone <репо> domeo-app` (или скопировать проект), `cd domeo-app`, `npm install`, создать `.env`.
2. Запуск: `npm run dev` или через pm2: `pm2 start npm --name domeo-dev -- run dev`. Либо с локальной машины: `.\scripts\start-vm-dev.ps1`.
3. Nginx: проксирование на `http://127.0.0.1:3000`.

После настройки для любой правки: правка файла локально → `.\scripts\push-one-file-to-vm.ps1 <путь к файлу>`.

---

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| `1002DOORS_SSH_KEY` | Путь к SSH-ключу |
| `1002DOORS_STAGING_HOST` | Хост (по умолчанию `ubuntu@89.169.181.191`) |
| `1002DOORS_STAGING_REMOTE_PATH` | Каталог проекта на ВМ для push-one-file (по умолчанию `~/domeo-app`) |
