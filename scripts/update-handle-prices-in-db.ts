/**
 * Обновление цен ручек и заверток в БД по правилам:
 * - Цена ручки = Цена продажи (руб) (в base_price и Domeo_цена группы Web)
 * - Цена завертки = Завертка, цена РРЦ (в properties_data, число)
 *
 * Запуск: npx tsx scripts/update-handle-prices-in-db.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client';
import { getHandlesCategoryId } from '../lib/catalog-categories';

const prisma = new PrismaClient();

function parseNum(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const categoryId = await getHandlesCategoryId();
  if (!categoryId) {
    console.error('Категория «Ручки и завертки» не найдена.');
    process.exit(1);
  }

  const products = await prisma.product.findMany({
    where: { catalog_category_id: categoryId },
    select: { id: true, sku: true, name: true, base_price: true, properties_data: true },
  });

  console.log('Найдено товаров в категории ручек:', products.length);
  if (dryRun) console.log('[dry-run] изменения не сохраняются\n');

  let updated = 0;
  for (const p of products) {
    let props: Record<string, unknown> = {};
    try {
      props =
        typeof p.properties_data === 'string'
          ? JSON.parse(p.properties_data)
          : (p.properties_data as Record<string, unknown>) || {};
    } catch {
      continue;
    }

    const priceSale = parseNum(props['Цена продажи (руб)']);
    const backplateRrc = parseNum(props['Завертка, цена РРЦ']);
    const currentBase = Number(p.base_price) || 0;
    const currentDomeo = parseNum(props['Domeo_цена группы Web']);

    const newProps: Record<string, unknown> = { ...props };
    if (priceSale > 0) {
      newProps['Domeo_цена группы Web'] = priceSale;
      newProps['Цена продажи (руб)'] = priceSale;
    }
    newProps['Завертка, цена РРЦ'] = backplateRrc;

    const needBase = priceSale > 0 && currentBase !== priceSale;
    const needDomeo = priceSale > 0 && currentDomeo !== priceSale;
    const needBackplateNum =
      typeof props['Завертка, цена РРЦ'] !== 'number' || Number(props['Завертка, цена РРЦ']) !== backplateRrc;
    if (!needBase && !needDomeo && !needBackplateNum) continue;

    if (dryRun) {
      console.log(
        p.sku,
        'base_price:',
        currentBase,
        '->',
        priceSale,
        'Domeo_цена группы Web:',
        currentDomeo,
        '->',
        priceSale,
        'Завертка, цена РРЦ:',
        backplateRrc
      );
      updated++;
      continue;
    }

    await prisma.product.update({
      where: { id: p.id },
      data: {
        ...(priceSale > 0 && { base_price: priceSale }),
        properties_data: JSON.stringify(newProps),
      },
    });
    updated++;
  }

  console.log('Обновлено записей:', updated);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
