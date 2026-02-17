/**
 * Сопоставление каждого propertyValue (Domeo_Модель_Цвет) с файлом из public/uploads/final-filled/doors.
 * Использует ту же логику поиска, что и API раздачи (findDoorPhotoFallback).
 *
 * Вывод: отчёт в консоль и при --out=FILE — CSV (propertyValue; currentPath; matchedFile; status).
 *
 * Опции:
 *   --update          обновить в БД photoPath на найденный файл
 *   --clear-not-found при --update обнулить photoPath для записей, для которых файл не найден (чтобы не показывать чужое фото)
 *   --out=path        записать CSV в файл
 *   --dry-run         только отчёт, без обновления БД
 *
 * Запуск:
 *   npx tsx scripts/match-propertyvalue-to-door-photo.ts [--dry-run]
 *   npx tsx scripts/match-propertyvalue-to-door-photo.ts --update [--dry-run]
 *   npx tsx scripts/match-propertyvalue-to-door-photo.ts --out=report.csv
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';
import { getDoorsCategoryId } from '../lib/catalog-categories';
import { DOOR_COLOR_PROPERTY, upsertPropertyPhoto } from '../lib/property-photos';
import { DOOR_PHOTOS_UPLOAD_PREFIX, DOOR_PHOTOS_SUBFOLDER } from '../lib/configurator/photo-paths';
import { findDoorPhotoFile } from '../lib/configurator/door-photo-fallback';
import { getCodeToModelPhotoMapping } from '../lib/catalog/code-to-model-photo-mapping';

const prisma = new PrismaClient();

function slug(s: string, max: number): string {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/\//g, '_')
    .replace(/[^\w\u0400-\u04FF\-_.()]/gi, '')
    .slice(0, max);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const doUpdate = process.argv.includes('--update') && !dryRun;
  const clearNotFound = process.argv.includes('--clear-not-found');
  const outArg = process.argv.find((a) => a.startsWith('--out='));
  const outPath = outArg ? outArg.replace(/^--out=/, '').trim() : '';

  const doorsCatId = await getDoorsCategoryId();
  if (!doorsCatId) {
    console.error('Категория "Межкомнатные двери" не найдена');
    process.exit(1);
  }

  const baseDir = path.join(process.cwd(), 'public', 'uploads', DOOR_PHOTOS_SUBFOLDER);
  if (!fs.existsSync(baseDir)) {
    console.error('Папка не найдена:', baseDir);
    process.exit(1);
  }

  const photos = await prisma.propertyPhoto.findMany({
    where: { categoryId: doorsCatId, propertyName: DOOR_COLOR_PROPERTY, photoType: 'cover' },
    select: { id: true, propertyValue: true, photoPath: true },
  });

  const products = await prisma.product.findMany({
    where: { catalog_category_id: doorsCatId },
    select: { properties_data: true },
  });
  // Маппинг код → все уникальные названия моделей из БД (Product.Код модели Domeo (Web) + Название модели)
  const codeToModelNames = new Map<string, string[]>();
  for (const prod of products) {
    try {
      const props = typeof prod.properties_data === 'string' ? JSON.parse(prod.properties_data) : prod.properties_data || {};
      const code = String(props['Код модели Domeo (Web)'] ?? '').trim();
      const name = String(props['Название модели'] ?? '').trim();
      if (code && name) {
        if (!codeToModelNames.has(code)) codeToModelNames.set(code, []);
        const list = codeToModelNames.get(code)!;
        if (!list.includes(name)) list.push(name);
      }
    } catch {
      // ignore
    }
  }
  const codeToModelFromFile = getCodeToModelPhotoMapping();

  const rows: Array<{ propertyValue: string; currentPath: string; matchedFile: string; status: string }> = [];
  let matched = 0;
  let notFound = 0;
  let updated = 0;
  let cleared = 0;

  for (const p of photos) {
    const propertyValue = String(p.propertyValue ?? '').trim();
    const currentPath = String(p.photoPath ?? '').trim();
    const parts = propertyValue.split('|').map((s) => s.trim());
    const [code, coating, color] = parts;
    if (!code || !coating || !color) {
      rows.push({ propertyValue, currentPath, matchedFile: '', status: 'SKIP_BAD_VALUE' });
      continue;
    }

    const requestedByCode = `${slug(code, 60)}_${slug(coating, 30)}_${slug(color, 40)}_cover.png`;
    let foundPath = findDoorPhotoFile(baseDir, requestedByCode);
    if (!foundPath) {
      const modelNamesFromFile = codeToModelFromFile.get(code);
      if (modelNamesFromFile?.length) {
        for (const modelName of modelNamesFromFile) {
          const requestedByName = `${slug(modelName, 60)}_${slug(coating, 30)}_${slug(color, 40)}_cover.png`;
          foundPath = findDoorPhotoFile(baseDir, requestedByName);
          if (foundPath) break;
        }
      }
      if (!foundPath) {
        const modelNamesFromDb = codeToModelNames.get(code);
        if (modelNamesFromDb?.length) {
          for (const modelName of modelNamesFromDb) {
            const requestedByName = `${slug(modelName, 60)}_${slug(coating, 30)}_${slug(color, 40)}_cover.png`;
            foundPath = findDoorPhotoFile(baseDir, requestedByName);
            if (foundPath) break;
          }
        }
      }
    }
    const matchedFileName = foundPath ? path.basename(foundPath) : '';
    const newPath = foundPath ? `${DOOR_PHOTOS_UPLOAD_PREFIX}${matchedFileName}` : '';

    if (foundPath) {
      matched++;
      const status = currentPath && currentPath === newPath ? 'OK' : currentPath ? 'DIFF' : 'NEW';
      rows.push({ propertyValue, currentPath, matchedFile: matchedFileName, status });

      if (doUpdate && status !== 'OK') {
        await upsertPropertyPhoto(doorsCatId, DOOR_COLOR_PROPERTY, propertyValue, newPath, 'cover', {
          originalFilename: matchedFileName,
        });
        updated++;
      }
    } else {
      notFound++;
      rows.push({ propertyValue, currentPath, matchedFile: '', status: 'NOT_FOUND' });
      if (doUpdate && clearNotFound && currentPath) {
        await upsertPropertyPhoto(doorsCatId, DOOR_COLOR_PROPERTY, propertyValue, '', 'cover');
        cleared++;
      }
    }
  }

  console.log('=== Сопоставление propertyValue → файл в final-filled/doors ===\n');
  console.log('Всего записей (cover):', photos.length);
  console.log('Найдено файлов:', matched);
  console.log('Не найдено:', notFound);
  if (doUpdate) console.log('Обновлено в БД:', updated);
  if (cleared) console.log('Очищено путей (NOT_FOUND):', cleared);

  if (notFound > 0) {
    console.log('\n--- Примеры NOT_FOUND (первые 15) ---');
    rows
      .filter((r) => r.status === 'NOT_FOUND')
      .slice(0, 15)
      .forEach((r) => console.log(' ', r.propertyValue));
  }

  if (outPath) {
    const header = 'propertyValue;currentPath;matchedFile;status';
    const lines = [header, ...rows.map((r) => [r.propertyValue, r.currentPath, r.matchedFile, r.status].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))];
    fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
    console.log('\nCSV записан:', outPath);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
