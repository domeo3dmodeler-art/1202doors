/**
 * Удаляет битую обложку Invisible (путь с "undefined") и привязывает фото из Domeo_Модель_Цвет.
 * Запуск: npx tsx scripts/fix-invisible-cover.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client';
import { getDoorsCategoryId } from '../lib/catalog-categories';
import { upsertPropertyPhoto, DOOR_MODEL_CODE_PROPERTY } from '../lib/property-photos';

const prisma = new PrismaClient();
const DOOR_COLOR_PROPERTY = 'Domeo_Модель_Цвет';
const INVISIBLE_CODE = 'domeodoors_invisible';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    console.error('Категория "Межкомнатные двери" не найдена.');
    process.exit(1);
  }

  console.log('=== Исправление обложки Invisible ===\n');

  // 1) Удалить битые записи (photoPath содержит undefined)
  const bad = await prisma.propertyPhoto.findMany({
    where: {
      categoryId: doorsCategoryId,
      propertyName: DOOR_MODEL_CODE_PROPERTY,
      propertyValue: INVISIBLE_CODE,
      photoPath: { contains: 'undefined' },
    },
    select: { id: true, photoPath: true },
  });
  if (bad.length > 0) {
    console.log('Удаление битых записей:', bad.length, bad.map((r) => r.photoPath));
    if (!dryRun) {
      await prisma.propertyPhoto.deleteMany({
        where: { id: { in: bad.map((r) => r.id) } },
      });
    }
  }

  // 2) Найти первое фото из Domeo_Модель_Цвет для "Дверь Фантом Люкс" или по коду Invisible
  const colorPhoto = await prisma.propertyPhoto.findFirst({
    where: {
      categoryId: doorsCategoryId,
      propertyName: DOOR_COLOR_PROPERTY,
      OR: [
        { propertyValue: { startsWith: 'Дверь Фантом Люкс|' } },
        { propertyValue: { startsWith: 'DomeoDoors_Invisible|' } },
        { propertyValue: { startsWith: 'domeodoors_invisible|' } },
      ],
    },
    select: { photoPath: true, propertyValue: true },
  });

  if (!colorPhoto?.photoPath) {
    console.log('Нет фото в Domeo_Модель_Цвет для Invisible / Дверь Фантом Люкс. Добавьте привязку цветов и запустите снова.');
    return;
  }

  console.log('Обложка из Domeo_Модель_Цвет:', colorPhoto.propertyValue, '→', colorPhoto.photoPath);

  if (dryRun) {
    console.log('[dry-run] upsert', DOOR_MODEL_CODE_PROPERTY, INVISIBLE_CODE, colorPhoto.photoPath);
    return;
  }

  const ok = await upsertPropertyPhoto(
    doorsCategoryId,
    DOOR_MODEL_CODE_PROPERTY,
    INVISIBLE_CODE,
    colorPhoto.photoPath,
    'cover',
    { originalFilename: colorPhoto.photoPath.split('/').pop() || '' }
  );
  console.log(ok ? 'OK' : 'Ошибка');
  console.log('\nПерезапустите приложение или DELETE /api/catalog/doors/complete-data для сброса кэша.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
