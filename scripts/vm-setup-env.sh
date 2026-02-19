#!/bin/bash
set -e
# One-time: set DB password and create .env. Pass DB password as first arg or we use default.
DB_PASS="${1:-domeo_local_$(openssl rand -hex 8)}"
JWT_SECRET="jwt_$(openssl rand -hex 24)"
mkdir -p ~/domeo-app ~/1002doors
sudo -u postgres psql -c "ALTER USER domeo_user WITH PASSWORD '$DB_PASS';" 2>/dev/null || true
cat > ~/domeo-app/.env << EOF
DATABASE_URL="postgresql://domeo_user:${DB_PASS}@localhost:5432/domeo?schema=public"
NODE_ENV=production
JWT_SECRET=${JWT_SECRET}
EOF
chmod 600 ~/domeo-app/.env
echo "OK .env created"
