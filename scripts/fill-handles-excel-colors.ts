/**
 * Заполняет столбец «Цвет» нормализованными цветами для списка ручек.
 * Создаёт Excel с колонками: Тип (Ручка/Завертка), Название (Domeo_наименование для Web), Цвет.
 * Порядок строк — как в scripts/handles-normalized-colors-data.ts.
 *
 * Запуск: npx tsx scripts/fill-handles-excel-colors.ts
 * Результат: scripts/handles-normalized-colors.xlsx
 */

import * as path from 'path';
import ExcelJS from 'exceljs';
import { extractColorPartFromName, normalizeHandleColor } from '../lib/handle-color-normalize';
import { HANDLE_NAMES_ORDERED } from './handles-normalized-colors-data';

const OUT_PATH = path.join(__dirname, 'handles-normalized-colors.xlsx');

async function main() {
  const headers = ['Тип (Ручка/Завертка)', 'Название (Domeo_наименование для Web)', 'Цвет'];
  const rows: [string, string, string][] = [];

  const normalizedSet = new Set<string>();
  const unmatchedList: string[] = [];

  for (const name of HANDLE_NAMES_ORDERED) {
    const raw = extractColorPartFromName(name);
    const { label, normalized } = normalizeHandleColor(raw);
    rows.push(['Ручка', name, label]);
    if (normalized) normalizedSet.add(label);
    else if (raw) unmatchedList.push(raw);
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Ручки', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = [
    { header: headers[0], key: 'type', width: 24 },
    { header: headers[1], key: 'name', width: 50 },
    { header: headers[2], key: 'color', width: 22 },
  ];
  sheet.addRows(rows.map(([type, name, color]) => ({ type, name, color })));
  sheet.getRow(1).font = { bold: true };

  await workbook.xlsx.writeFile(OUT_PATH);
  console.log('Записано:', OUT_PATH);
  console.log('Строк:', rows.length);
  console.log('\nНормализованные цвета:', [...normalizedSet].sort().join(', '));
  console.log('\nНе удалось нормализовать (остались как есть):', unmatchedList.length ? [...new Set(unmatchedList)].sort().join(', ') : '—');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
