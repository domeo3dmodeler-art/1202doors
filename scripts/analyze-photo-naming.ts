/**
 * Анализ форматов: property_photos (propertyValue, photoPath) и имена файлов в папке дверей.
 * Запуск: npx tsx scripts/analyze-photo-naming.ts
 */
import { prisma } from '@/lib/prisma';
import { getDoorsCategoryId } from '@/lib/catalog-categories';
import { DOOR_COLOR_PROPERTY } from '@/lib/property-photos';
import * as fs from 'fs';
import * as path from 'path';

const DOORS_DIR = path.join(process.cwd(), 'public', 'uploads', 'final-filled', 'doors');

async function main() {
  const doorsCatId = await getDoorsCategoryId();
  if (!doorsCatId) {
    console.error('Категория дверей не найдена');
    process.exit(1);
  }

  const rows = await prisma.propertyPhoto.findMany({
    where: { categoryId: doorsCatId, propertyName: DOOR_COLOR_PROPERTY },
    select: { propertyValue: true, photoPath: true },
  });

  const byFirstSegment: Record<string, number> = {};
  const pathTypes: Record<string, number> = {};
  const pathSamples: Record<string, string> = {};
  for (const r of rows) {
    const first = (r.propertyValue ?? '').split('|')[0]?.trim() ?? '';
    if (first) byFirstSegment[first] = (byFirstSegment[first] || 0) + 1;
    const p = (r.photoPath ?? '').trim();
    const type = p.startsWith('http') ? 'https' : p.startsWith('/uploads/') ? 'local' : 'other';
    pathTypes[type] = (pathTypes[type] || 0) + 1;
    if (!pathSamples[type]) pathSamples[type] = p.slice(0, 80);
  }

  console.log('=== property_photos (Domeo_Модель_Цвет) ===');
  console.log('Всего записей:', rows.length);
  console.log('\nТипы photoPath:', pathTypes);
  console.log('Примеры photoPath:', pathSamples);
  console.log('\nПервая часть propertyValue (модель) — топ по количеству:');
  const sorted = Object.entries(byFirstSegment).sort((a, b) => b[1] - a[1]);
  sorted.slice(0, 30).forEach(([k, v]) => console.log(' ', v, '×', k));

  if (!fs.existsSync(DOORS_DIR)) {
    console.log('\nПапка дверей не найдена:', DOORS_DIR);
    return;
  }
  const files = fs.readdirSync(DOORS_DIR).filter((n) => /\.(png|jpg|jpeg|webp)$/i.test(n));
  const withCover = files.filter((n) => n.includes('_cover')).length;
  const byPrefix: Record<string, number> = {};
  for (const n of files) {
    const segs = n.replace(/\.[^.]+$/, '').split('_');
    const prefix = segs.length >= 2 ? segs.slice(0, 2).join('_') : segs[0]?.slice(0, 20) ?? n;
    byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;
  }

  console.log('\n=== Файлы в public/uploads/final-filled/doors ===');
  console.log('Всего файлов:', files.length);
  console.log('С _cover в имени:', withCover, 'Без _cover:', files.length - withCover);
  console.log('Примеры имён (20):', files.slice(0, 20));
  console.log('\nПрефиклы имён (первые 2 сегмента) — топ:');
  Object.entries(byPrefix)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .forEach(([k, v]) => console.log(' ', v, '×', k));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
