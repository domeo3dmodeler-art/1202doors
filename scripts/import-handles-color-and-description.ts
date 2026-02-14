/**
 * Загружает из final_filled 30.01.xlsx для ручек:
 * - Лист «04 Ручки Завертки»: столбец «Цвет» → properties_data['Цвет'] (для фильтра).
 * - Лист «Описание»: описание для ручек → product.description (сопоставление по названию/первой колонке).
 *
 * Сопоставление с БД: по SKU = handle_${slug(Название (Domeo_наименование для Web))}.
 *
 * Запуск: npx tsx scripts/import-handles-color-and-description.ts [--dry-run]
 * Файл: 1002/final_filled 30.01.xlsx
 */

import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { getHandlesCategoryId } from '../lib/catalog-categories';

const prisma = new PrismaClient();

const FILE_PATH = path.join(__dirname, '..', '1002', 'final_filled 30.01.xlsx');

function slug(str: string): string {
  return String(str)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\wа-яё_-]/gi, '')
    .slice(0, 80) || 'item';
}

/** Значение ячейки по логическому имени столбца (trim, схлопывание пробелов). */
function getColumn(row: Record<string, unknown>, logicalName: string): string {
  const need = logicalName.replace(/\s+/g, ' ').trim();
  for (const k of Object.keys(row)) {
    if (String(k).replace(/\s+/g, ' ').trim() === need) return String(row[k] ?? '').trim();
  }
  return String((row as Record<string, string>)[logicalName] ?? '').trim();
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');

  if (!fs.existsSync(FILE_PATH)) {
    console.error('Файл не найден:', FILE_PATH);
    process.exit(1);
  }

  const handlesCatId = await getHandlesCategoryId();
  if (!handlesCatId) {
    console.error('Категория «Ручки и завертки» не найдена. Выполните seed-catalog-tree.');
    process.exit(1);
  }

  const workbook = XLSX.readFile(FILE_PATH, { cellDates: true, raw: false });
  const toJson = (sheetName: string): Record<string, unknown>[] => {
    const ws = workbook.Sheets[sheetName];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
  };

  const sheetRuchki = '04 Ручки Завертки';
  const sheetOpisanie = 'Описание';

  const ruchkiRows = toJson(sheetRuchki);
  const nameCol = 'Название (Domeo_наименование для Web)';
  const colorCol = 'Цвет';
  const descColRuchki = 'Описание';

  const opisanieRows = workbook.SheetNames.includes(sheetOpisanie) ? toJson(sheetOpisanie) : [];
  const descByName = new Map<string, string>();
  if (opisanieRows.length > 0) {
    const headers = Object.keys(opisanieRows[0] || {});
    const nameHeader = headers.find((h) => /название|ручка|наименование/i.test(String(h).trim())) || headers[0];
    const descHeader = headers.find((h) => /описание|текст|description/i.test(String(h).trim())) || headers[1] || headers[0];
    for (const row of opisanieRows) {
      const n = String(row[nameHeader] ?? (row as Record<string, string>)[headers[0]] ?? '').trim();
      const d = String(row[descHeader] ?? (row as Record<string, string>)[headers[1]] ?? '').trim();
      if (n) descByName.set(n, d);
    }
    console.log('Лист «Описание»: строк', opisanieRows.length, ', по ключу «' + nameHeader + '» → «' + descHeader + '»');
  } else {
    console.log('Лист «Описание» не найден или пуст.');
  }

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (const row of ruchkiRows) {
    const name = getColumn(row, nameCol) || String(row[nameCol] ?? '').trim();
    if (!name) {
      skipped++;
      continue;
    }

    const color = getColumn(row, colorCol) || String(row[colorCol] ?? '').trim();
    const descFromRuchki = getColumn(row, descColRuchki) || String(row[descColRuchki] ?? '').trim();
    const descFromOpisanie = descByName.get(name) ?? '';
    const description = descFromOpisanie || descFromRuchki || null;

    const sku = `handle_${slug(name)}`;
    const product = await prisma.product.findFirst({
      where: { sku, catalog_category_id: handlesCatId },
      select: { id: true, properties_data: true, description: true },
    });

    if (!product) {
      notFound++;
      if (notFound <= 5) console.log('[не в БД]', sku, name);
      continue;
    }

    let props: Record<string, unknown> = {};
    try {
      props = typeof product.properties_data === 'string'
        ? JSON.parse(product.properties_data)
        : (product.properties_data as Record<string, unknown>) || {};
    } catch {
      props = {};
    }

    const hasColorChange = color !== (props['Цвет'] as string);
    const hasDescChange = description !== null && description !== (product.description || '');

    if (!hasColorChange && !hasDescChange) continue;

    if (color) props['Цвет'] = color;
    if (dryRun) {
      console.log('[dry-run]', sku, 'Цвет:', color || '(пусто)', 'Описание:', description ? `${description.slice(0, 40)}…` : '(без изменений)');
      updated++;
      continue;
    }

    await prisma.product.update({
      where: { id: product.id },
      data: {
        properties_data: JSON.stringify(props),
        ...(description !== null ? { description: description || null } : {}),
      },
    });
    updated++;
  }

  console.log('Ручки: обновлено', updated, ', пропущено (пустое название)', skipped, ', нет в БД', notFound);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
