/**
 * Исправить photoPath для DomeoDoors_Quantum_2 | Эмаль | Синий (NCS S 6010-B10G):
 * заменить путь Enigma на файл Quantum_6 с тем же цветом (Quantum_2 для этого цвета на диске нет).
 * Запуск: npx tsx scripts/fix-quantum2-photo-path.ts [--apply]
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

const PROPERTY_VALUE = 'DomeoDoors_Quantum_2|Эмаль|Синий (NCS S 6010-B10G)';
// На диске есть только Quantum_6 с этим цветом; Quantum_2 для этого цвета нет
const NEW_BASENAME = 'Quantum_6_Синий (NCS S 6010-B10G).PNG';

async function main() {
  const apply = process.argv.includes('--apply');
  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    console.error('Категория дверей не найдена.');
    process.exit(1);
  }

  const filePath = join(doorsDir, NEW_BASENAME);
  if (!existsSync(filePath)) {
    console.error('Файл не найден:', filePath);
    process.exit(1);
  }

  const record = await prisma.propertyPhoto.findFirst({
    where: {
      categoryId: doorsCategoryId,
      propertyValue: PROPERTY_VALUE,
      photoType: 'cover',
    },
    select: { id: true, propertyValue: true, photoPath: true },
  });

  if (!record) {
    console.error('Запись не найдена:', PROPERTY_VALUE);
    process.exit(1);
  }

  const newPath = UPLOADS_PREFIX + NEW_BASENAME;
  if (record.photoPath === newPath) {
    console.log('Уже верно:', record.propertyValue, '->', newPath);
    await prisma.$disconnect();
    return;
  }

  console.log('Обновить:', record.propertyValue);
  console.log('  было:', record.photoPath);
  console.log('  станет:', newPath, '(файл Quantum_6, т.к. Quantum_2 для этого цвета на диске нет)');
  if (apply) {
    await prisma.propertyPhoto.update({
      where: { id: record.id },
      data: { photoPath: newPath },
    });
    console.log('  OK.');
  } else {
    console.log('\nЗапустите с --apply для применения.');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
