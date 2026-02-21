/**
 * Исправить photoPath для DomeoDoors_Meteor_1: заменить пути Molis на файлы Meteor_1.
 * Запуск: npx tsx scripts/fix-meteor-photo-paths.ts [--apply]
 * Без --apply — только вывод, что будет сделано.
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

const prisma = new PrismaClient();
const doorsDir = join(root, 'public', 'uploads', 'final-filled', 'doors');
const UPLOADS_PREFIX = '/uploads/final-filled/doors/';

const METEOR_UPDATES: { propertyValue: string; newBasename: string }[] = [
  { propertyValue: 'DomeoDoors_Meteor_1|Белый (RAL 9003)', newBasename: 'Meteor_1_Белый (RAL 9003).png' },
  { propertyValue: 'DomeoDoors_Meteor_1|Эмаль|Агат (Ral 7038)', newBasename: 'Meteor_1_Агат (Ral 7038).png' },
  { propertyValue: 'DomeoDoors_Meteor_1|Эмаль|Белый (RAL 9010)', newBasename: 'Meteor_1_Белый (RAL 9010).png' },
];

async function main() {
  const apply = process.argv.includes('--apply');
  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    console.error('Категория дверей не найдена.');
    process.exit(1);
  }

  for (const { propertyValue, newBasename } of METEOR_UPDATES) {
    const filePath = join(doorsDir, newBasename);
    if (!existsSync(filePath)) {
      console.error('Файл не найден:', filePath);
      process.exit(1);
    }
  }

  const records = await prisma.propertyPhoto.findMany({
    where: {
      categoryId: doorsCategoryId,
      propertyValue: { in: METEOR_UPDATES.map((u) => u.propertyValue) },
      photoType: 'cover',
    },
    select: { id: true, propertyValue: true, photoPath: true },
  });

  if (records.length !== METEOR_UPDATES.length) {
    console.error('Найдено записей:', records.length, ', ожидалось:', METEOR_UPDATES.length);
    process.exit(1);
  }

  const valueToBasename = new Map(METEOR_UPDATES.map((u) => [u.propertyValue, u.newBasename]));

  for (const r of records) {
    const newBasename = valueToBasename.get(r.propertyValue);
    if (!newBasename) continue;
    const newPath = UPLOADS_PREFIX + newBasename;
    if (r.photoPath === newPath) {
      console.log('Уже верно:', r.propertyValue, '->', newPath);
      continue;
    }
    console.log('Обновить:', r.propertyValue);
    console.log('  было:', r.photoPath);
    console.log('  станет:', newPath);
    if (apply) {
      await prisma.propertyPhoto.update({
        where: { id: r.id },
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
