/**
 * Экспорт таблицы property_photos в Excel.
 * Файл: scripts/output/property_photos.xlsx (или --out=путь.xlsx)
 *
 * Запуск: npx tsx scripts/export-property-photos-to-excel.ts [--out=путь.xlsx]
 */
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

const prisma = new PrismaClient();

const DEFAULT_OUT = path.join(__dirname, 'output', 'property_photos.xlsx');

async function main() {
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  const outPath = outArg ? outArg.replace(/^--out=/, '').trim() : DEFAULT_OUT;

  const rows = await prisma.propertyPhoto.findMany({
    orderBy: [{ categoryId: 'asc' }, { propertyName: 'asc' }, { propertyValue: 'asc' }, { photoType: 'asc' }],
  });

  const data = rows.map((r) => ({
    id: r.id,
    categoryId: r.categoryId,
    propertyName: r.propertyName,
    propertyValue: r.propertyValue,
    photoPath: r.photoPath,
    photoType: r.photoType,
    originalFilename: r.originalFilename ?? '',
    fileSize: r.fileSize ?? '',
    mimeType: r.mimeType ?? '',
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'property_photos');

  const dir = path.dirname(outPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  XLSX.writeFile(wb, outPath, { bookType: 'xlsx', type: 'file' });

  console.log('Экспорт property_photos:', rows.length, 'записей');
  console.log('Файл:', path.resolve(outPath));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
