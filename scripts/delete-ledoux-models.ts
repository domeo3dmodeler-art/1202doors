/**
 * Удаление моделей Ledoux из БД: товары с Код модели Domeo (Web) = DomeoDoors_Ledoux_1 или DomeoDoors_Ledoux_2,
 * а также связанные записи PropertyPhoto.
 * Запуск: npx tsx scripts/delete-ledoux-models.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client';
import { getDoorsCategoryId } from '../lib/catalog-categories';
import { DOOR_MODEL_CODE_PROPERTY } from '../lib/property-photos';

const prisma = new PrismaClient();

const LEDOUX_CODES = ['DomeoDoors_Ledoux_1', 'DomeoDoors_Ledoux_2'];

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
    return LEDOUX_CODES.includes(code);
  });

  console.log('=== Удаление моделей Ledoux ===\n');
  console.log('Товаров к удалению:', toDelete.length);
  toDelete.forEach((p) => console.log('  -', p.sku, '|', p.name));

  if (toDelete.length === 0) {
    console.log('Нет товаров с кодами DomeoDoors_Ledoux_1 / DomeoDoors_Ledoux_2.');
    // Всё равно удалим PropertyPhoto по этим кодам, если остались
  }

  const productIds = toDelete.map((p) => p.id);

  if (!dryRun && productIds.length > 0) {
    const deletedProducts = await prisma.product.deleteMany({
      where: { id: { in: productIds } },
    });
    console.log('\nУдалено товаров (ProductImage удаляются каскадом):', deletedProducts.count);
  } else if (dryRun && productIds.length > 0) {
    console.log('\n[dry-run] Товары не удалялись.');
  }

  // PropertyPhoto: по коду модели (Код модели Domeo (Web)) и устаревшему «Артикул поставщика», плюс Domeo_Модель_Цвет с Ledoux
  const codeValues = LEDOUX_CODES.map((c) => c.toLowerCase());
  const ppByCode = await prisma.propertyPhoto.findMany({
    where: {
      categoryId: doorsCategoryId,
      propertyName: DOOR_MODEL_CODE_PROPERTY,
      propertyValue: { in: codeValues },
    },
    select: { id: true, propertyValue: true, photoPath: true },
  });
  const ppLegacy = await prisma.propertyPhoto.findMany({
    where: {
      categoryId: doorsCategoryId,
      propertyName: 'Артикул поставщика',
      propertyValue: { in: codeValues },
    },
    select: { id: true, propertyValue: true, photoPath: true },
  });
  const ppArticle = [...ppByCode, ...ppLegacy];
  const ppColorLedoux = await prisma.propertyPhoto.findMany({
    where: {
      categoryId: doorsCategoryId,
      propertyName: 'Domeo_Модель_Цвет',
      OR: [
        { propertyValue: { contains: 'Ledoux' } },
        { propertyValue: { contains: 'ledoux' } },
      ],
    },
    select: { id: true, propertyValue: true },
  });

  console.log('\nPropertyPhoto к удалению:');
  console.log('  - обложки по коду (Код модели Domeo (Web) / Артикул поставщика):', ppArticle.length);
  console.log('  - Domeo_Модель_Цвет (содержит Ledoux):', ppColorLedoux.length);

  const allToDelete = [...ppArticle, ...ppColorLedoux];
  if (!dryRun && allToDelete.length > 0) {
    const ids = allToDelete.map((p) => p.id);
    const deleted = await prisma.propertyPhoto.deleteMany({
      where: { id: { in: ids } },
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
