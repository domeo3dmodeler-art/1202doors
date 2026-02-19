#!/bin/bash
set -e
ENVFILE="/home/ubuntu/domeo-app/.env"
sed -i 's|^DATABASE_URL=.*|DATABASE_URL="postgresql://domeo_user:d0me0Stag1ngPg2025@localhost:5432/domeo?schema=public"|' "$ENVFILE"
sed -i 's|^NODE_ENV=.*|NODE_ENV=production|' "$ENVFILE"
grep -E '^DATABASE_URL|^NODE_ENV' "$ENVFILE"
sudo systemctl restart domeo-standalone
sleep 3
curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/api/health
echo ""
