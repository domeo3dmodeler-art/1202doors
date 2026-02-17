/**
 * Заново сопоставить propertyValue с файлами из public/uploads/final-filled/doors.
 * Обновляет photoPath только для записей, для которых найден файл (или обнуляет при --clear-not-found).
 *
 * Обрабатывает:
 * - propertyName = Domeo_Модель_Цвет, photoType = cover → формат propertyValue: "Код|Покрытие|Цвет"
 * - propertyName = Код модели Domeo (Web), photoType = cover → propertyValue: "domeodoors_pearl_6" и т.д.
 *
 * Опции:
 *   --update          записать в БД найденные photoPath
 *   --clear-not-found при --update обнулить photoPath для записей без найденного файла
 *   --dry-run         только отчёт, без изменений БД
 *   --out=path        сохранить CSV отчёт
 *
 * Запуск:
 *   npx tsx scripts/rematch-property-photos-from-doors-folder.ts [--dry-run]
 *   npx tsx scripts/rematch-property-photos-from-doors-folder.ts --update [--clear-not-found]
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';
import { getDoorsCategoryId } from '../lib/catalog-categories';
import {
  DOOR_COLOR_PROPERTY,
  DOOR_MODEL_CODE_PROPERTY,
  upsertPropertyPhoto,
} from '../lib/property-photos';
import { DOOR_PHOTOS_UPLOAD_PREFIX, DOOR_PHOTOS_SUBFOLDER } from '../lib/configurator/photo-paths';
import { findDoorPhotoFile } from '../lib/configurator/door-photo-fallback';
import { getCodeToModelPhotoMapping } from '../lib/catalog/code-to-model-photo-mapping';

const prisma = new PrismaClient();

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg)$/i;

function slug(s: string, max: number): string {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/\//g, '_')
    .replace(/[^\w\u0400-\u04FF\-_.()]/gi, '')
    .slice(0, max);
}

/**
 * Для значения "Код модели" (например domeodoors_pearl_6) ищем файл по префиксу:
 * Pearl_6 → первый файл в папке, имя которого начинается с "Pearl_6_".
 */
