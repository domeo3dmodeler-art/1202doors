#!/bin/bash
# Жёсткая защита ВМ от сканеров и атак (при огромном трафике).
# Запуск на ВМ: sudo bash vm-hardening-attack.sh
# После: в группе безопасности Yandex Cloud оставить только 80 (и 22 только с вашего IP).

set -e
APP_UPSTREAM="${APP_UPSTREAM:-127.0.0.1:3000}"

echo "=== Защита от сканеров и атак ==="

# 1. Nginx — жёсткие лимиты и блокировка типичных сканеров
echo "[1] Nginx: жёсткие лимиты и блок User-Agent..."
apt-get update -qq
apt-get install -y nginx 2>/dev/null || true

# Блокировка по User-Agent: только явные сканеры и пустой UA
cat > /etc/nginx/conf.d/block-bots.conf << 'NGINX_BLOCK'
map $http_user_agent $bad_bot {
    default 0;
    ~*nikto          1;
    ~*sqlmap         1;
    ~*nmap           1;
    ~*masscan        1;
    ~*zgrab          1;
    ~*acunetix       1;
    ~*netsparker     1;
    ~*nessus         1;
    ~*openvas        1;
    ~*gobuster       1;
    ~*dirbuster      1;
    ~*wfuzz          1;
    ""              1;
}
NGINX_BLOCK

# Основной сайт: низкий rate, limit_conn
cat > /etc/nginx/sites-available/domeo << NGINX_MAIN
upstream domeo_backend {
    server ${APP_UPSTREAM};
    keepalive 16;
}

# Обычный сёрфинг: 15 r/s, burst 50 (Next.js грузит много чанков параллельно)
limit_req_zone \$binary_remote_addr zone=api_limit:20m rate=15r/s;
# Тяжёлые API (complete-data и т.п.): строже
limit_req_zone \$binary_remote_addr zone=strict_limit:10m rate=3r/s;
limit_conn_zone \$binary_remote_addr zone=conn_limit:10m;

server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 50M;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;

    if (\$bad_bot) { return 444; }

    location ~ ^/api/(health|catalog/doors/complete-data) {
        limit_req zone=strict_limit burst=15 nodelay;
        limit_conn conn_limit 10;
        proxy_pass http://domeo_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location / {
        limit_req zone=api_limit burst=50 nodelay;
        limit_conn conn_limit 25;
        proxy_pass http://domeo_backend;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 30s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
NGINX_MAIN

ln -sf /etc/nginx/sites-available/domeo /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
systemctl enable nginx

# 2. Fail2ban — агрессивный бан (ваш IP не банить: задайте MY_IP=ваш.и.п перед скриптом)
echo "[2] Fail2ban: длинный бан за превышение лимитов и сканы..."
apt-get install -y fail2ban 2>/dev/null || true

IGNORE_IP="127.0.0.1/8 ::1"
if [ -n "$MY_IP" ]; then
  IGNORE_IP="$IGNORE_IP $MY_IP"
  echo "    Ваш IP $MY_IP не будет забанен (ignoreip)."
fi

mkdir -p /etc/fail2ban/jail.d
cat > /etc/fail2ban/jail.d/domeo.conf << F2B
[sshd]
enabled = true
port = ssh
maxretry = 3
bantime = 86400
findtime = 600
ignoreip = $IGNORE_IP

[nginx-limit-req]
enabled = true
port = http,https
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 3
bantime = 86400
findtime = 60
ignoreip = $IGNORE_IP
F2B

cat > /etc/fail2ban/filter.d/nginx-limit-req.conf << 'F2BF'
[Definition]
failregex = limiting requests, excess:.* by zone.*client: <HOST>
ignoreregex =
F2BF

systemctl enable fail2ban
systemctl restart fail2ban 2>/dev/null || true

echo ""
echo "Готово. Дальше обязательно:"
echo "  1. В Yandex Cloud → Группа безопасности ВМ:"
echo "     - Входящие: порт 80 — источник 0.0.0.0/0 (или только ваш IP); порт 22 — только ваш IP."
echo "     - Все остальные входящие — удалить."
echo "  2. Если трафик не упадёт — разрешить порт 80 только с вашего IP (временно)."
echo "  3. Проверить ВМ на взлом: см. docs/VM_TRAFFIC_ATTACK_PROTECTION.md"
