#!/bin/bash
# Настройка защиты на ВМ (Ubuntu): Nginx reverse proxy с rate limit + Fail2ban.
# Запуск на ВМ: sudo bash vm-security-setup.sh
# После выполнения: открыть порт 80 в группе безопасности, закрыть 3000 снаружи (доступ только через nginx на 80).

set -e
APP_UPSTREAM="${APP_UPSTREAM:-127.0.0.1:3000}"

echo "[1/4] Установка Nginx..."
apt-get update -qq
apt-get install -y nginx

echo "[2/4] Конфигурация Nginx (reverse proxy + rate limit)..."
cat > /etc/nginx/sites-available/domeo << 'NGINX_EOF'
# Upstream приложения (Node.js на порту 3000)
upstream domeo_backend {
    server 127.0.0.1:3000;
    keepalive 32;
}

# Лимиты запросов — защита от сканеров и флуда
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=15r/s;
limit_req_zone $binary_remote_addr zone=strict_limit:10m rate=5r/s;

server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 100M;

    # Заголовки безопасности
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Жёсткий лимит для тяжёлых/публичных путей (проверяется первым)
    location ~ ^/api/(health|catalog/doors/complete-data) {
        limit_req zone=strict_limit burst=10 nodelay;
        proxy_pass http://domeo_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Общий лимит для остального API и страниц
    location / {
        limit_req zone=api_limit burst=30 nodelay;
        proxy_pass http://domeo_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
NGINX_EOF

ln -sf /etc/nginx/sites-available/domeo /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
systemctl enable nginx

echo "[3/4] Установка Fail2ban..."
apt-get install -y fail2ban

echo "[4/4] Конфигурация Fail2ban (jail для nginx и sshd)..."
mkdir -p /etc/fail2ban/jail.d
cat > /etc/fail2ban/jail.d/domeo.conf << 'F2B_EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 3600
findtime = 600

[nginx-http-auth]
enabled = true
port = http,https
filter = nginx-http-auth
logpath = /var/log/nginx/error.log
maxretry = 5
bantime = 3600
findtime = 600

[nginx-limit-req]
enabled = true
port = http,https
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 10
bantime = 1800
findtime = 120
F2B_EOF

# Фильтр для срабатывания при limit_req (503)
cat > /etc/fail2ban/filter.d/nginx-limit-req.conf << 'F2B_FILTER'
[Definition]
failregex = limiting requests, excess:.* by zone.*client: <HOST>
ignoreregex =
F2B_FILTER

systemctl enable fail2ban
systemctl restart fail2ban 2>/dev/null || true

echo "Готово. Nginx слушает порт 80 и проксирует на $APP_UPSTREAM."
echo "В группе безопасности Yandex Cloud: откройте порт 80, закройте 3000 для 0.0.0.0/0 (или оставьте 3000 только для localhost)."
echo "Проверка: curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:80/api/health"
