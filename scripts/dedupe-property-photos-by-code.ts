/**
 * Удаление дублей в property_photos (Domeo_Модель_Цвет):
 * оставляем только записи, где в propertyValue первая часть — КОД модели (например DomeoDoors_Base_1),
 * удаляем записи, где первая часть — НАЗВАНИЕ модели (например Дверь Гладкое ДГ).
 *
 * Запуск: npx tsx scripts/dedupe-property-photos-by-code.ts [--dry-run]
 */
import { prisma } from '@/lib/prisma';
import { getDoorsCategoryId } from '@/lib/catalog-categories';
import { DOOR_COLOR_PROPERTY } from '@/lib/property-photos';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const doorsCatId = await getDoorsCategoryId();
  if (!doorsCatId) {
    console.error('Категория "Межкомнатные двери" не найдена.');
    process.exit(1);
  }

  // Все коды моделей из товаров дверей (Код модели Domeo (Web))
  const products = await prisma.product.findMany({
    where: { catalog_category_id: doorsCatId },
    select: { properties_data: true },
  });
  const modelCodes = new Set<string>();
  for (const p of products) {
    const data = p.properties_data;
    if (!data) continue;
    const props = typeof data === 'string' ? JSON.parse(data) : data;
    const code = (props['Код модели Domeo (Web)'] ?? '').toString().trim();
    if (code) modelCodes.add(code);
  }
  console.log('Кодов моделей в товарах (двери):', modelCodes.size);
  if (modelCodes.size === 0) {
    console.warn('Нет кодов моделей — скрипт не удалит записи по названию.');
    process.exit(0);
  }

  const colorPhotos = await prisma.propertyPhoto.findMany({
    where: {
      categoryId: doorsCatId,
      propertyName: DOOR_COLOR_PROPERTY,
    },
    select: { id: true, propertyValue: true },
  });

  const toDelete: string[] = [];
  for (const row of colorPhotos) {
    const parts = (row.propertyValue ?? '').split('|');
    const first = (parts[0] ?? '').trim();
    if (!first) continue;
    // Если первая часть — не код модели (не из списка кодов), это запись по названию — удаляем
    if (!modelCodes.has(first)) {
      toDelete.push(row.id);
    }
  }

  console.log('Записей по названию модели (к удалению):', toDelete.length);
  console.log('Записей по коду модели (остаются):', colorPhotos.length - toDelete.length);

  if (toDelete.length === 0) {
    console.log('Дублей нет.');
    process.exit(0);
  }

  if (dryRun) {
    console.log('\n[--dry-run] Удалить следующие id (первые 10):', toDelete.slice(0, 10));
    console.log('Для реального удаления запустите без --dry-run.');
    process.exit(0);
  }

  const result = await prisma.propertyPhoto.deleteMany({
    where: { id: { in: toDelete } },
  });
  console.log('Удалено записей:', result.count);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
