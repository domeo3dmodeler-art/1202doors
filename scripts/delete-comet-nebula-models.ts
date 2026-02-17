/**
 * Удаление моделей Comet_3 и Nebula_6 из БД: товары с Код модели Domeo (Web) = DomeoDoors_Comet_3 или DomeoDoors_Nebula_6,
 * а также связанные записи PropertyPhoto.
 * Запуск: npx tsx scripts/delete-comet-nebula-models.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client';
import { getDoorsCategoryId } from '../lib/catalog-categories';
import { DOOR_MODEL_CODE_PROPERTY } from '../lib/property-photos';

const prisma = new PrismaClient();

const CODES = ['DomeoDoors_Comet_3', 'DomeoDoors_Nebula_6'];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    console.error('Категория "Межкомнатные двери" не найдена.');
    process.exit(1);
  }

  const products = await prisma.product.findMany({
    where: { catalog_category_id: doorsCategoryId },
    select: { id: true, sku: true, name: true, properties_data: true },
  });

  const toDelete = products.filter((p) => {
    let props: Record<string, unknown> = {};
    try {
      props = typeof p.properties_data === 'string' ? JSON.parse(p.properties_data) : (p.properties_data as object) || {};
    } catch {
      return false;
    }
    const code = String(props['Код модели Domeo (Web)'] ?? '').trim();
    return CODES.includes(code);
  });

  console.log('=== Удаление моделей Comet_3 и Nebula_6 ===\n');
  console.log('Товаров к удалению:', toDelete.length);
  toDelete.forEach((p) => console.log('  -', p.sku, '|', p.name));

  const productIds = toDelete.map((p) => p.id);

  if (!dryRun && productIds.length > 0) {
    const deletedProducts = await prisma.product.deleteMany({
      where: { id: { in: productIds } },
    });
    console.log('\nУдалено товаров (ProductImage удаляются каскадом):', deletedProducts.count);
  } else if (dryRun && productIds.length > 0) {
    console.log('\n[dry-run] Товары не удалялись.');
  }

  const codeValues = CODES.map((c) => c.toLowerCase());
  const ppByCode = await prisma.propertyPhoto.findMany({
    where: {
      categoryId: doorsCategoryId,
      propertyName: DOOR_MODEL_CODE_PROPERTY,
      propertyValue: { in: codeValues },
    },
    select: { id: true },
  });
  const ppLegacy = await prisma.propertyPhoto.findMany({
    where: {
      categoryId: doorsCategoryId,
      propertyName: 'Артикул поставщика',
      propertyValue: { in: codeValues },
    },
    select: { id: true },
  });
  const ppColor = await prisma.propertyPhoto.findMany({
    where: {
      categoryId: doorsCategoryId,
      propertyName: 'Domeo_Модель_Цвет',
      OR: [
        { propertyValue: { contains: 'Comet_3' } },
        { propertyValue: { contains: 'comet_3' } },
        { propertyValue: { contains: 'Nebula_6' } },
        { propertyValue: { contains: 'nebula_6' } },
      ],
    },
    select: { id: true },
  });

  console.log('\nPropertyPhoto к удалению:');
  console.log('  - обложки по коду:', ppByCode.length + ppLegacy.length);
  console.log('  - Domeo_Модель_Цвет (Comet_3 / Nebula_6):', ppColor.length);

  const allToDelete = [...ppByCode, ...ppLegacy, ...ppColor];
  if (!dryRun && allToDelete.length > 0) {
    const deleted = await prisma.propertyPhoto.deleteMany({
      where: { id: { in: allToDelete.map((p) => p.id) } },
    });
    console.log('Удалено записей PropertyPhoto:', deleted.count);
  } else if (dryRun && allToDelete.length > 0) {
    console.log('[dry-run] PropertyPhoto не удалялись.');
  }

  console.log('\nГотово.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
