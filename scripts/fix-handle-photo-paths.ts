/**
 * Привязка фото ручек к файлам на диске.
 * Для каждой ручки (категория «Ручки и завертки») проверяет: есть ли файл
 * public/uploads/final-filled/04_Ручки_Завертки/{sku}_main.png (или .jpg, .webp).
 * Если да и в БД другой путь (или http) — обновляет ProductImage.url для основного фото.
 *
 * Запуск: npx tsx scripts/fix-handle-photo-paths.ts [--dry-run]
 * Требуется: DATABASE_URL, файлы в public/uploads/final-filled/04_Ручки_Завертки/
 */

import { join } from 'path';
import { existsSync } from 'fs';
import { prisma } from '../lib/prisma';
import { getHandlesCategoryId } from '../lib/catalog-categories';

const HANDLES_DIR = join(process.cwd(), 'public', 'uploads', 'final-filled', '04_Ручки_Завертки');
const EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];

function findHandleMainFile(sku: string): string | null {
  const base = `${sku}_main`;
  for (const ext of EXTENSIONS) {
    const p = join(HANDLES_DIR, `${base}.${ext}`);
    if (existsSync(p)) return `/uploads/final-filled/04_Ручки_Завертки/${base}.${ext}`;
  }
  return null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const categoryId = await getHandlesCategoryId();
  if (!categoryId) {
    console.error('Категория «Ручки и завертки» не найдена.');
    process.exit(1);
  }

  const handles = await prisma.product.findMany({
    where: { catalog_category_id: categoryId },
    select: { id: true, sku: true, name: true, images: { where: { sort_order: 0 }, select: { id: true, url: true } } },
  });

  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const h of handles) {
    const sku = h.sku ?? '';
    const mainImg = h.images?.[0];
    const canonicalPath = findHandleMainFile(sku);

    if (!canonicalPath) {
      missing++;
      if (missing <= 5) console.log('  Нет файла на диске:', sku);
      continue;
    }

    const currentUrl = mainImg?.url?.trim() ?? '';
    const alreadyCorrect = currentUrl === canonicalPath || (currentUrl.startsWith('/uploads/') && currentUrl.includes('04_Ручки_Завертки') && currentUrl.includes(sku));
    if (alreadyCorrect) {
      skipped++;
      continue;
    }

    if (!mainImg) {
      await prisma.productImage.create({
        data: {
          product_id: h.id,
          filename: canonicalPath.split('/').pop() ?? 'handle_main.png',
          original_name: 'handle.jpg',
          url: canonicalPath,
          mime_type: 'image/png',
          is_primary: true,
          sort_order: 0,
        },
      });
      updated++;
      if (!dryRun) console.log('  + Создана запись:', sku, '→', canonicalPath);
    } else if (!dryRun) {
      await prisma.productImage.update({ where: { id: mainImg.id }, data: { url: canonicalPath } });
      updated++;
      console.log('  Обновлено:', sku, '→', canonicalPath);
    } else {
      console.log('  [dry-run] Обновить:', sku, currentUrl.slice(0, 50) + '...', '→', canonicalPath);
      updated++;
    }
  }

  console.log('');
  console.log('Итого: обновлено/создано', updated, ', без изменений', skipped, ', нет файла на диске', missing);
  if (dryRun && updated) console.log('Запустите без --dry-run, чтобы записать изменения в БД.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
