/**
 * Удаляет из Product.properties_data дверей устаревшие поля,
 * записывавшиеся только импортом листа «02 Покрытия Цвета» (doors-import).
 * Источник истины — final_filled 30.01.xlsx (import-final-filled.ts).
 *
 * Запуск: npx tsx scripts/strip-legacy-coating-properties.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client';
import { getDoorsCategoryId } from '../lib/catalog-categories';

const prisma = new PrismaClient();

const LEGACY_KEYS = [
  'Domeo_Код покрытия',
  'Domeo_Название цвета',
  'Domeo_Цвет HEX',
  'Это шпон',
  'Покрытие: Цена опт (руб)',
  'Покрытие: Цена РРЦ (руб)',
  'Покрытие: Порядок сортировки',
  'Покрытие: Активен',
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const doorsCatId = await getDoorsCategoryId();
  if (!doorsCatId) {
    console.error('Категория "Межкомнатные двери" не найдена');
    process.exit(1);
  }

  const products = await prisma.product.findMany({
    where: { catalog_category_id: doorsCatId },
    select: { id: true, sku: true, properties_data: true },
  });

  let updated = 0;
  for (const p of products) {
    let raw = p.properties_data;
    if (raw == null) continue;
    const props = typeof raw === 'string' ? JSON.parse(raw) : { ...raw };
    let changed = false;
    for (const key of LEGACY_KEYS) {
      if (key in props) {
        delete props[key];
        changed = true;
      }
    }
    if (!changed) continue;
    updated++;
    if (dryRun) {
      console.log('[dry-run] would strip legacy keys:', p.sku);
      continue;
    }
    await prisma.product.update({
      where: { id: p.id },
      data: { properties_data: JSON.stringify(props) },
    });
  }

  console.log(dryRun ? `[dry-run] Товаров к обновлению: ${updated}` : `Обновлено товаров: ${updated}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
