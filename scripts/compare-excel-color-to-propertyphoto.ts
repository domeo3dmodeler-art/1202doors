/**
 * Сравнение листа «Цвет» из final_filled 30.01.xlsx с propertyValue в PropertyPhoto (Domeo_Модель_Цвет).
 * Проверяет: единый ли формат, все ли строки из Excel есть в БД.
 *
 * Формат:
 * - Excel: Название модели | Тип покрытия | Цвет/отделка  (пример: Дверное полотно BASE 1 ПГ иск.п. | ПВХ | Крем софт)
 * - БД при импорте: Код модели Domeo (Web) | Тип покрытия | Цвет/отделка  (пример: base1 | ПВХ | Крем софт)
 *
 * Запуск: npx tsx scripts/compare-excel-color-to-propertyphoto.ts
 */
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { DOOR_COLOR_PROPERTY } from '../lib/property-photos';
import { getDoorsCategoryId } from '../lib/catalog-categories';

const prisma = new PrismaClient();
const FILE_PATH = path.join(__dirname, '..', '1002', 'final_filled 30.01.xlsx');

function getColumn(row: Record<string, unknown>, logicalName: string): string {
  const need = logicalName.replace(/\s+/g, ' ').trim();
  for (const k of Object.keys(row)) {
    if (k.replace(/\s+/g, ' ').trim() === need) return String(row[k] ?? '').trim();
  }
  return String(row[logicalName] ?? '').trim();
}

