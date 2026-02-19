#!/bin/bash
set -e
mkdir -p ~/1002doors-migrate/prisma/database ~/1002doors-migrate/scripts
cd ~/1002doors
python3 -c "
import zipfile, os
p = os.path.expanduser('~/1002doors/dev.db.zip')
with zipfile.ZipFile(p, 'r') as z:
    z.extractall(os.path.expanduser('~/1002doors'))
"
mv ~/1002doors/dev.db ~/1002doors-migrate/prisma/database/
cp ~/1002doors/sqlite-to-postgres.ts ~/1002doors-migrate/scripts/
cd ~/1002doors-migrate
npm init -y
npm install better-sqlite3 pg tsx
export DATABASE_URL="postgresql://domeo_user:ChangeMe123@localhost:5432/domeo?schema=public"
npx tsx scripts/sqlite-to-postgres.ts
