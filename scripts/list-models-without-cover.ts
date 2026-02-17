/**
 * Список моделей дверей, у которых нет обложки в property_photos.
 * Обложка ищется так же, как в complete-data: по коду, по префиксу Domeo_Модель_Цвет, затем из coatings.
 *
 * Запуск: npx tsx scripts/list-models-without-cover.ts
 * Пример: для Cluster 3, Meteor 1, Quantum 2 — покажет их коды и подскажет, что нужно добавить записи в property_photos.
 */

import { PrismaClient } from '@prisma/client';
import { getDoorsCategoryId } from '../lib/catalog-categories';
import { getPropertyPhotos, getPropertyPhotosByValuePrefix, DOOR_COLOR_PROPERTY, DOOR_MODEL_CODE_PROPERTY } from '../lib/property-photos';

const prisma = new PrismaClient();

async function main() {
  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    console.error('Категория "Межкомнатные двери" не найдена.');
    process.exit(1);
  }

  const products = await prisma.product.findMany({
    where: {
      catalog_category_id: doorsCategoryId,
      is_active: true
    },
    select: { properties_data: true }
  });

  const modelKeys = new Set<string>();
  for (const p of products) {
    const props = typeof p.properties_data === 'string' ? JSON.parse(p.properties_data) : (p.properties_data || {});
    const code = String(props['Код модели Domeo (Web)'] ?? '').trim();
    if (code) modelKeys.add(code);
  }

  console.log('=== Модели без обложки (по коду и по префиксу Domeo_Модель_Цвет) ===\n');
  console.log('Всего уникальных кодов моделей в товарах:', modelKeys.size);

  const withoutCover: string[] = [];
  for (const modelKey of [...modelKeys].sort()) {
    const normalizedCode = modelKey.trim().toLowerCase();
    let hasCover = false;

    const byCode = await getPropertyPhotos(doorsCategoryId, DOOR_MODEL_CODE_PROPERTY, normalizedCode);
    if (byCode.some(ph => ph.photoType === 'cover')) hasCover = true;

    if (!hasCover) {
      const byPrefix = await getPropertyPhotosByValuePrefix(doorsCategoryId, DOOR_COLOR_PROPERTY, normalizedCode + '|');
      if (byPrefix.some(ph => ph.photoType === 'cover')) hasCover = true;
    }

    if (!hasCover && modelKey.trim() !== normalizedCode) {
      const byKeyPrefix = await getPropertyPhotosByValuePrefix(doorsCategoryId, DOOR_COLOR_PROPERTY, modelKey.trim() + '|');
      if (byKeyPrefix.some(ph => ph.photoType === 'cover')) hasCover = true;
    }

    if (!hasCover) withoutCover.push(modelKey);
  }

  console.log('Моделей без обложки:', withoutCover.length);
  if (withoutCover.length > 0) {
    console.log('\nКоды моделей без обложки:');
    withoutCover.forEach(code => console.log('  -', code));
    console.log('\nЧтобы обложки отображались, добавьте в property_photos одну из записей:');
    console.log('  1) propertyName = "Код модели Domeo (Web)", propertyValue = код в нижнем регистре (например ' + withoutCover[0].toLowerCase() + '), photoType = "cover"');
    console.log('  2) или хотя бы одну запись Domeo_Модель_Цвет с propertyValue вида "Код|Тип покрытия|Цвет" для этой модели.');
    console.log('\nСкрипты привязки: bind-color-folder-to-models.ts, import-final-filled.ts (лист Цвет), или ручная вставка в БД.');
  }
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
