/**
 * Список файлов из public/uploads/final-filled/doors, которые не привязаны в PropertyPhoto.
 * Запуск: npx tsx scripts/list-unlinked-final-filled-photos.ts
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';

const prisma = new PrismaClient();

const DOORS_DIR = path.join(process.cwd(), 'public', 'uploads', 'final-filled', 'doors');

function basename(p: string): string {
  return path.basename(p.replace(/\\/g, '/'));
}

async function main() {
  const dirExists = fs.existsSync(DOORS_DIR);
  if (!dirExists) {
    console.error('Папка не найдена:', DOORS_DIR);
    process.exit(1);
  }

  const filesOnDisk = fs.readdirSync(DOORS_DIR);
  const rows = await prisma.propertyPhoto.findMany({
    select: { photoPath: true },
  });

  const linkedLower = new Set<string>();
  for (const r of rows) {
    const p = r.photoPath ?? '';
    if (!p) continue;
    if (p.includes('final-filled/doors') || p.includes('final-filled\\doors')) {
      linkedLower.add(basename(p).toLowerCase());
    }
  }

  const unlinked: string[] = [];
  for (const f of filesOnDisk) {
    if (!linkedLower.has(f.toLowerCase())) unlinked.push(f);
  }

  unlinked.sort();

  console.log('Папка:', DOORS_DIR);
  console.log('Всего файлов в папке:', filesOnDisk.length);
  console.log('Привязано в PropertyPhoto (уникальных имён из этой папки):', linkedLower.size);
  console.log('Не привязано (файлов без записи в property_photos):', unlinked.length);
  console.log('');
  console.log('--- Файлы без привязки ---');
  for (const name of unlinked) {
    console.log(name);
  }

  const outDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'unlinked-final-filled-doors.txt');
  fs.writeFileSync(outFile, unlinked.join('\n'), 'utf8');
  console.log('');
  console.log('Полный список сохранён:', outFile);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
