#!/bin/bash
sudo -u postgres psql -c "ALTER USER domeo_user WITH PASSWORD 'ChangeMe123';"
mkdir -p ~/domeo-app ~/1002doors
cat > ~/domeo-app/.env << 'ENVEOF'
DATABASE_URL="postgresql://domeo_user:ChangeMe123@localhost:5432/domeo?schema=public"
NODE_ENV=production
JWT_SECRET=change-me-min-32-chars-secret-key-here
ENVEOF
chmod 600 ~/domeo-app/.env
sudo tee /etc/systemd/system/domeo-standalone.service > /dev/null << 'SVCEOF'
[Unit]
Description=Domeo 1002doors (standalone)
After=network.target postgresql.service

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/domeo-app
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
EnvironmentFile=/home/ubuntu/domeo-app/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVCEOF
sudo systemctl daemon-reload
sudo systemctl enable domeo-standalone
echo SETUP_OK
