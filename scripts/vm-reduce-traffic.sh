#!/bin/bash
# Снижение трафика на ВМ: отключение автообновлений snap и apt.
# Запуск на ВМ: sudo bash vm-reduce-traffic.sh

set -e
echo "=== Снижение расхода трафика на ВМ ==="

# 1. Snap — отключить автоматическое обновление (snap refresh тянет много трафика)
if command -v snap >/dev/null 2>&1; then
  echo "[1] Отключаю автообновление snap..."
  snap set system refresh.hold="2099-12-31T00:00:00Z" 2>/dev/null || true
  systemctl stop snapd.refresh.timer 2>/dev/null || true
  systemctl disable snapd.refresh.timer 2>/dev/null || true
  echo "    snap refresh отложен, timer отключён."
else
  echo "[1] snap не установлен — пропуск."
fi

# 2. Unattended-upgrades (автообновления безопасности Ubuntu) — отключить или только security
if [ -f /etc/apt/apt.conf.d/20auto-upgrades ]; then
  echo "[2] Отключаю автоматический apt update/upgrade..."
  cat > /etc/apt/apt.conf.d/20auto-upgrades << 'APT'
APT::Periodic::Update-Package-Lists "0";
APT::Periodic::Unattended-Upgrade "0";
APT::Periodic::AutocleanInterval "0";
APT
  echo "    Готово. Обновления вручную: sudo apt update && sudo apt upgrade."
else
  echo "[2] Файл 20auto-upgrades не найден — пропуск."
fi

# 3. Таймер apt-daily (ежедневный apt update)
echo "[3] Отключаю таймер apt-daily..."
systemctl stop apt-daily.timer 2>/dev/null || true
systemctl stop apt-daily-upgrade.timer 2>/dev/null || true
systemctl disable apt-daily.timer 2>/dev/null || true
systemctl disable apt-daily-upgrade.timer 2>/dev/null || true
echo "    Готово."

echo ""
echo "Рекомендации:"
echo "  - Обновления делать вручную раз в месяц: sudo apt update && sudo apt upgrade -y"
echo "  - Посмотреть расход трафика: sudo vnstat (установить: sudo apt install vnstat)"
echo "  - Поиск процессов по сети: sudo apt install nethogs && sudo nethogs"
