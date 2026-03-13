#!/bin/bash
# Проверка на ВМ: заказы (orders), история document_history, логи удаления.
# Запуск на ВМ из каталога приложения (где есть .env с DATABASE_URL):
#   cd ~/domeo-app && bash -s < /path/to/vm-order-history-check.sh
# Или с хоста: ssh ubuntu@<VM> 'cd ~/domeo-app && bash -s' < scripts/vm-order-history-check.sh
# Требуется: psql или возможность выполнить SQL (например через node + prisma).

set -e
APP_DIR="${1:-$HOME/domeo-app}"
cd "$APP_DIR" || { echo "Каталог не найден: $APP_DIR"; exit 1; }

# Загрузка .env для DATABASE_URL
if [ -f .env ]; then
  set -a
  source ./.env 2>/dev/null || true
  set +a
fi

export PGPASSWORD="${DB_PASSWORD:-}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-domeo_production}"
DB_USER="${DB_USER:-domeo_user}"

# Если DATABASE_URL задан, используем его для psql (поддержка ?schema= и т.д.)
if [ -n "$DATABASE_URL" ]; then
  if [[ "$DATABASE_URL" =~ postgresql://([^:]+):([^@]*)@([^:/]+):([0-9]+)/([^?]+) ]]; then
    DB_USER="${BASH_REMATCH[1]}"
    PGPASSWORD="${BASH_REMATCH[2]}"
    DB_HOST="${BASH_REMATCH[3]}"
    DB_PORT="${BASH_REMATCH[4]}"
    DB_NAME="${BASH_REMATCH[5]}"
  fi
fi

# psql: по возможности по URL, иначе по отдельным параметрам
if [ -n "$DATABASE_URL" ]; then
  PSQL_CMD="psql \"$DATABASE_URL\" -t -A"
else
  PSQL_CMD="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -t -A"
fi

run_sql() {
  if command -v psql >/dev/null 2>&1; then
    $PSQL_CMD "$@" 2>/dev/null || echo "[psql недоступен или ошибка]"
  else
    echo "[psql не установлен — установите postgresql-client или выполните SQL вручную]"
  fi
}

echo "=============================================="
echo "Проверка заказов и истории на ВМ"
echo "=============================================="
echo "Каталог: $APP_DIR"
echo "БД: $DB_HOST:$DB_PORT/$DB_NAME"
echo ""

echo "--- 1. Количество заказов (orders) ---"
run_sql -c "SELECT COUNT(*) FROM orders;"
echo ""

echo "--- 2. Последние 20 заказов (id, number, status, created_at) ---"
run_sql -c "SELECT id, number, status, created_at FROM orders ORDER BY created_at DESC LIMIT 20;"
echo ""

echo "--- 3. Счета (invoices) с order_id — связь заказ↔счёт ---"
run_sql -c "SELECT i.id, i.number, i.order_id, i.status, i.created_at FROM invoices i WHERE i.order_id IS NOT NULL ORDER BY i.created_at DESC LIMIT 15;"
echo ""

echo "--- 4. «Сироты»: счета с order_id, которого нет в orders ---"
run_sql -c "SELECT i.id, i.number, i.order_id FROM invoices i WHERE i.order_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = i.order_id);"
echo ""

echo "--- 5. Заказы с invoice_id, которого нет в invoices ---"
run_sql -c "SELECT o.id, o.number, o.invoice_id FROM orders o WHERE o.invoice_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.id = o.invoice_id);"
echo ""

echo "--- 6. Последние записи document_history (document_id, action, user_id, created_at) ---"
echo "    (для удалённых заказов записей уже нет — история удаляется до удаления документа)"
run_sql -c "SELECT document_id, action, user_id, created_at FROM document_history ORDER BY created_at DESC LIMIT 25;"
echo ""

echo "--- 7. Логи приложения: последние строки с удалением документа ---"
LOG_FILE="$APP_DIR/logs/server.log"
JOURNAL="journalctl -u domeo-standalone --no-pager -n 500 2>/dev/null"
if [ -f "$LOG_FILE" ]; then
  echo "Поиск в $LOG_FILE по фразам: удален пользователем, DELETE, documents/[id]/DELETE"
  grep -E "удален пользователем|documents/\[id\]/DELETE|Заказ успешно удален" "$LOG_FILE" 2>/dev/null | tail -30 || echo "Совпадений не найдено или файл недоступен."
else
  echo "Файл $LOG_FILE не найден."
fi
if systemctl is-active domeo-standalone >/dev/null 2>&1; then
  echo ""
  echo "Журнал systemd (domeo-standalone), последние строки с удалением:"
  $JOURNAL | grep -E "удален пользователем|DELETE|документ" | tail -20 || true
fi
echo ""

echo "--- 8. Рекомендации ---"
echo "• Если заказ «пропал»: в БД после удаления его уже нет; document_history для него тоже удаляется."
echo "• Кто удалил: ищите в логах строку «Документ <id> удален пользователем <userId>» (см. блок 7)."
echo "• Удаление возможно через: DELETE /api/orders/:id или DELETE /api/documents/:id (тип order)."
echo "• Чтобы в будущем сохранять факт удаления: добавьте запись в отдельную audit-таблицу до вызова delete."
