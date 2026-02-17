/**
 * Приведение propertyValue к единому формату: везде КОД модели (Код модели Domeo (Web)),
 * а не Название модели. Строит маппинг название → код по товарам, обновляет записи.
 *
 * Запуск: npx tsx scripts/normalize-property-photos-to-code.ts [--dry-run]
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

  const products = await prisma.product.findMany({
    where: { catalog_category_id: doorsCatId },
    select: { properties_data: true },
  });

  const modelCodes = new Set<string>();
  const nameToCode = new Map<string, string>(); // название модели (lowercase) → код

  for (const p of products) {
    const data = p.properties_data;
    if (!data) continue;
    const props = typeof data === 'string' ? JSON.parse(data) : data;
    const code = (props['Код модели Domeo (Web)'] ?? '').toString().trim();
    const name = (props['Название модели'] ?? '').toString().trim();
    if (code) modelCodes.add(code);
    if (name && code) {
      const key = name.toLowerCase().trim();
      if (!nameToCode.has(key)) nameToCode.set(key, code);
    }
  }

  console.log('Кодов моделей в товарах:', modelCodes.size);
  console.log('Пар название→код (из товаров):', nameToCode.size);

  const rows = await prisma.propertyPhoto.findMany({
    where: {
      categoryId: doorsCatId,
      propertyName: DOOR_COLOR_PROPERTY,
    },
    select: { id: true, propertyValue: true, photoType: true },
  });

  let updated = 0;
  let deleted = 0;
  let noMapping = 0;
  const existingByKey = new Map<string, string>(); // (propertyValue|photoType) -> id

  for (const row of rows) {
    const val = row.propertyValue ?? '';
    const parts = val.split('|').map((s) => s.trim());
    const first = parts[0] ?? '';
    if (!first) continue;
    if (modelCodes.has(first)) {
      const key = `${val}|${row.photoType}`;
      if (!existingByKey.has(key)) existingByKey.set(key, row.id);
    }
  }

  for (const row of rows) {
    const val = row.propertyValue ?? '';
    const parts = val.split('|').map((s) => s.trim());
    const first = parts[0] ?? '';
    if (!first) continue;
    if (modelCodes.has(first)) continue;

    const code = nameToCode.get(first.toLowerCase()) ?? nameToCode.get(first);
    if (!code) {
      noMapping++;
      if (noMapping <= 5) console.log('Нет кода для названия:', first);
      continue;
    }

    const rest = parts.slice(1).join('|');
    const newValue = `${code}|${rest}`;
    const newKey = `${newValue}|${row.photoType}`;

    if (existingByKey.has(newKey)) {
      if (dryRun) {
        console.log('[dry-run] Удалить дубль (есть запись по коду):', val.slice(0, 50));
      } else {
        await prisma.propertyPhoto.delete({ where: { id: row.id } });
        deleted++;
      }
      continue;
    }

    if (dryRun) {
      console.log('[dry-run] Обновить:', first.slice(0, 35), '->', code);
      updated++;
      existingByKey.set(newKey, row.id);
      continue;
    }

    await prisma.propertyPhoto.update({
      where: { id: row.id },
      data: { propertyValue: newValue },
    });
    updated++;
    existingByKey.set(newKey, row.id);
  }

  console.log('\nИтого:');
  console.log('  Обновлено (название → код):', updated);
  console.log('  Удалено (дубль по коду уже был):', deleted);
  console.log('  Без маппинга название→код:', noMapping);
  if (dryRun && (updated > 0 || deleted > 0)) {
    console.log('\nДля применения запустите без --dry-run.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
