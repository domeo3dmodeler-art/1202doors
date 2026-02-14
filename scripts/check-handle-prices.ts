/**
 * Проверка: есть ли в БД цены ручек и заверток.
 * Запуск: npx ts-node scripts/check-handle-prices.ts
 * или: npx tsx scripts/check-handle-prices.ts
 */

import { PrismaClient } from '@prisma/client';
import { getHandlesCategoryId } from '../lib/catalog-categories';

const prisma = new PrismaClient();

async function main() {
  const categoryId = await getHandlesCategoryId();
  if (!categoryId) {
    console.log('Категория «Ручки»/«Ручки и завертки» не найдена.');
    return;
  }

  const products = await prisma.product.findMany({
    where: {
      catalog_category_id: categoryId,
      is_active: true,
    },
    select: {
      id: true,
      sku: true,
      name: true,
      base_price: true,
      properties_data: true,
    },
    take: 50,
  });

  console.log('Категория ручек: id =', categoryId);
  console.log('Проверено товаров:', products.length);
  console.log('');

  type Props = Record<string, unknown>;
  const parse = (raw: string | null): Props => {
    if (!raw) return {};
    try {
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch {
      return {};
    }
  };

  let withHandlePrice = 0;
  let withBackplatePrice = 0;
  const samples: { name: string; handlePrice: number; backplatePrice: number }[] = [];

  for (const p of products) {
    const props = parse(p.properties_data as string);
    // Цена ручки = Цена продажи (руб); в API также читают Domeo_цена группы Web и base_price
    const handlePrice =
      Number(props['Domeo_цена группы Web']) ||
      Number(props['Цена продажи (руб)']) ||
      Number(p.base_price) ||
      0;
    const backplatePrice = Number(props['Завертка, цена РРЦ']) || 0;
    if (handlePrice > 0) withHandlePrice++;
    if (backplatePrice > 0) withBackplatePrice++;
    if (samples.length < 10) {
      samples.push({
        name: p.name || p.sku || '',
        handlePrice,
        backplatePrice,
      });
    }
  }

  console.log('Итог:');
  console.log('  — Цена ручки (Цена продажи (руб) / Domeo_цена группы Web / base_price): есть у', withHandlePrice, 'из', products.length);
  console.log('  — Цена завертки (Завертка, цена РРЦ в properties_data): есть у', withBackplatePrice, 'из', products.length);
  console.log('');
  console.log('Примеры (первые 10):');
  samples.forEach((s) => {
    console.log('  ', s.name.slice(0, 40).padEnd(42), 'ручка:', s.handlePrice, '₽', '  завертка:', s.backplatePrice, '₽');
  });
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
