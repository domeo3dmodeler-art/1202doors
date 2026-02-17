/**
 * Отчёт: повторения photoPath в property_photos.
 * Запуск: npx tsx scripts/report-photopath-duplicates.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const rows = await prisma.propertyPhoto.findMany({
    select: { propertyValue: true, photoPath: true },
  });

  const byPath = new Map<string, string[]>();
  for (const r of rows) {
    const path = r.photoPath ?? '(null)';
    if (!byPath.has(path)) byPath.set(path, []);
    byPath.get(path)!.push(r.propertyValue);
  }

  const total = rows.length;
  const uniquePaths = byPath.size;
  const duplicated = Array.from(byPath.entries()).filter(([, vals]) => vals.length > 1);
  const duplicatePathsCount = duplicated.length;
  const recordsWithDuplicatePath = duplicated.reduce((s, [, vals]) => s + vals.length, 0);

  console.log('--- property_photos: photoPath ---');
  console.log('Всего записей:', total);
  console.log('Уникальных photoPath:', uniquePaths);
  console.log('Повторяющихся photoPath (path встречается > 1 раза):', duplicatePathsCount);
  console.log('Записей с повторяющимся path:', recordsWithDuplicatePath);
  console.log('');

  if (duplicated.length > 0) {
    const sorted = duplicated.sort((a, b) => b[1].length - a[1].length);
    console.log('Полный список повторений photoPath:');
    for (const [path, vals] of sorted) {
      const name = path === '(null)' ? path : path.replace(/^.*\//, '');
      console.log(`\n  ${vals.length}x ${name}`);
      vals.forEach((v) => console.log(`    - ${v}`));
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
