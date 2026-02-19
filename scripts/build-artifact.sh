#!/usr/bin/env bash
# Безопасная сборка артефакта для деплоя на ВМ (без сборки на сервере).
# Запуск: ./scripts/build-artifact.sh  или  npm run build:artifact
# Требует: Node 20+, npm ci, next build с output: standalone.
# На Windows: Git Bash или WSL, либо npm run build:artifact:ps1

set -euo pipefail

APP_NAME="1002doors"
OUT_DIR="dist"
ARTIFACT="${OUT_DIR}/${APP_NAME}-artifact.tar.gz"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[1/6] Очистка старых артефактов и сборки..."
rm -rf .next "${OUT_DIR}"
mkdir -p "${OUT_DIR}"

echo "[2/6] Чистая установка зависимостей (npm ci)..."
npm ci

echo "[3/6] Сборка Next.js (standalone)..."
export NEXT_BUILD_ARTIFACT=1
export NODE_ENV=production
npm run build

echo "[4/6] Проверка standalone..."
if [[ ! -f .next/standalone/server.js ]]; then
  echo "Ошибка: .next/standalone/server.js не найден. Проверьте next.config: output: standalone." >&2
  exit 1
fi

echo "[5/6] Упаковка артефакта..."
tar -czf "${ARTIFACT}" \
  .next/standalone \
  .next/static \
  public \
  package.json \
  prisma

echo "[6/6] Контрольная сумма sha256..."
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${ARTIFACT}" | tee "${ARTIFACT}.sha256"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "${ARTIFACT}" | tee "${ARTIFACT}.sha256"
else
  echo "Предупреждение: sha256sum/shasum не найден, файл .sha256 не создан."
fi

echo ""
echo "Готово: ${ARTIFACT}"
echo "Деплой: scp ${ARTIFACT} ${ARTIFACT}.sha256 ubuntu@<VM>:/tmp/  и на ВМ: sha256sum -c ... .sha256"
