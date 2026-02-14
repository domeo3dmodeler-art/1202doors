/**
 * Для моделей без обложки по коду (Invisible, Comet 3, Nebula 6 и др.) подставляет
 * первое доступное фото из Domeo_Модель_Цвет (по фабричному названию или по префиксу кода).
 * Запуск: npx tsx scripts/fix-missing-model-covers.ts [--dry-run] [--codes=Invisible,Comet_3,Nebula_6]
 */
import { PrismaClient } from '@prisma/client';
import { getDoorsCategoryId } from '../lib/catalog-categories';
import { upsertPropertyPhoto, DOOR_MODEL_CODE_PROPERTY } from '../lib/property-photos';

const prisma = new PrismaClient();
const DOOR_COLOR_PROPERTY = 'Domeo_Модель_Цвет';

const DEFAULT_CODES = ['DomeoDoors_Invisible', 'DomeoDoors_Comet_3', 'DomeoDoors_Nebula_6'];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const codesArg = process.argv.find((a) => a.startsWith('--codes='));
  const codes = codesArg
    ? codesArg.replace('--codes=', '').split(',').map((c) => c.trim()).filter(Boolean).map((c) => c.includes('DomeoDoors_') ? c : `DomeoDoors_${c}`)
    : DEFAULT_CODES;

  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    console.error('Категория "Межкомнатные двери" не найдена.');
    process.exit(1);
  }

  console.log('=== Обложки для моделей без фото по коду ===\n');
  console.log('Коды:', codes.join(', '));

  // Фабричные названия по коду из товаров
  const products = await prisma.product.findMany({
    where: { catalog_category_id: doorsCategoryId, is_active: true },
    select: { properties_data: true },
  });
  const codeToFactoryNames = new Map<string, string[]>();
  for (const p of products) {
    let props: Record<string, unknown> = {};
    try {
      props = typeof p.properties_data === 'string' ? JSON.parse(p.properties_data) : (p.properties_data as object) || {};
    } catch {
      continue;
    }
    const code = String(props['Код модели Domeo (Web)'] ?? '').trim();
    const name = props['Domeo_Название модели для Web'];
    if (!code || typeof name !== 'string' || !name.trim()) continue;
    if (!codeToFactoryNames.has(code)) codeToFactoryNames.set(code, []);
    const arr = codeToFactoryNames.get(code)!;
    if (!arr.includes(name.trim())) arr.push(name.trim());
  }

  for (const code of codes) {
    const propertyValue = code.toLowerCase();
    const factoryNames = codeToFactoryNames.get(code) || [];

    const existing = await prisma.propertyPhoto.findFirst({
      where: {
        categoryId: doorsCategoryId,
        propertyName: DOOR_MODEL_CODE_PROPERTY,
        propertyValue,
        photoType: 'cover',
      },
      select: { photoPath: true },
    });

    if (existing?.photoPath && !existing.photoPath.includes('undefined')) {
      console.log(`\n${code}: уже есть обложка → ${existing.photoPath}`);
      continue;
    }

    if (existing?.photoPath?.includes('undefined')) {
      if (!dryRun) {
        await prisma.propertyPhoto.deleteMany({
          where: {
            categoryId: doorsCategoryId,
            propertyName: DOOR_MODEL_CODE_PROPERTY,
            propertyValue,
            photoPath: { contains: 'undefined' },
          },
        });
        console.log(`\n${code}: удалена битая запись`);
      }
    }

    let colorPhoto: { photoPath: string; propertyValue: string } | null = null;

    for (const name of factoryNames) {
      const found = await prisma.propertyPhoto.findFirst({
        where: {
          categoryId: doorsCategoryId,
          propertyName: DOOR_COLOR_PROPERTY,
          propertyValue: { startsWith: name.trim() + '|' },
        },
        select: { photoPath: true, propertyValue: true },
      });
      if (found?.photoPath) {
        colorPhoto = found;
        break;
      }
    }
    if (!colorPhoto) {
      const byCodePrefix = await prisma.propertyPhoto.findFirst({
        where: {
          categoryId: doorsCategoryId,
          propertyName: DOOR_COLOR_PROPERTY,
          propertyValue: { startsWith: code + '|' },
        },
        select: { photoPath: true, propertyValue: true },
      });
      if (byCodePrefix?.photoPath) colorPhoto = byCodePrefix;
    }
    if (!colorPhoto?.photoPath) {
      const placeholderPath = '/uploads/placeholders/door-missing.svg';
      console.log(`\n${code}: нет фото в Domeo_Модель_Цвет (фабричные названия: ${factoryNames.join('; ') || '—'}). Подставляю заглушку.`);
      if (!dryRun) {
        const ok = await upsertPropertyPhoto(doorsCategoryId, DOOR_MODEL_CODE_PROPERTY, propertyValue, placeholderPath, 'cover', { originalFilename: 'door-missing.svg' });
        console.log(ok ? '  OK' : '  Ошибка');
      }
      continue;
    }

    console.log(`\n${code}: обложка из цвета → ${colorPhoto.photoPath}`);

    if (dryRun) {
      console.log('[dry-run] upsert', DOOR_MODEL_CODE_PROPERTY, propertyValue, colorPhoto.photoPath);
      continue;
    }

    const ok = await upsertPropertyPhoto(
      doorsCategoryId,
      DOOR_MODEL_CODE_PROPERTY,
      propertyValue,
      colorPhoto.photoPath,
      'cover',
      { originalFilename: colorPhoto.photoPath.split('/').pop() || '' }
    );
    console.log(ok ? '  OK' : '  Ошибка');
  }

  console.log('\n---');
  console.log('После изменений обновите данные на странице каталога:');
  console.log('  - откройте /doors?refresh=1 (один раз) или');
  console.log('  - DELETE /api/catalog/doors/complete-data (с авторизацией) + обновите /doors');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
