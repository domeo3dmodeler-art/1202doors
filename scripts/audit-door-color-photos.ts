/**
 * Аудит и (опционально) нормализация property_photos для фото цветов дверей.
 *
 * Правило: цвет не зависит от размера. Ключ = Код модели|Тип покрытия|Цвет (ровно 3 части).
 * См. docs/DOOR_DB_ARCHITECTURE_COLOR_AND_PHOTOS.md
 *
 * Запуск:
 *   npx tsx scripts/audit-door-color-photos.ts              — только отчёт
 *   npx tsx scripts/audit-door-color-photos.ts --fix         — нормализовать ключи и удалить дубликаты по размеру
 *   npx tsx scripts/audit-door-color-photos.ts --fix --dry-run
 */

import { PrismaClient } from '@prisma/client';
import { getDoorsCategoryId } from '../lib/catalog-categories';
import { DOOR_COLOR_PROPERTY } from '../lib/property-photos';

const prisma = new PrismaClient();

const DOOR_COLOR_PROP = DOOR_COLOR_PROPERTY;

/** Похоже на код модели (DomeoDoors_Base_1, domeodoors_pearl_6), а не на "Название модели" */
function looksLikeCode(firstPart: string): boolean {
  const s = firstPart.trim();
  if (!s) return false;
  // Код: буквы/цифры/подчёркивание, часто domeodoors_ или похоже
  if (/^[a-z0-9_]+$/i.test(s)) return true;
  if (/^domeodoors_/i.test(s)) return true;
  // Название модели обычно с пробелами или кириллицей
  if (/\s/.test(s) || /[а-яё]/i.test(s)) return false;
  return true;
}

