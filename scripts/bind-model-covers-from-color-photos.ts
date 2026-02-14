/**
 * Оптимальный вариант: заполнить обложки моделей из существующих фото цветов (Domeo_Модель_Цвет).
 * Берём по одной обложке на каждый уникальный префикс (первая часть propertyValue),
 * сопоставляем с кодами моделей из товаров по порядку (сортировка по имени), создаём записи
 * PropertyPhoto с propertyName="Код модели Domeo (Web)" для отображения фото на фронте.
 *
 * Запуск: npx tsx scripts/bind-model-covers-from-color-photos.ts
 * После запуска: перезапустить приложение или вызвать DELETE /api/catalog/doors/complete-data (с авторизацией), чтобы сбросить кэш.
 */
import { PrismaClient } from '@prisma/client';
import { getDoorsCategoryId } from '../lib/catalog-categories';
import { DOOR_COLOR_PROPERTY, DOOR_MODEL_CODE_PROPERTY } from '../lib/property-photos';

const prisma = new PrismaClient();

async function main() {
  console.log('=== Привязка обложек моделей из фото цветов ===\n');

  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    console.log('ОШИБКА: Категория "Межкомнатные двери" не найдена.');
    process.exit(1);
  }

  // 1) Уникальные коды моделей из товаров (как в complete-data), отсортированные
  const products = await prisma.product.findMany({
    where: {
      catalog_category_id: doorsCategoryId,
      is_active: true,
    },
    select: { properties_data: true },
  });

  const modelKeysSet = new Set<string>();
  products.forEach((p) => {
    let props: Record<string, unknown> = {};
    try {
      props = typeof p.properties_data === 'string' ? JSON.parse(p.properties_data) : p.properties_data || {};
    } catch {
      return;
    }
    const domeoCode = String(props['Код модели Domeo (Web)'] ?? '').trim();
    const modelKey = domeoCode || String(props['Артикул поставщика'] ?? '').trim() || '';
    if (modelKey && modelKey.trim()) modelKeysSet.add(modelKey);
  });
  const modelKeys = Array.from(modelKeysSet).sort();
  console.log('Кодов моделей из товаров:', modelKeys.length);

  // 2) По одной обложке на каждый уникальный префикс (первая часть propertyValue) из Domeo_Модель_Цвет
  const colorPhotos = await prisma.propertyPhoto.findMany({
    where: {
      categoryId: doorsCategoryId,
      propertyName: DOOR_COLOR_PROPERTY,
      photoType: 'cover',
    },
    select: { propertyValue: true, photoPath: true },
  });

  const prefixToPhoto = new Map<string, string>();
  for (const r of colorPhotos) {
    const firstPart = r.propertyValue.split('|')[0]?.trim() || '';
    if (firstPart && !prefixToPhoto.has(firstPart)) {
      prefixToPhoto.set(firstPart, r.photoPath);
    }
  }
  const firstParts = Array.from(prefixToPhoto.keys()).sort();
  console.log('Уникальных префиксов в Domeo_Модель_Цвет (с обложкой):', firstParts.length);

  if (firstParts.length === 0) {
    console.log('Нет записей с photoType=cover в Domeo_Модель_Цвет. Нечего привязывать.');
    process.exit(0);
  }

  // 3) Сопоставление по индексу: firstParts[i] -> modelKeys[i] (оба массивы отсортированы)
  const toBind = Math.min(firstParts.length, modelKeys.length);

  for (let i = 0; i < toBind; i++) {
    const modelKey = modelKeys[i];
    const photoPath = prefixToPhoto.get(firstParts[i])!;
    const propertyValue = modelKey.toLowerCase();

    try {
      await prisma.propertyPhoto.upsert({
        where: {
          categoryId_propertyName_propertyValue_photoType: {
            categoryId: doorsCategoryId,
            propertyName: DOOR_MODEL_CODE_PROPERTY,
            propertyValue,
            photoType: 'cover',
          },
        },
        create: {
          categoryId: doorsCategoryId,
          propertyName: DOOR_MODEL_CODE_PROPERTY,
          propertyValue,
          photoType: 'cover',
          photoPath,
        },
        update: { photoPath },
      });
    } catch (e) {
      console.warn('Ошибка для', propertyValue, e);
    }
  }

  const withLocal = await prisma.propertyPhoto.count({
    where: {
      categoryId: doorsCategoryId,
      propertyName: DOOR_MODEL_CODE_PROPERTY,
      photoPath: { startsWith: '/uploads' },
    },
  });
  const with360 = await prisma.propertyPhoto.count({
    where: {
      categoryId: doorsCategoryId,
      propertyName: DOOR_MODEL_CODE_PROPERTY,
      photoPath: { contains: '360.yandex' },
    },
  });

  console.log('\nПривязано обложек моделей:', toBind);
  console.log('Из них с локальным путём (/uploads/...):', withLocal, '— будут отображаться на фронте.');
  if (with360 > 0) {
    console.log('Ссылки на 360.yandex.ru:', with360, '— на фронте не показываются (фильтр облака). Скачайте в public/uploads и обновите photoPath скриптом загрузки.');
  }
  console.log('\nДальше: перезапустите приложение или вызовите DELETE /api/catalog/doors/complete-data для сброса кэша, затем обновите страницу /doors.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
