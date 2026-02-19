#!/bin/bash
# Установка Chromium на ВМ для экспорта в PDF (Puppeteer).
# Запуск на ВМ: sudo bash vm-install-chromium.sh

set -e
echo "Installing Chromium for PDF export..."
apt-get update -qq
# chromium-browser — метапакет на Ubuntu; на других — пакет chromium
apt-get install -y chromium-browser 2>/dev/null || apt-get install -y chromium

# Узнаём путь к бинарнику (на Ubuntu может быть chromium или chromium-browser)
CHROMIUM_PATH=""
for p in /snap/bin/chromium /usr/bin/chromium-browser /usr/bin/chromium /usr/bin/google-chrome-stable; do
  if [ -x "$p" ]; then
    CHROMIUM_PATH="$p"
    break
  fi
done
if [ -z "$CHROMIUM_PATH" ]; then
  echo "Chromium binary not found after install. Check: which chromium-browser"
  exit 1
fi
echo "Chromium at: $CHROMIUM_PATH"

# Рекомендуется задать в .env приложения на ВМ:
# PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
# (или тот путь, который вывелся выше)
echo ""
echo "Add to ~/1002doors/.env on the VM:"
echo "  PUPPETEER_EXECUTABLE_PATH=$CHROMIUM_PATH"
echo ""
echo "Then restart the app: sudo systemctl restart domeo-staging"