function findFileByModelCodePrefix(doorsDir: string, codeValue: string): string | null {
  if (!fs.existsSync(doorsDir)) return null;
  const lower = codeValue.toLowerCase().trim();
  const withoutDomeo = lower.replace(/^domeodoors_/, '').replace(/^domeo_/, '');
  if (!withoutDomeo) return null;
  const parts = withoutDomeo.split('_').filter(Boolean);
  const prefix = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('_') + '_';
  const files = fs.readdirSync(doorsDir, { withFileTypes: true }).filter((d) => d.isFile() && IMAGE_EXT.test(d.name));
  const match = files.find((f) => f.name.startsWith(prefix) || f.name.toLowerCase().startsWith(withoutDomeo + '_'));
  return match ? path.join(doorsDir, match.name) : null;
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
    where: {
      categoryId: doorsCatId,
      propertyName: {
        in: [DOOR_COLOR_PROPERTY, DOOR_MODEL_CODE_PROPERTY],
      },
    },
    select: { id: true, propertyName: true, propertyValue: true, photoType: true, photoPath: true },
  });

  const products = await prisma.product.findMany({
    where: { catalog_category_id: doorsCatId },
    select: { properties_data: true },
  });
  const codeToModelNames = new Map<string, string[]>();
  for (const prod of products) {
    try {
      const props =
        typeof prod.properties_data === 'string' ? JSON.parse(prod.properties_data) : prod.properties_data || {};
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

  /** Точечная привязка: propertyValue → имя файла (папка final-filled/doors). */
  const explicitPropertyValueToFile: Record<string, string> = {
    // Base_1
    'DomeoDoors_Base_1|Эмаль|Белоснежный': 'Дверное_полотно_BASE_1_ПГ_кр._Эмаль_Белоснежный_cover.png',
    'DomeoDoors_Base_1|Эмаль|Кремово-белый': 'Дверное_полотно_BASE_1_ПГ_кр._Эмаль_Кремово-белый_cover.png',
    'DomeoDoors_Base_1|Эмаль|Телегрей (RAL 7047)': 'Дверное_полотно_BASE_1_ПГ_кр._Эмаль_Телегрей_(RAL_7047)_cover.png',
    // Base_2 → файлы BASE_1_1_ПО_кр.
    'DomeoDoors_Base_2|Эмаль|Белоснежный': 'Дверное_полотно_BASE_1_1_ПО_кр._Эмаль_Белоснежный_cover.png',
    'DomeoDoors_Base_2|Эмаль|Кремово-белый': 'Дверное_полотно_BASE_1_1_ПО_кр._Эмаль_Кремово-белый_cover.png',
    'DomeoDoors_Base_2|Эмаль|Телегрей (RAL 7047)': 'Дверное_полотно_BASE_1_1_ПО_кр._Эмаль_Телегрей_(RAL_7047)_cover.png',
    // Galaxy_1–5
    'DomeoDoors_Galaxy_1|Стекло|Черный (RAL 9005)': 'Galaxy_1.png',
    'DomeoDoors_Galaxy_2|Стекло|Черный (RAL 9005)': 'Galaxy_2.png',
    'DomeoDoors_Galaxy_3|Стекло|Черный (RAL 9005)': 'Galaxy_3.png',
    'DomeoDoors_Galaxy_4|Стекло|Черный (RAL 9005)': 'Galaxy_4.jpg',
    'DomeoDoors_Galaxy_5|Стекло|Черный (RAL 9005)': 'Galaxy_5.png',
    // Invisible
    'DomeoDoors_Invisible|Под отделку|Под отделку': 'Invisible_chrome.png',
  };

  type Row = { propertyName: string; propertyValue: string; photoType: string; currentPath: string; matchedFile: string; status: string };
  const rows: Row[] = [];
  let matched = 0;
  let notFound = 0;
  let updated = 0;
  let cleared = 0;
  let skipped = 0;

  for (const p of photos) {
    const propertyValue = String(p.propertyValue ?? '').trim();
    const currentPath = String(p.photoPath ?? '').trim();
    let foundPath: string | null = null;

    if (p.propertyName === DOOR_COLOR_PROPERTY) {
      if (p.photoType !== 'cover') {
        skipped++;
        rows.push({
          propertyName: p.propertyName,
          propertyValue,
          photoType: p.photoType,
          currentPath,
          matchedFile: '',
          status: 'SKIP_NOT_COVER',
        });
        continue;
      }
      const parts = propertyValue.split('|').map((s) => s.trim());
      const [code, coating, color] = parts;
      if (!code || !coating || !color) {
        skipped++;
        rows.push({
          propertyName: p.propertyName,
          propertyValue,
          photoType: p.photoType,
          currentPath,
          matchedFile: '',
          status: 'SKIP_BAD_VALUE',
        });
        continue;
      }
      const requestedByCode = `${slug(code, 60)}_${slug(coating, 30)}_${slug(color, 40)}_cover.png`;
      foundPath = findDoorPhotoFile(baseDir, requestedByCode);
      if (!foundPath && codeToModelFromFile.get(code)?.length) {
        for (const modelName of codeToModelFromFile.get(code)!) {
          const requestedByName = `${slug(modelName, 60)}_${slug(coating, 30)}_${slug(color, 40)}_cover.png`;
          foundPath = findDoorPhotoFile(baseDir, requestedByName);
          if (foundPath) break;
        }
      }
      if (!foundPath && codeToModelNames.get(code)?.length) {
        for (const modelName of codeToModelNames.get(code)!) {
          const requestedByName = `${slug(modelName, 60)}_${slug(coating, 30)}_${slug(color, 40)}_cover.png`;
          foundPath = findDoorPhotoFile(baseDir, requestedByName);
          if (foundPath) break;
        }
      }
      if (!foundPath && explicitPropertyValueToFile[propertyValue]) {
        const explicitFile = path.join(baseDir, explicitPropertyValueToFile[propertyValue]);
        if (fs.existsSync(explicitFile)) foundPath = explicitFile;
      }
    } else if (p.propertyName === DOOR_MODEL_CODE_PROPERTY) {
      if (p.photoType !== 'cover') {
        skipped++;
        rows.push({
          propertyName: p.propertyName,
          propertyValue,
          photoType: p.photoType,
          currentPath,
          matchedFile: '',
          status: 'SKIP_NOT_COVER',
        });
        continue;
      }
      foundPath = findFileByModelCodePrefix(baseDir, propertyValue);
      if (!foundPath) {
        const known: Record<string, string> = {
          domeodoors_pearl_6: 'Pearl_6_Белоснежный.png',
          domeodoors_pearl_7: 'Pearl_7_Белоснежный.png',
          domeodoors_invisible: 'Invisible_black.png',
        };
        const fn = known[propertyValue.toLowerCase()];
        if (fn && fs.existsSync(path.join(baseDir, fn))) foundPath = path.join(baseDir, fn);
      }
    } else {
      skipped++;
      rows.push({
        propertyName: p.propertyName,
        propertyValue,
        photoType: p.photoType,
        currentPath,
        matchedFile: '',
        status: 'SKIP_PROPERTY',
      });
      continue;
    }

    const matchedFileName = foundPath ? path.basename(foundPath) : '';
    const newPath = foundPath ? `${DOOR_PHOTOS_UPLOAD_PREFIX}${matchedFileName}` : '';

    if (foundPath) {
      matched++;
      const status = currentPath && currentPath === newPath ? 'OK' : currentPath ? 'DIFF' : 'NEW';
      rows.push({
        propertyName: p.propertyName,
        propertyValue,
        photoType: p.photoType,
        currentPath,
        matchedFile: matchedFileName,
        status,
      });
      if (doUpdate && status !== 'OK') {
        await upsertPropertyPhoto(doorsCatId, p.propertyName, propertyValue, newPath, p.photoType, {
          originalFilename: matchedFileName,
        });
        updated++;
      }
    } else {
      notFound++;
      rows.push({
        propertyName: p.propertyName,
        propertyValue,
        photoType: p.photoType,
        currentPath,
        matchedFile: '',
        status: 'NOT_FOUND',
      });
      if (doUpdate && clearNotFound && currentPath) {
        await upsertPropertyPhoto(doorsCatId, p.propertyName, propertyValue, '', p.photoType);
        cleared++;
      }
    }
  }

  console.log('=== Пересопоставление PropertyPhoto → final-filled/doors ===\n');
  console.log('Обработано записей (Domeo_Модель_Цвет + Код модели, cover):', photos.length);
  console.log('Пропущено (другой photoType/свойство):', skipped);
  console.log('Найдено файлов:', matched);
  console.log('Не найдено:', notFound);
  if (doUpdate) {
    console.log('Обновлено в БД:', updated);
    if (cleared) console.log('Обнулено (NOT_FOUND):', cleared);
  }

  if (notFound > 0) {
    console.log('\n--- Примеры NOT_FOUND (первые 20) ---');
    rows
      .filter((r) => r.status === 'NOT_FOUND')
      .slice(0, 20)
      .forEach((r) => console.log(' ', r.propertyName, '|', r.propertyValue));
  }

  if (outPath) {
    const header = 'propertyName;propertyValue;photoType;currentPath;matchedFile;status';
    const lines = [
      header,
      ...rows.map((r) =>
        [r.propertyName, r.propertyValue, r.photoType, r.currentPath, r.matchedFile, r.status]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(';')
      ),
    ];
    const outDir = path.dirname(outPath);
    if (outDir && !fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
    console.log('\nОтчёт записан:', outPath);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
