#!/bin/bash
# Диагностика фото ручек на ВМ. Запуск на ВМ: bash vm-diagnose-handle-photos.sh
# Или с хоста: ssh ubuntu@89.169.181.191 'bash -s' < scripts/vm-diagnose-handle-photos.sh

set -e
APP_DIR="${1:-$HOME/domeo-app}"
UPLOADS="$APP_DIR/public/uploads"
FF="$UPLOADS/final-filled"

echo "=== 1. Папки в public/uploads/final-filled ==="
if [ ! -d "$FF" ]; then
  echo "Папки $FF нет."
else
  ls -la "$FF"
fi

echo ""
echo "=== 2. Ожидаемая папка ручек: 04_Ручки_Завертки ==="
HANDLES="$FF/04_Ручки_Завертки"
if [ -d "$HANDLES" ]; then
  echo "Есть. Файлов в ней: $(find "$HANDLES" -maxdepth 1 -type f 2>/dev/null | wc -l)"
  echo "Примеры файлов:"
  ls "$HANDLES" 2>/dev/null | head -5
else
  echo "Нет. Ищем папки, похожие на ручки (04_*):"
  ls -d "$FF"/04_* 2>/dev/null || true
fi

echo ""
echo "=== 3. Проверка API (один запрос к приложению) ==="
# Порт 3000 может быть закрыт; пробуем через nginx на 80
SAMPLE="handle_ROCKET_NM_main.png"
if [ -d "$HANDLES" ]; then
  SAMPLE=$(ls "$HANDLES"/handle_*_main.* 2>/dev/null | head -1)
  SAMPLE=$(basename "$SAMPLE")
fi
URL_PATH="final-filled/04_Ручки_Завертки/$SAMPLE"
echo "Запрос: GET /api/uploads/$URL_PATH"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "http://127.0.0.1:3000/api/uploads/$URL_PATH" 2>/dev/null || true)
if [ -z "$STATUS" ] || [ "$STATUS" = "000" ]; then
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 2 "http://127.0.0.1:80/api/uploads/$URL_PATH" 2>/dev/null || true)
  if [ -n "$STATUS" ] && [ "$STATUS" != "000" ]; then
    echo "Ответ: HTTP $STATUS (проверка через localhost:80, порт 3000 закрыт)"
  else
    echo "Ответ: приложение недоступно (3000 закрыт, 80 не ответил)"
  fi
else
  echo "Ответ: HTTP $STATUS"
fi

echo ""
echo "=== 4. Готово. По результатам: 404 -> проверить имя папки и resolveHandlesDir; нет папки -> синхронизировать uploads. ==="
