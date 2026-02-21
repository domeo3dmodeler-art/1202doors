/**
 * Показать все фото для модели (property_photos + файлы на диске).
 * Запуск: npx tsx scripts/list-photos-for-model.ts DomeoDoors_Meteor
 *         npx tsx scripts/list-photos-for-model.ts DomeoDoors_Meteor_1
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
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

async function main() {
  const modelPrefix = process.argv[2] || 'DomeoDoors_Meteor';
  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    console.error('Категория дверей не найдена.');
    process.exit(1);
  }

  const records = await prisma.propertyPhoto.findMany({
    where: {
      categoryId: doorsCategoryId,
      OR: [
        { propertyValue: { startsWith: modelPrefix + '|' } },
        { propertyValue: { equals: modelPrefix } },
      ],
    },
    select: { propertyName: true, propertyValue: true, photoType: true, photoPath: true },
    orderBy: [{ propertyValue: 'asc' }, { photoType: 'asc' }],
  });

  console.log('=== БД: property_photos для', modelPrefix, '===\n');
  if (records.length === 0) {
    console.log('Записей не найдено.');
  } else {
    records.forEach((r) => {
      const fileExists = r.photoPath
        ? existsSync(join(doorsDir, r.photoPath.replace(/^.*\//, '')))
        : false;
      console.log(r.propertyValue);
      console.log('  photoType:', r.photoType, '| photoPath:', r.photoPath);
      console.log('  файл на диске:', fileExists ? 'да' : 'НЕТ');
      console.log('');
    });
  }

  if (existsSync(doorsDir)) {
    const allFiles = readdirSync(doorsDir, { withFileTypes: true })
      .filter((d) => d.isFile() && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(d.name))
      .map((d) => d.name);
    const meteorFiles = allFiles.filter(
      (f) => f.toLowerCase().includes('meteor') || f.toLowerCase().includes('метеор')
    );
    console.log('=== Диск: файлы с "meteor" в имени в final-filled/doors ===\n');
    if (meteorFiles.length === 0) {
      console.log('Таких файлов нет.');
    } else {
      meteorFiles.forEach((f) => console.log('  ', f));
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
