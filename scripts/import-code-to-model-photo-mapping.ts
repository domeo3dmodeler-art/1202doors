/**
 * Импорт маппинга «код → название модели» из Excel для привязки фото.
 * Читает файл с двумя колонками (код и модель), пишет scripts/output/code-to-model-photo-mapping.json.
 *
 * Ожидаемые имена колонок: «Код» / «Code» / «Код модели», «Модель» / «Model» / «Название модели».
 * Файл по умолчанию: 1002/code-to-model-mapping.xlsx или --file=путь.xlsx
 *
 * Запуск:
 *   npx tsx scripts/import-code-to-model-photo-mapping.ts [--file=путь.xlsx] [--dry-run]
 */
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

const DEFAULT_FILE = path.join(__dirname, '..', '1002', 'code-to-model-mapping.xlsx');
const OUTPUT_JSON = path.join(__dirname, 'output', 'code-to-model-photo-mapping.json');

function getColumn(row: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const need = name.replace(/\s+/g, ' ').trim();
    for (const k of Object.keys(row)) {
      if (k.replace(/\s+/g, ' ').trim() === need) return String(row[k] ?? '').trim();
    }
    const v = row[name];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

async function main() {
  const fileArg = process.argv.find((a) => a.startsWith('--file='));
  const xlsxPath = fileArg ? fileArg.replace(/^--file=/, '').trim() : DEFAULT_FILE;
  const dryRun = process.argv.includes('--dry-run');

  if (!fs.existsSync(xlsxPath)) {
    console.error('Файл не найден:', xlsxPath);
    console.error('Положите Excel с колонками [Код, Модель] в 1002/code-to-model-mapping.xlsx или укажите --file=путь.xlsx');
    process.exit(1);
  }

  const wb = XLSX.readFile(xlsxPath, { raw: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const mapping: Record<string, string[]> = {};
  for (const row of rows) {
    const code = getColumn(row, 'Код', 'Code', 'Код модели');
    const model = getColumn(row, 'Модель', 'Model', 'Название модели');
    if (!code || !model) continue;
    if (!mapping[code]) mapping[code] = [];
    if (!mapping[code].includes(model)) mapping[code].push(model);
  }

  console.log('Кодов в маппинге:', Object.keys(mapping).length);
  console.log('Примеры:', Object.entries(mapping).slice(0, 3));

  if (dryRun) {
    console.log('[dry-run] Не записываю', OUTPUT_JSON);
    return;
  }

  const outDir = path.dirname(OUTPUT_JSON);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(mapping, null, 2), 'utf8');
  console.log('Записано:', path.resolve(OUTPUT_JSON));
  console.log('Дальше: npx tsx scripts/match-propertyvalue-to-door-photo.ts --update [--clear-not-found]');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
