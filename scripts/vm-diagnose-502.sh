#!/bin/bash
# Диагностика 502 на ВМ: порт 3000, наличие server.js и .env, systemd, логи.
# Запуск на ВМ: bash vm-diagnose-502.sh
# С хоста: .\scripts\diagnose-502-on-vm.ps1 (или ssh ... 'bash -s' < scripts/vm-diagnose-502.sh). Файл — LF.

set +e
echo "=== 1. Port 3000 ==="
ss -tlnp 2>/dev/null | grep 3000 || echo "Ничего не слушает 3000"
echo ""
echo "=== 2. Каталог ~/domeo-app ==="
if [ -d ~/domeo-app ]; then
  ls -la ~/domeo-app/ | head -20
  echo "server.js: $([ -f ~/domeo-app/server.js ] && echo 'есть' || echo 'НЕТ')"
  echo ".env:      $([ -f ~/domeo-app/.env ] && echo 'есть' || echo 'НЕТ')"
else
  echo "Каталог ~/domeo-app отсутствует"
fi
echo ""
echo "=== 3. Каталог ~/1002doors (если есть) ==="
if [ -d ~/1002doors ]; then
  ls -la ~/1002doors/ | head -10
  echo "server.js: $([ -f ~/1002doors/server.js ] && echo 'есть' || echo 'НЕТ')"
  echo ".env:      $([ -f ~/1002doors/.env ] && echo 'есть' || echo 'НЕТ')"
else
  echo "Каталог ~/1002doors отсутствует"
fi
echo ""
echo "=== 4. Systemd: domeo-standalone ==="
systemctl is-active domeo-standalone 2>/dev/null || echo "юнит не найден или не активен"
systemctl status domeo-standalone --no-pager 2>/dev/null | head -15 || true
echo ""
echo "=== 5. Логи приложения (последние 30 строк) ==="
echo "--- ~/domeo-app/logs/server.log (production) ---"
tail -30 ~/domeo-app/logs/server.log 2>/dev/null || echo "файл отсутствует или пуст"
echo "--- ~/domeo-app/logs/next-dev.log (dev) ---"
tail -30 ~/domeo-app/logs/next-dev.log 2>/dev/null || echo "файл отсутствует или пуст"
echo "--- journalctl -u domeo-standalone ---"
sudo journalctl -u domeo-standalone -n 25 --no-pager 2>/dev/null || true
echo ""
echo "=== 6. Проверка ответа localhost:3000 ==="
curl -s -o /dev/null -w "HTTP %{http_code}\n" --connect-timeout 3 http://127.0.0.1:3000/ 2>/dev/null || echo "подключение не удалось (connection refused / timeout)"
curl -s -o /dev/null -w "API health %{http_code}\n" --connect-timeout 3 http://127.0.0.1:3000/api/health 2>/dev/null || echo "API health: подключение не удалось"
echo ""
echo "=== Конец диагностики ==="
