#!/bin/bash
# Перезапуск приложения на ВМ: освободить 3000, запустить node server.js
set -e
cd ~/domeo-app || exit 1
fuser -k 3000/tcp 2>/dev/null || true
sleep 2
mkdir -p logs
nohup node server.js >> logs/server.log 2>&1 &
sleep 3
if ss -tlnp 2>/dev/null | grep -q 3000; then
  echo "OK: server listening on 3000"
else
  echo "Check: tail -20 ~/domeo-app/logs/server.log"
fi
