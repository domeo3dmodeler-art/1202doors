/**
 * Точечное исправление путей к обложкам двух дверей в PropertyPhoto:
 * - Molis 1 Белый (RAL 9003)
 * - Enigma 1 Синий (NCS S 6010-B10G)
 * Путь в БД должен совпадать с именем файла на диске в public/uploads/final-filled/doors/.
 *
 * Запуск: npx tsx scripts/fix-two-door-photo-paths.ts [--apply]
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
function loadDatabaseUrl(): void {
  if (process.env.DATABASE_URL?.startsWith('postgres')) return;
  const envPath = join(root, '.env.postgresql');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf-8');
  const m = content.match(/DATABASE_URL=["']?([^"'\s]+)["']?/m);
  if (m?.[1]) process.env.DATABASE_URL = m[1];
}
loadDatabaseUrl();

import { PrismaClient } from '@prisma/client';
import { getDoorsCategoryId } from '../lib/catalog-categories';
import { DOOR_COLOR_PROPERTY } from '../lib/property-photos';

const prisma = new PrismaClient();
const doorsDir = join(root, 'public', 'uploads', 'final-filled', 'doors');
const UPLOADS_PREFIX = '/uploads/final-filled/doors/';

/**
 * Исправления: по содержимому photoPath определяем запись и задаём правильный basename файла на диске.
 * Если для Enigma на диске лежит Quantum_6 — замените newBasename на 'Quantum_6_Синий (NCS S 6010-B10G).PNG'.
 */
const FIXES: { pathContains: string; newBasename: string }[] = [
  { pathContains: 'Molis_1', newBasename: 'Molis_1_Белый (RAL 9003).png' },
  { pathContains: 'Enigma_1', newBasename: 'Enigma_1_ДГ-Эмаль_Синий (NCS S 6010-B10G).png' },
];

async function main() {
  const apply = process.argv.includes('--apply');
  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    console.error('Категория дверей не найдена.');
    process.exit(1);
  }

  for (const { newBasename } of FIXES) {
    const filePath = join(doorsDir, newBasename);
    if (!existsSync(filePath)) {
      console.warn('Файл не найден (пропуск):', filePath);
    }
  }

  const allRecords = await prisma.propertyPhoto.findMany({
    where: {
      categoryId: doorsCategoryId,
      propertyName: DOOR_COLOR_PROPERTY,
      photoType: 'cover',
    },
    select: { id: true, propertyValue: true, photoPath: true },
  });

  for (const fix of FIXES) {
    const record = allRecords.find((r) => r.photoPath.includes(fix.pathContains));
    if (!record) {
      console.warn('Запись не найдена для pathContains:', fix.pathContains);
      continue;
    }
    const newPath = UPLOADS_PREFIX + fix.newBasename;
    const filePath = join(doorsDir, fix.newBasename);
    if (!existsSync(filePath)) {
      console.warn('Файл не найден, пропуск обновления:', fix.newBasename);
      continue;
    }
    if (record.photoPath === newPath) {
      console.log('Уже верно:', record.propertyValue, '->', newPath);
      continue;
    }
    console.log('Обновить:', record.propertyValue);
    console.log('  было:', record.photoPath);
    console.log('  станет:', newPath);
    if (apply) {
      await prisma.propertyPhoto.update({
        where: { id: record.id },
        data: { photoPath: newPath },
      });
      console.log('  OK.');
    }
  }

  if (!apply) {
    console.log('\nЗапустите с --apply для применения изменений.');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
