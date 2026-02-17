/**
 * Обновление поля «Цвет/Отделка» у товаров-дверей из final_filled 30.01.xlsx.
 * Цвет не зависит от размера: только обновляются существующие товары (одно значение
 * на модель+покрытие — первый цвет из листа «Цвет»). Новые товары не создаются.
 * Фото (URL) не загружаются и не обновляются.
 *
 * Использование:
 *   npx tsx scripts/update-doors-color-from-final-filled.ts [--dry-run]
 *
 * Путь к файлу: 1002/final_filled 30.01.xlsx (или 1002 в корне проекта).
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
  const dryRun = process.argv.includes('--dry-run');
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
  if (!pricesRows.length || !colorRows.length) {
    console.error('Листы «Цены базовые» или «Цвет» пусты или отсутствуют.');
    process.exit(1);
  }

  const modelNameToCode = new Map<string, string>();
  for (const r of pricesRows) {
    const name = getColumn(r, 'Название модели');
    const code = String(r['Код модели Domeo (Web)'] ?? '').trim();
    if (name && code) modelNameToCode.set(name, code);
  }

  type Key = string;
  const colorsByCodeCoating = new Map<Key, string[]>();
  for (const row of colorRows) {
    const modelName = getColumn(row, 'Название модели');
    const coating = String(row['Тип покрытия'] ?? '').trim();
    const color = String(row['Цвет/отделка'] ?? '').trim();
    if (!modelName || !color) continue;
    const code = modelNameToCode.get(modelName);
    if (!code) continue;
    const key: Key = `${code}\t${coating}`;
    if (!colorsByCodeCoating.has(key)) colorsByCodeCoating.set(key, []);
    const list = colorsByCodeCoating.get(key)!;
    if (!list.includes(color)) list.push(color);
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
    select: { id: true, sku: true, name: true, properties_data: true },
  });

  let updated = 0;

  for (const product of doorProducts) {
    const props = (() => {
      try {
        return (JSON.parse(product.properties_data || '{}') as Record<string, unknown>) || {};
      } catch {
        return {};
      }
    })();
    const code = String(props['Код модели Domeo (Web)'] ?? '').trim();
    const coating = String(props['Тип покрытия'] ?? '').trim();
    const currentColor = String(props['Цвет/Отделка'] ?? '').trim();
    if (!code || !coating) continue;

    const key: Key = `${code}\t${coating}`;
    const colors = colorsByCodeCoating.get(key);
    if (!colors || colors.length === 0) continue;

    const color = colors[0];
    if (currentColor === color) continue;

    if (dryRun) {
      updated++;
      continue;
    }
    props['Цвет/Отделка'] = color;
    await prisma.product.update({
      where: { id: product.id },
      data: { properties_data: JSON.stringify(props) },
    });
    updated++;
  }

  console.log('Обновлено товаров (Цвет/Отделка):', updated);
  if (dryRun) console.log('(dry-run — в БД ничего не записано)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