async function main() {
  if (!fs.existsSync(FILE_PATH)) {
    console.error('Файл не найден:', FILE_PATH);
    process.exit(1);
  }

  const workbook = XLSX.readFile(FILE_PATH, { cellDates: true, raw: false });
  const toJson = (sheetName: string) => {
    const ws = workbook.Sheets[sheetName];
    if (!ws) return [] as Record<string, unknown>[];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
  };

  // Маппинг Название модели → Код модели Domeo (Web) из «Цены базовые»
  const pricesRows = toJson('Цены базовые');
  const modelNameToCode = new Map<string, string>();
  for (const r of pricesRows) {
    const name = getColumn(r, 'Название модели');
    const code = String(r['Код модели Domeo (Web)'] ?? '').trim();
    if (name && code) modelNameToCode.set(name, code);
  }

  // Строки листа «Цвет»: Название модели, Тип покрытия, Цвет/отделка, Ссылка на обложку
  const colorRows = toJson('Цвет');
  const excelByKeyCode = new Map<string, { modelName: string; coating: string; color: string; hasCover: boolean }>();
  const excelByKeyName = new Set<string>();

  for (const row of colorRows) {
    const modelName = getColumn(row, 'Название модели');
    const coating = String(row['Тип покрытия'] ?? '').trim();
    const color = String(row['Цвет/отделка'] ?? '').trim();
    const coverUrl = String(row['Ссылка на обложку'] ?? '').trim();
    if (!modelName) continue;

    const keyName = `${modelName}|${coating}|${color}`;
    excelByKeyName.add(keyName);

    const code = modelNameToCode.get(modelName);
    if (!code) continue;

    const keyCode = `${code}|${coating}|${color}`;
    excelByKeyCode.set(keyCode, { modelName, coating, color, hasCover: !!coverUrl });
  }

  // PropertyPhoto: все propertyValue для Domeo_Модель_Цвет
  const doorsCatId = await getDoorsCategoryId();
  if (!doorsCatId) {
    console.error('Категория "Межкомнатные двери" не найдена');
    process.exit(1);
  }

  const dbPhotos = await prisma.propertyPhoto.findMany({
    where: { categoryId: doorsCatId, propertyName: DOOR_COLOR_PROPERTY },
    select: { propertyValue: true, photoType: true },
  });

  const dbCoverValues = new Set(
    dbPhotos.filter((p) => p.photoType === 'cover').map((p) => String(p.propertyValue ?? '').trim())
  );
  const dbAllValues = new Set(dbPhotos.map((p) => String(p.propertyValue ?? '').trim()));

  // Проверка формата в БД: все ли в виде part1|part2|part3
  const badFormat: string[] = [];
  for (const pv of dbAllValues) {
    if (!pv) continue;
    const parts = pv.split('|');
    if (parts.length !== 3) badFormat.push(pv);
  }

  // Ожидаемые в БД ключи (код|покрытие|цвет) по Excel — только строки с обложкой
  const expectedInDb = new Set<string>();
  const excelNoCode: { keyName: string; modelName: string; coating: string; color: string }[] = [];
  for (const row of colorRows) {
    const modelName = getColumn(row, 'Название модели');
    const coating = String(row['Тип покрытия'] ?? '').trim();
    const color = String(row['Цвет/отделка'] ?? '').trim();
    const coverUrl = String(row['Ссылка на обложку'] ?? '').trim();
    if (!modelName || !coverUrl) continue;

    const code = modelNameToCode.get(modelName);
    if (!code) {
      excelNoCode.push({ keyName: `${modelName}|${coating}|${color}`, modelName, coating, color });
      continue;
    }
    expectedInDb.add(`${code}|${coating}|${color}`);
  }

  const missingInDb = [...expectedInDb].filter((k) => !dbCoverValues.has(k));
  const inDbNotInExcel = [...dbCoverValues].filter((k) => !excelByKeyCode.has(k) && k.length > 0);

  // —— Отчёт ——
  console.log('=== Сравнение: Excel «Цвет» vs PropertyPhoto (Domeo_Модель_Цвет) ===\n');
  console.log('Файл:', FILE_PATH);
  console.log('Формат в Excel: Название модели | Тип покрытия | Цвет/отделка');
  console.log('Формат в БД (при импорте): Код модели Domeo (Web) | Тип покрытия | Цвет/отделка\n');

  console.log('--- Формат в БД ---');
  if (badFormat.length === 0) {
    console.log('Все значения propertyValue в БД имеют вид: часть1|часть2|часть3 (3 части через |).');
  } else {
    console.log('Значения НЕ в формате часть1|часть2|часть3:', badFormat.length);
    badFormat.slice(0, 20).forEach((v) => console.log('  ', v));
    if (badFormat.length > 20) console.log('  ... и ещё', badFormat.length - 20);
  }

  console.log('\n--- Сводка ---');
  console.log('Строк в листе «Цвет» (всего):', colorRows.length);
  console.log('Уникальных комбинаций по названию модели (Excel):', excelByKeyName.size);
  console.log('Уникальных комбинаций по коду модели (ожидаем в БД):', excelByKeyCode.size);
  console.log('Записей PropertyPhoto (Domeo_Модель_Цвет) с photoType=cover в БД:', dbCoverValues.size);
  console.log('Строк «Цвет» с заполненной «Ссылка на обложку» (ожидаем в БД):', expectedInDb.size);

  console.log('\n--- Отсутствуют в БД (есть в Excel с обложкой, по коду модели) ---');
  if (missingInDb.length === 0) {
    console.log('Все ожидаемые ключи есть в БД.');
  } else {
    console.log('Количество:', missingInDb.length);
    missingInDb.slice(0, 30).forEach((k) => {
      const ex = excelByKeyCode.get(k);
      const label = ex ? `  (Excel: ${ex.modelName})` : '';
      console.log('  ', k + label);
    });
    if (missingInDb.length > 30) console.log('  ... и ещё', missingInDb.length - 30);
  }

  console.log('\n--- В БД нет в Excel (по коду|покрытие|цвет) ---');
  if (inDbNotInExcel.length === 0) {
    console.log('Нет лишних записей в БД относительно Excel.');
  } else {
    console.log('Количество:', inDbNotInExcel.length);
    inDbNotInExcel.slice(0, 20).forEach((k) => console.log('  ', k));
    if (inDbNotInExcel.length > 20) console.log('  ... и ещё', inDbNotInExcel.length - 20);
  }

  console.log('\n--- Строки «Цвет» с обложкой, но без кода в «Цены базовые» ---');
  if (excelNoCode.length === 0) {
    console.log('Нет таких строк.');
  } else {
    console.log('Количество:', excelNoCode.length);
    excelNoCode.slice(0, 15).forEach(({ keyName, modelName }) => console.log('  ', keyName, '  [модель не в Цены базовые:]', modelName));
    if (excelNoCode.length > 15) console.log('  ... и ещё', excelNoCode.length - 15);
  }

  console.log('\n--- Единый ли формат? ---');
  console.log(
    'Нет: в Excel ключ = «Название модели»|Тип покрытия|Цвет/отделка (например: Дверное полотно BASE 1 ПГ иск.п.|ПВХ|Крем софт).'
  );
  console.log(
    'В БД при импорте записывается: «Код модели Domeo (Web)»|Тип покрытия|Цвет/отделка (например: base1|ПВХ|Крем софт).'
  );
  console.log(
    'complete-data при поиске фото подставляет оба варианта (название и код), поэтому обложки находятся по коду из БД.'
  );

  console.log('\n--- Примеры ---');
  const samples = [...dbCoverValues].slice(0, 5);
  console.log('Примеры propertyValue в БД:', samples);
  const excelSamples = [...excelByKeyName].slice(0, 3);
  console.log('Примеры формата Excel (Название модели|Покрытие|Цвет):', excelSamples);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
