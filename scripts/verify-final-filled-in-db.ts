/**
 * Проверка: для каждой пары (модель, покрытие) из final_filled 30.01.xlsx в БД есть товары
 * с заполненным Цвет/Отделка (цвет не зависит от размера — достаточно одного цвета на модель+покрытие).
 * URL фото не проверяются.
 *
 * Запуск:
 *   npx tsx scripts/verify-final-filled-in-db.ts
 *
 * Путь к файлу: 1002/final_filled 30.01.xlsx или FINAL_FILLED_PATH.
 */
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

const prisma = new PrismaClient();
const DEFAULT_FILE = path.join(__dirname, '..', '1002', 'final_filled 30.01.xlsx');

function getColumn(row: Record<string, unknown>, logicalName: string): string {
  const need = logicalName.replace(/\s+/g, ' ').trim();
  for (const k of Object.keys(row)) {
    if (k.replace(/\s+/g, ' ').trim() === need) return String(row[k] ?? '').trim();
  }
  return String(row[logicalName] ?? '').trim();
}

async function main() {
  const filePath = process.env.FINAL_FILLED_PATH || DEFAULT_FILE;

  if (!fs.existsSync(filePath)) {
    console.error('Файл не найден:', filePath);
    process.exit(1);
  }

  const workbook = XLSX.readFile(filePath, { cellDates: true, raw: false });
  const toJson = (sheetName: string): Record<string, unknown>[] => {
    const ws = workbook.Sheets[sheetName];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
  };

  const pricesRows = toJson('Цены базовые');
  const colorRows = toJson('Цвет');
  if (!pricesRows.length) {
    console.error('Лист «Цены базовые» пуст или отсутствует.');
    process.exit(1);
  }

  const modelNameToCode = new Map<string, string>();
  for (const r of pricesRows) {
    const name = getColumn(r, 'Название модели');
    const code = String(r['Код модели Domeo (Web)'] ?? '').trim();
    if (name && code) modelNameToCode.set(name, code);
  }

  type Pair = string;
  const filePairsToColors = new Map<Pair, Set<string>>();
  const filePairsList: { modelName: string; code: string; coating: string }[] = [];
  for (const row of colorRows) {
    const modelName = getColumn(row, 'Название модели');
    const coating = String(row['Тип покрытия'] ?? '').trim();
    const color = String(row['Цвет/отделка'] ?? '').trim();
    if (!modelName || !coating) continue;
    const code = modelNameToCode.get(modelName);
    if (!code) continue;
    const pair: Pair = `${code}\t${coating}`;
    if (!filePairsToColors.has(pair)) {
      filePairsToColors.set(pair, new Set());
      filePairsList.push({ modelName, code, coating });
    }
    if (color) filePairsToColors.get(pair)!.add(color);
  }

  const doorsCat = await prisma.catalogCategory.findFirst({
    where: { name: 'Межкомнатные двери' },
    select: { id: true },
  });
  if (!doorsCat) {
    console.error('Категория «Межкомнатные двери» не найдена.');
    process.exit(1);
  }

  const doorProducts = await prisma.product.findMany({
    where: { catalog_category_id: doorsCat.id },
    select: { id: true, sku: true, properties_data: true },
  });

  const dbPairToColors = new Map<Pair, Set<string>>();
  let withColor = 0;
  let withoutColor = 0;
  for (const p of doorProducts) {
    let props: Record<string, unknown> = {};
    try {
      props = JSON.parse(p.properties_data || '{}') as Record<string, unknown>;
    } catch {
      continue;
    }
    const code = String(props['Код модели Domeo (Web)'] ?? '').trim();
    const coating = String(props['Тип покрытия'] ?? '').trim();
    const color = String(props['Цвет/Отделка'] ?? '').trim();
    if (!code || !coating) continue;
    const pair: Pair = `${code}\t${coating}`;
    if (color) {
      withColor++;
      if (!dbPairToColors.has(pair)) dbPairToColors.set(pair, new Set());
      dbPairToColors.get(pair)!.add(color);
    } else {
      withoutColor++;
    }
  }

  const missing: { modelName: string; code: string; coating: string }[] = [];
  for (const { modelName, code, coating } of filePairsList) {
    const pair: Pair = `${code}\t${coating}`;
    const fileColors = filePairsToColors.get(pair);
    const dbColors = dbPairToColors.get(pair);
    const hasMatch = fileColors && dbColors && [...fileColors].some((c) => dbColors.has(c));
    if (!hasMatch) missing.push({ modelName, code, coating });
  }

  const modelsInFileNotInPrices: string[] = [];
  for (const row of colorRows) {
    const modelName = getColumn(row, 'Название модели');
    if (!modelName) continue;
    if (!modelNameToCode.has(modelName)) {
      if (!modelsInFileNotInPrices.includes(modelName)) modelsInFileNotInPrices.push(modelName);
    }
  }

  console.log('--- Результат проверки final_filled → БД (без учёта фото URL) ---\n');
  console.log('В файле «Цвет»: пар (модель+покрытие):', filePairsToColors.size);
  console.log('В БД дверей: товаров с заполненным Цвет/Отделка:', withColor);
  console.log('В БД дверей: товаров без Цвет/Отделка:', withoutColor);

  if (modelsInFileNotInPrices.length > 0) {
    console.log('\n⚠ В листе «Цвет» есть названия моделей, которых нет в «Цены базовые» (связь по коду невозможна):');
    console.log('  ', modelsInFileNotInPrices.slice(0, 15).join(', '));
    if (modelsInFileNotInPrices.length > 15) console.log('  … и ещё', modelsInFileNotInPrices.length - 15);
  }

  if (missing.length > 0) {
    console.log('\n⚠ Пары (модель, покрытие) из файла, для которых в БД нет товара с ни одним цветом из файла:');
    missing.slice(0, 25).forEach((m) => console.log('  ', m.modelName, '|', m.coating));
    if (missing.length > 25) console.log('  … и ещё', missing.length - 25);
    console.log('\nИтого:', missing.length);
  } else {
    console.log('\n✓ Для каждой пары (модель, покрытие) из файла в БД есть товар с подходящим Цвет/Отделка.');
  }

  if (withoutColor > 0 && filePairsToColors.size > 0) {
    console.log('\nℹ Товаров без Цвет/Отделка в БД:', withoutColor, '— при необходимости: npx tsx scripts/update-doors-color-from-final-filled.ts');
  }

  console.log('\n--- Конец проверки ---');
  process.exit(missing.length > 0 ? 1 : 0);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
