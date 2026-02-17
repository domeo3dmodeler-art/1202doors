/**
 * Проверка для одного кода модели: набор товаров, покрытия, цвета, привязка фото.
 * Запуск: npx tsx scripts/inspect-model-coatings-colors.ts Diamond_1
 *        npx tsx scripts/inspect-model-coatings-colors.ts DomeoDoors_Diamond_1
 */
import { PrismaClient } from '@prisma/client';
import { getDoorsCategoryId } from '../lib/catalog-categories';
import { getPropertyPhotos, getPropertyPhotosByValuePrefix } from '../lib/property-photos';

const prisma = new PrismaClient();

function normalizeCode(code: string): string {
  const s = code.trim();
  if (/^domeodoors_/i.test(s)) return s;
  if (/^diamond/i.test(s)) return `DomeoDoors_${s.replace(/^diamond/i, 'Diamond')}`;
  return s;
}

async function main() {
  const codeArg = process.argv[2] || 'Diamond_1';
  const modelCode = normalizeCode(codeArg);
  const modelCodeLower = modelCode.toLowerCase();

  console.log('=== Проверка кода модели:', modelCode, '===\n');

  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    console.log('ОШИБКА: Категория "Межкомнатные двери" не найдена.');
    process.exit(1);
  }

  // 1. Товары с этим кодом
  const products = await prisma.product.findMany({
    where: {
      catalog_category_id: doorsCategoryId,
      is_active: true,
    },
    select: { id: true, sku: true, properties_data: true },
  });

  const withCode: Array<{
    id: string;
    sku: string;
    style: string;
    coating: string;
    color: string;
    modelName: string;
  }> = [];
  for (const p of products) {
    const props = typeof p.properties_data === 'string'
      ? JSON.parse(p.properties_data as string) as Record<string, unknown>
      : (p.properties_data as Record<string, unknown>) || {};
    const code = String(props['Код модели Domeo (Web)'] ?? '').trim();
    if (code.toLowerCase() !== modelCodeLower) continue;
    withCode.push({
      id: p.id,
      sku: p.sku,
      style: String(props['Domeo_Стиль Web'] ?? '').trim(),
      coating: String(props['Тип покрытия'] ?? '').trim(),
      color: String(props['Цвет/Отделка'] ?? '').trim(),
      modelName: String(props['Название модели'] ?? '').trim(),
    });
  }

  console.log('1. Товары с кодом', modelCode);
  console.log('   Всего:', withCode.length);
  if (withCode.length > 0) {
    const sample = withCode[0];
    const sampleProduct = products.find((p) => {
      const props = typeof p.properties_data === 'string' ? JSON.parse(p.properties_data as string) as Record<string, unknown> : (p.properties_data as Record<string, unknown>) || {};
      return String(props['Код модели Domeo (Web)'] ?? '').trim().toLowerCase() === modelCodeLower;
    });
    if (sampleProduct) {
      const props = typeof sampleProduct.properties_data === 'string' ? JSON.parse(sampleProduct.properties_data as string) as Record<string, unknown> : (sampleProduct.properties_data as Record<string, unknown>) || {};
      const allKeys = Object.keys(props).sort();
      const colorLike = allKeys.filter((k) => /цвет|отдел|color|краск/i.test(k));
      console.log('   Ключи, связанные с цветом:', colorLike.length ? colorLike.join(', ') : '(нет)');
      colorLike.forEach((k) => console.log('     ', k, '=', JSON.stringify((props as Record<string, unknown>)[k])));
      if (!('Цвет/Отделка' in props) || (props['Цвет/Отделка'] === '' || props['Цвет/Отделка'] == null)) {
        console.log('   ВНИМАНИЕ: свойство "Цвет/Отделка" не заполнено — из-за этого complete-data не строит варианты цветов.');
      }
    }
  }
  if (withCode.length === 0) {
    console.log('   Товаров с таким кодом нет. Проверьте код (например DomeoDoors_Diamond_1).');
    process.exit(0);
  }

  const styles = [...new Set(withCode.map((x) => x.style))].filter(Boolean).sort();
  console.log('   Стили:', styles.length ? styles.join(', ') : '(не заполнено)');

  const coatingsSet = new Set<string>();
  const colorsByCoating: Record<string, Set<string>> = {};
  const pairs: Array<{ coating: string; color: string }> = [];
  for (const r of withCode) {
    if (r.coating) coatingsSet.add(r.coating);
    if (r.coating && r.color) {
      if (!colorsByCoating[r.coating]) colorsByCoating[r.coating] = new Set<string>();
      colorsByCoating[r.coating].add(r.color);
      pairs.push({ coating: r.coating, color: r.color });
    }
  }

  console.log('\n2. Покрытия (Тип покрытия) по товарам');
  const coatingsList = Array.from(coatingsSet).sort();
  console.log('   Набор:', coatingsList.length ? coatingsList.join(', ') : '(нет или не заполнено)');

  console.log('\n3. Цвета по покрытию (Цвет/Отделка)');
  for (const co of coatingsList) {
    const colors = colorsByCoating[co] ? Array.from(colorsByCoating[co]).sort() : [];
    console.log('   ', co + ':', colors.length ? colors.join(', ') : '(нет)');
  }

  // Уникальные пары покрытие+цвет (как в complete-data)
  const pairKeys = new Set(pairs.map((p) => `${p.coating}_${p.color}`));
  console.log('\n4. Уникальные пары (покрытие + цвет) для API:', pairKeys.size);
  for (const key of Array.from(pairKeys).sort()) {
    console.log('   ', key);
  }

  // 5. PropertyPhoto — обложка по коду
  console.log('\n5. PropertyPhoto: обложка по коду ("Код модели Domeo (Web)")');
  const byCode = await getPropertyPhotos(doorsCategoryId, 'Код модели Domeo (Web)', modelCodeLower);
  if (byCode.length === 0) {
    console.log('   Записей нет. propertyValue в БД должен быть:', modelCodeLower);
  } else {
    for (const ph of byCode) {
      console.log('   propertyValue:', ph.propertyValue, '| photoType:', ph.photoType, '| photoPath:', ph.photoPath?.slice(0, 60) + (ph.photoPath && ph.photoPath.length > 60 ? '...' : ''));
    }
  }

  // 6. PropertyPhoto — по цветам (Domeo_Модель_Цвет), префикс код|
  console.log('\n6. PropertyPhoto: фото цветов (Domeo_Модель_Цвет), префикс "' + modelCode + '|"');
  const byPrefix = await getPropertyPhotosByValuePrefix(doorsCategoryId, 'Domeo_Модель_Цвет', modelCode + '|');
  if (byPrefix.length === 0) {
    const altPrefix = modelCodeLower + '|';
    const byPrefixLower = await getPropertyPhotosByValuePrefix(doorsCategoryId, 'Domeo_Модель_Цвет', altPrefix);
    if (byPrefixLower.length > 0) {
      console.log('   Найдено по префиксу "' + altPrefix + '":', byPrefixLower.length, 'записей');
      for (const ph of byPrefixLower.slice(0, 10)) {
        console.log('   ', ph.propertyValue, '→', ph.photoPath?.slice(0, 55) || '');
      }
      if (byPrefixLower.length > 10) console.log('   ... и ещё', byPrefixLower.length - 10);
    } else {
      console.log('   Записей нет. Ожидаемый формат propertyValue: "' + modelCode + '|Тип покрытия|Цвет" (например ' + modelCode + '|ПВХ|Белый)');
    }
  } else {
    for (const ph of byPrefix) {
      console.log('   ', ph.propertyValue, '→', ph.photoPath?.slice(0, 55) || '(путь пустой)');
    }
  }

  // 7. Проверка по каждой паре: есть ли фото в PropertyPhoto
  console.log('\n7. Привязка фото по каждой паре (getPropertyPhotos Domeo_Модель_Цвет, value = код|покрытие|цвет)');
  for (const pair of Array.from(pairKeys).sort()) {
    const [coating, color] = pair.split('_');
    const colorName = (pair.match(/_([^_]+)$/)?.[1] ?? color) || color;
    const propertyValue = `${modelCode}|${coating}|${colorName}`;
    const photos = await getPropertyPhotos(doorsCategoryId, 'Domeo_Модель_Цвет', propertyValue);
    const cover = photos.find((ph) => ph.photoType === 'cover');
    const path = cover?.photoPath ?? '(нет)';
    console.log('   ', pair, '→', path.slice(0, 70));
  }

  console.log('\n--- конец отчёта ---');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
