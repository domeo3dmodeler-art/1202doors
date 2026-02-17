/**
 * Привязка файлов из папки public/uploads/final-filled/doors к моделям дверей.
 * Путь к папке задаётся в lib/configurator/photo-paths.ts.
 *
 * Режимы:
 *   --point   точечная привязка из scripts/color-folder-binding-data.ts (в xlsx нет столбца «файл»)
 *   иначе     Excel: лист «Цвет», столбцы «Название модели», «Тип покрытия», «Цвет/отделка», «файл»
 *
 * Запуск:
 *   npx tsx scripts/bind-color-folder-to-models.ts --point [--dry-run]
 *   npx tsx scripts/bind-color-folder-to-models.ts [--dry-run] [--file=PATH]
 */

import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { getDoorsCategoryId } from '../lib/catalog-categories';
import { DOOR_COLOR_PROPERTY, upsertPropertyPhoto } from '../lib/property-photos';
import { DOOR_PHOTOS_UPLOAD_PREFIX, DOOR_PHOTOS_SUBFOLDER } from '../lib/configurator/photo-paths';
import { COLOR_FOLDER_BINDINGS } from './color-folder-binding-data';

const prisma = new PrismaClient();

const DEFAULT_XLSX = path.join(__dirname, '..', '1002', 'final_filled 30.01.xlsx');
const UPLOADS_PREFIX = DOOR_PHOTOS_UPLOAD_PREFIX;

function getColumn(row: Record<string, unknown>, ...names: string[]): string {
  for (const logicalName of names) {
    const need = logicalName.replace(/\s+/g, ' ').trim();
    for (const k of Object.keys(row)) {
      if (k.replace(/\s+/g, ' ').trim() === need) return String(row[k] ?? '').trim();
    }
    const v = row[logicalName];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const usePoint = args.includes('--point');
  const baseDir = path.join(__dirname, '..', 'public', 'uploads', DOOR_PHOTOS_SUBFOLDER);
  let bound = 0;
  const missing: string[] = [];

  const doorsCatId = await getDoorsCategoryId();
  if (!doorsCatId) {
    console.error('Категория "Межкомнатные двери" не найдена.');
    process.exit(1);
  }

  if (usePoint) {
    console.log('Точечная привязка из color-folder-binding-data.ts\n');
    for (const row of COLOR_FOLDER_BINDINGS) {
      const filename = path.basename(row.file);
      const propertyValue = `${row.modelName}|${row.coatingType}|${row.colorName}`;
      const photoPath = UPLOADS_PREFIX + filename;
      if (!fs.existsSync(path.join(baseDir, filename))) {
        missing.push(filename);
      }
      if (dryRun) {
        console.log('[dry-run]', propertyValue, '->', photoPath);
        bound++;
      } else {
        const ok = await upsertPropertyPhoto(doorsCatId, DOOR_COLOR_PROPERTY, propertyValue, photoPath, 'cover', {
          originalFilename: filename,
        });
        if (ok) bound++;
      }
    }
  } else {
    const fileArg = args.find((a) => a.startsWith('--file='));
    const xlsxPath = fileArg ? fileArg.replace(/^--file=/, '').trim() : DEFAULT_XLSX;
    if (!fs.existsSync(xlsxPath)) {
      console.error('Файл не найден:', xlsxPath);
      process.exit(1);
    }
    const workbook = XLSX.readFile(xlsxPath);
    const ws = workbook.Sheets['Цвет'];
    if (!ws) {
      console.error('Лист "Цвет" не найден в файле.');
      process.exit(1);
    }
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
    let skipped = 0;
    for (const row of rows) {
      const modelName = getColumn(row, 'Название модели');
      const coatingType = getColumn(row, 'Тип покрытия', 'Тип покрыти');
      const colorName = getColumn(row, 'Цвет/отделка');
      let filename = getColumn(row, 'файл');
      if (!filename) {
        skipped++;
        continue;
      }
      filename = path.basename(filename);
      const propertyValue = `${modelName}|${coatingType}|${colorName}`;
      const photoPath = UPLOADS_PREFIX + filename;
      if (!fs.existsSync(path.join(baseDir, filename))) {
        missing.push(filename);
      }
      if (dryRun) {
        console.log('[dry-run]', propertyValue, '->', photoPath);
        bound++;
      } else {
        const ok = await upsertPropertyPhoto(doorsCatId, DOOR_COLOR_PROPERTY, propertyValue, photoPath, 'cover', {
          originalFilename: filename,
        });
        if (ok) bound++;
      }
    }
    if (skipped > 0) console.log('Пропущено строк без столбца "файл":', skipped);
  }

  if (missing.length > 0) {
    console.warn('\nФайлы не найдены в папке', baseDir + ':', missing.slice(0, 20).join(', '));
    if (missing.length > 20) console.warn('… и ещё', missing.length - 20);
  }

  console.log('\nИтого: привязано записей', bound, dryRun ? '(dry-run)' : '');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
