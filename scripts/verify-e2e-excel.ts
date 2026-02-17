/**
 * Проверка сгенерированного E2E Excel: первая строка данных (дверь) — все колонки двери заполнены.
 * Запуск: npx tsx scripts/verify-e2e-excel.ts [путь к xlsx]
 */
import * as path from 'path';
import * as fs from 'fs';
import ExcelJS from 'exceljs';

const OUTPUT_DIR = path.join(__dirname, 'output');

function findLatestE2EExcel(): string | null {
  if (!fs.existsSync(OUTPUT_DIR)) return null;
  const files = fs.readdirSync(OUTPUT_DIR)
    .filter((f) => f.startsWith('e2e-order-') && f.endsWith('.xlsx'))
    .map((f) => ({ name: f, mtime: fs.statSync(path.join(OUTPUT_DIR, f)).mtime.getTime() }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.length > 0 ? path.join(OUTPUT_DIR, files[0].name) : null;
}

async function main() {
  const filePath = process.argv[2] || findLatestE2EExcel();
  if (!filePath || !fs.existsSync(filePath)) {
    console.error('Файл не найден. Запустите сначала: npx tsx scripts/e2e-order-export-excel.ts');
    process.exit(1);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet('Заказ');
  if (!sheet) {
    console.error('Лист "Заказ" не найден');
    process.exit(1);
  }

  const headerRow = 10;
  const dataRow = 11;
  const headers = (sheet.getRow(headerRow).values as (string | number | undefined)[]) || [];
  const doorCols = [
    'Кромка',
    'Кромка, цена',
    'Цвет кромки',
    'Реверс',
    'Зеркало',
    'Зеркало, цена',
    'Цвет стекла',
    'Порог',
    'Порог, цена',
    'Наличники',
    'Наличники, цена',
    'Наполнение',
    'Название модели',
    'Материал/Покрытие',
    'Ширина, мм',
    'Высота, мм',
    'Цвет/Отделка',
    'Код модели Domeo (Web)',
    'Толщина, мм',
    'Стекло (тип)',
    'Кромка в базе',
    'Стиль',
    'Комплект фурнитуры'
  ];

  const colNum = (title: string) => {
    const i = headers.findIndex((h) => String(h || '').trim() === title);
    return i >= 0 ? i : -1;
  };

  console.log('=== Проверка первой строки данных (дверь) в', path.basename(filePath), '===\n');
  let filled = 0;
  let empty: string[] = [];
  for (const colName of doorCols) {
    const col = colNum(colName);
    const val = col >= 0 ? sheet.getCell(dataRow, col).value : undefined;
    const str = val !== undefined && val !== null && String(val).trim() !== '' ? String(val).trim() : '';
    if (str) {
      filled++;
      console.log(`  ${colName}: ${str.slice(0, 50)}${str.length > 50 ? '...' : ''}`);
    } else {
      empty.push(colName);
    }
  }
  console.log('\n--- Итог ---');
  console.log('Заполнено колонок двери:', filled, '/', doorCols.length);
  if (empty.length > 0) {
    console.log('Пустые:', empty.join(', '));
  } else {
    console.log('Все колонки двери заполнены.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
