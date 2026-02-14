/**
 * Удаление из категории «Наличники» товаров со старым форматом SKU (без поставщика в коде).
 * Старый формат: nal_<название> (например nal_Прямой_70мм).
 * Новый формат: nal_<поставщик>_<название> (например nal_Фрамир_Прямой_70мм).
 *
 * Удаляются товары, у которых после "nal_" второй сегмент (поставщик) не входит
 * в список: Фрамир, ВестСтайл, Юркас, unknown.
 *
 * Запуск: npx tsx scripts/delete-old-architraves-by-sku.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client';
import { getCategoryIdByName } from '../lib/catalog-categories';

const prisma = new PrismaClient();

// Второй сегмент SKU (поставщик) в новом формате: кириллица из slug в Excel, плюс unknown
const NEW_FORMAT_SUPPLIERS = new Set([
  'фрамир', 'вестстайл', 'юркас', 'unknown',
  'framir', 'veststyl', 'yurkas', // на случай латинской транслитерации
]);

function isOldSku(sku: string): boolean {
  if (!sku || !sku.startsWith('nal_')) return false;
  const parts = sku.split('_');
  if (parts.length < 2) return false;
  const secondSegment = (parts[1] || '').trim().toLowerCase();
  return !NEW_FORMAT_SUPPLIERS.has(secondSegment);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const nalichnikiCatId = await getCategoryIdByName('Наличники');
  if (!nalichnikiCatId) {
    console.error('Категория «Наличники» не найдена');
    process.exit(1);
  }

  const products = await prisma.product.findMany({
    where: { catalog_category_id: nalichnikiCatId },
    select: { id: true, sku: true, name: true },
  });

  const toDelete = products.filter((p) => isOldSku(p.sku));
  const toKeep = products.filter((p) => !isOldSku(p.sku));

  console.log('Категория «Наличники»: всего товаров', products.length);
  console.log('Со старым SKU (будут удалены):', toDelete.length);
  console.log('С новым форматом (остаются):', toKeep.length);
  if (toDelete.length > 0) {
    console.log('');
    console.log('Товары к удалению:');
    toDelete.forEach((p) => console.log('  -', p.sku, '|', p.name));
  }

  if (toDelete.length === 0) {
    console.log('Нечего удалять.');
    return;
  }

  if (dryRun) {
    console.log('');
    console.log('Режим --dry-run: удаление не выполнялось.');
    return;
  }

  const ids = toDelete.map((p) => p.id);
  const result = await prisma.product.deleteMany({
    where: { id: { in: ids } },
  });
  console.log('');
  console.log('Удалено товаров:', result.count);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