async function main() {
  const fix = process.argv.includes('--fix');
  const dryRun = process.argv.includes('--dry-run');

  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    console.error('Категория "Межкомнатные двери" не найдена.');
    process.exit(1);
  }

  const colorPhotos = await prisma.propertyPhoto.findMany({
    where: {
      categoryId: doorsCategoryId,
      propertyName: DOOR_COLOR_PROP,
    },
    orderBy: [{ propertyValue: 'asc' }, { photoType: 'asc' }],
  });

  console.log('=== Аудит PropertyPhoto (Domeo_Модель_Цвет) ===\n');
  console.log('Всего записей:', colorPhotos.length);

  // Маппинг «Название модели» → «Код модели» из товаров
  const products = await prisma.product.findMany({
    where: { catalog_category_id: doorsCategoryId, is_active: true },
    select: { properties_data: true },
  });
  const nameToCode = new Map<string, string>();
  for (const p of products) {
    const props =
      typeof p.properties_data === 'string'
        ? (JSON.parse(p.properties_data as string) as Record<string, unknown>)
        : (p.properties_data as Record<string, unknown>) || {};
    const name = String(props['Название модели'] ?? '').trim();
    const code = String(props['Код модели Domeo (Web)'] ?? '').trim();
    if (name && code && !nameToCode.has(name)) nameToCode.set(name, code);
  }
  console.log('Уникальных названий моделей → код в Product:', nameToCode.size);

  const ok: typeof colorPhotos = [];
  const wrongParts: (typeof colorPhotos)[0][] = [];
  const nameInsteadOfCode: (typeof colorPhotos)[0][] = [];

  for (const row of colorPhotos) {
    const parts = row.propertyValue.split('|').map((s) => s.trim());
    if (parts.length !== 3) {
      wrongParts.push(row);
      continue;
    }
    const [first, ,] = parts;
    if (!looksLikeCode(first)) nameInsteadOfCode.push(row);
    else ok.push(row);
  }

  console.log('\n--- Результаты ---');
  console.log('Записей с корректным ключом (3 части, первая похожа на код):', ok.length);
  console.log('Записей с неправильным числом частей (не 3, возможно размер в ключе):', wrongParts.length);
  console.log('Записей, где первая часть похожа на «Название модели», а не на код:', nameInsteadOfCode.length);

  if (wrongParts.length > 0) {
    console.log('\nПримеры записей с числом частей ≠ 3:');
    wrongParts.slice(0, 10).forEach((r) => {
      const n = r.propertyValue.split('|').length;
      console.log(`  [${n} частей] ${r.propertyValue.slice(0, 80)}${r.propertyValue.length > 80 ? '...' : ''} (photoType: ${r.photoType})`);
    });
    if (wrongParts.length > 10) console.log('  ... и ещё', wrongParts.length - 10);
  }

  if (nameInsteadOfCode.length > 0) {
    console.log('\nПримеры записей с «Название модели» в первой части (API ищет по коду — не найдёт):');
    nameInsteadOfCode.slice(0, 10).forEach((r) => {
      const first = r.propertyValue.split('|')[0] ?? '';
      const code = nameToCode.get(first) ?? '(код в Product не найден)';
      console.log(`  "${first}" → код: ${code}`);
    });
    if (nameInsteadOfCode.length > 10) console.log('  ... и ещё', nameInsteadOfCode.length - 10);
  }

  if (!fix) {
    if (wrongParts.length > 0 || nameInsteadOfCode.length > 0) {
      console.log('\nДля нормализации запустите: npx tsx scripts/audit-door-color-photos.ts --fix [--dry-run]');
    }
    return;
  }

  console.log('\n--- Режим --fix' + (dryRun ? ' (dry-run)' : '') + ' ---');

  const toDelete: string[] = [];
  const toCreate: Array<{ propertyValue: string; photoPath: string; photoType: string }> = [];

  // 1) Записи с 4+ частей: схлопываем в одну запись на (код, покрытие, цвет), по одному фото на каждый photoType
  const byNormalized = new Map<string, (typeof colorPhotos)[0][]>();
  for (const row of wrongParts) {
    const parts = row.propertyValue.split('|').map((s) => s.trim());
    const code = parts[0] ?? '';
    const coating = parts[1] ?? '';
    const color = parts[2] ?? '';
    const normalized = `${code}|${coating}|${color}`;
    if (!byNormalized.has(normalized)) byNormalized.set(normalized, []);
    byNormalized.get(normalized)!.push(row);
  }
  for (const [keepValue, rows] of byNormalized) {
    const seenPhotoType = new Set<string>();
    for (const r of rows) {
      toDelete.push(r.id);
      if (!seenPhotoType.has(r.photoType) && r.photoPath) {
        seenPhotoType.add(r.photoType);
        toCreate.push({ propertyValue: keepValue, photoPath: r.photoPath, photoType: r.photoType });
      }
    }
  }

  // 2) Записи с «Название модели» в первой части: переписать на код (одна запись на (newValue, photoType))
  const nameToCreate = new Map<string, { photoPath: string; photoType: string }>();
  for (const row of nameInsteadOfCode) {
    const parts = row.propertyValue.split('|').map((s) => s.trim());
    const nameOrCode = parts[0] ?? '';
    const coating = parts[1] ?? '';
    const color = parts[2] ?? '';
    const code = nameToCode.get(nameOrCode) ?? nameOrCode;
    const newValue = `${code}|${coating}|${color}`;
    const key = `${newValue}\0${row.photoType}`;
    toDelete.push(row.id);
    if (!nameToCreate.has(key) && row.photoPath) {
      nameToCreate.set(key, { photoPath: row.photoPath, photoType: row.photoType });
      toCreate.push({ propertyValue: newValue, photoPath: row.photoPath, photoType: row.photoType });
    }
  }
  // Убрать дубликаты toCreate по (propertyValue, photoType) — оставить один на комбинацию
  const createKey = (c: (typeof toCreate)[0]) => `${c.propertyValue}\0${c.photoType}`;
  const seenCreate = new Set<string>();
  const toCreateDedup = toCreate.filter((c) => {
    const k = createKey(c);
    if (seenCreate.has(k)) return false;
    seenCreate.add(k);
    return true;
  });
  toCreate.length = 0;
  toCreate.push(...toCreateDedup);

  const existingOkKeys = new Set(ok.map((r) => `${r.propertyValue.toLowerCase()}\0${r.photoType}`));
  const toCreateFiltered = toCreate.filter((c) => !existingOkKeys.has(createKey(c).toLowerCase()));

  if (dryRun) {
    console.log('Будет удалено записей:', toDelete.length);
    console.log('Будет создано записей (нормализованный ключ):', toCreateFiltered.length, toCreate.length !== toCreateFiltered.length ? `(пропущено ${toCreate.length - toCreateFiltered.length} — уже есть в БД)` : '');
    return;
  }

  for (const id of toDelete) {
    await prisma.propertyPhoto.delete({ where: { id } });
  }
  for (const c of toCreateFiltered) {
    await prisma.propertyPhoto.create({
      data: {
        categoryId: doorsCategoryId,
        propertyName: DOOR_COLOR_PROP,
        propertyValue: c.propertyValue,
        photoPath: c.photoPath,
        photoType: c.photoType,
      },
    });
  }
  console.log('Удалено записей:', toDelete.length);
  console.log('Создано записей с нормализованным ключом:', toCreateFiltered.length);
  console.log('Готово. Очистите кэш complete-data (DELETE /api/catalog/doors/complete-data) и проверьте конфигуратор.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
