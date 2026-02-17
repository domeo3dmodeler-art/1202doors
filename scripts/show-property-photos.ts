/**
 * Вывод таблицы property_photos в консоль.
 * Запуск: npx tsx scripts/show-property-photos.ts [--limit N]
 */
import { prisma } from '@/lib/prisma';

async function main() {
  const limit = process.argv.includes('--limit')
    ? parseInt(process.argv[process.argv.indexOf('--limit') + 1], 10) || 100
    : 100;
  const rows = await prisma.propertyPhoto.findMany({
    take: limit,
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      propertyName: true,
      propertyValue: true,
      photoType: true,
      photoPath: true,
      categoryId: true,
    },
  });
  const count = await prisma.propertyPhoto.count();
  console.log('=== property_photos (последние', rows.length, 'из', count, ') ===\n');
  console.log('propertyName                    | propertyValue (до 50 симв.)     | photoType | photoPath (до 75 симв.)');
  console.log('-'.repeat(140));
  for (const r of rows) {
    const pv = (r.propertyValue ?? '').slice(0, 50);
    const path = (r.photoPath ?? '').slice(0, 75);
    console.log(
      (r.propertyName ?? '').padEnd(30).slice(0, 30),
      '|',
      pv.padEnd(50).slice(0, 50),
      '|',
      (r.photoType ?? '').padEnd(8),
      '|',
      path
    );
  }
  console.log('\nВсего записей в таблице:', count);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
