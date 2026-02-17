/**
 * Удаление из БД дверей по коду модели (Код модели Domeo (Web)).
 * Использование: npx tsx scripts/delete-door-models-by-code.ts [--yes]
 * По умолчанию — dry-run. С флагом --yes — удаление.
 */
import { PrismaClient } from '@prisma/client';
import { getDoorsCategoryId } from '../lib/catalog-categories';
import { DOOR_COLOR_PROPERTY } from '../lib/property-photos';

const prisma = new PrismaClient();

const TARGET_MODEL_CODES: string[] = [
  'DomeoDoors_Comet_3',
];

function parseProps(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return value as Record<string, unknown>;
}

async function main() {
  const apply = process.argv.includes('--yes');
  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    throw new Error('Категория "Межкомнатные двери" не найдена');
  }

  const products = await prisma.product.findMany({
    where: { catalog_category_id: doorsCategoryId },
    select: { id: true, sku: true, properties_data: true },
  });

  const toDeleteProducts = products.filter((p) => {
    const props = parseProps(p.properties_data);
    const code = String(props['Код модели Domeo (Web)'] ?? '').trim();
    return TARGET_MODEL_CODES.includes(code);
  });

  const factoryNames = new Set<string>();
  for (const p of toDeleteProducts) {
    const props = parseProps(p.properties_data);
    const name = String(props['Название модели'] ?? '').trim();
    if (name) factoryNames.add(name);
  }

  const allColorPhotos = await prisma.propertyPhoto.findMany({
    where: { categoryId: doorsCategoryId, propertyName: DOOR_COLOR_PROPERTY },
    select: { id: true, propertyValue: true },
  });

  const toDeleteColorPhotoIds = allColorPhotos
    .filter((pp) => {
      const pv = String(pp.propertyValue || '');
      return (
        TARGET_MODEL_CODES.some((code) => pv.startsWith(`${code}|`)) ||
        [...factoryNames].some((name) => pv.startsWith(`${name}|`))
      );
    })
    .map((x) => x.id);

  console.log('Коды моделей к удалению:', TARGET_MODEL_CODES);
  console.log('Фабричные названия (для PropertyPhoto):', [...factoryNames]);
  console.log('Товаров к удалению:', toDeleteProducts.length);
  console.log('PropertyPhoto (Цвет) к удалению:', toDeleteColorPhotoIds.length);

  if (!apply) {
    console.log('\nDry-run. Для удаления запустите:');
    console.log('npx tsx scripts/delete-door-models-by-code.ts --yes');
    return;
  }

  const productIds = toDeleteProducts.map((p) => p.id);
  const deletedImages =
    productIds.length > 0
      ? await prisma.productImage.deleteMany({ where: { product_id: { in: productIds } } })
      : { count: 0 };
  const deletedProducts =
    productIds.length > 0
      ? await prisma.product.deleteMany({ where: { id: { in: productIds } } })
      : { count: 0 };
  const deletedPhotos =
    toDeleteColorPhotoIds.length > 0
      ? await prisma.propertyPhoto.deleteMany({ where: { id: { in: toDeleteColorPhotoIds } } })
      : { count: 0 };

  console.log('\nУдалено ProductImage:', deletedImages.count);
  console.log('Удалено Product:', deletedProducts.count);
  console.log('Удалено PropertyPhoto:', deletedPhotos.count);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
