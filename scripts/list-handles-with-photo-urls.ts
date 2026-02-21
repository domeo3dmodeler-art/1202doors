/**
 * Выводит таблицу ручек из БД: sku, name, url основного фото.
 * Запуск: npx tsx scripts/list-handles-with-photo-urls.ts
 */

import { getHandlesCategoryId } from '../lib/catalog-categories';
import { prisma } from '../lib/prisma';

function pad(s: string, n: number): string {
  return s.slice(0, n).padEnd(n, ' ');
}

async function main() {
  const categoryId = await getHandlesCategoryId();
  if (!categoryId) {
    console.error('Категория «Ручки и завертки» не найдена.');
    process.exit(1);
  }

  const handles = await prisma.product.findMany({
    where: { catalog_category_id: categoryId, is_active: true },
    select: {
      sku: true,
      name: true,
      images: {
        orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }],
        take: 1,
        select: { url: true },
      },
    },
    orderBy: { sku: 'asc' },
  });

  const skuLen = Math.min(28, Math.max(6, ...handles.map((h) => (h.sku ?? '').length)));
  const nameLen = Math.min(32, Math.max(8, ...handles.map((h) => (h.name ?? '').length)));
  const urlLen = 72;

  const sep = '-'.repeat(skuLen + nameLen + urlLen + 6);
  console.log('\n' + sep);
  console.log(pad('SKU', skuLen) + ' | ' + pad('Name', nameLen) + ' | URL (photo)');
  console.log(sep);

  for (const h of handles) {
    const sku = (h.sku ?? '').trim();
    const name = (h.name ?? '').trim();
    const url = h.images?.[0]?.url?.trim() ?? '(нет фото)';
    console.log(pad(sku, skuLen) + ' | ' + pad(name, nameLen) + ' | ' + url);
  }

  console.log(sep);
  console.log('Total:', handles.length, 'handles\n');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
