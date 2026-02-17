/**
 * Привязка обложек для DomeoDoors_Pearl_6 (Rimini 2 ПО) и DomeoDoors_Pearl_7 (Rimini 12 ПО).
 * Берёт первое фото из Domeo_Модель_Цвет по названию модели или использует локальные файлы.
 * Запуск: npx tsx scripts/bind-pearl-67-covers.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client';
import { getDoorsCategoryId } from '../lib/catalog-categories';
import { upsertPropertyPhoto, DOOR_MODEL_CODE_PROPERTY } from '../lib/property-photos';
import { DOOR_PHOTOS_UPLOAD_PREFIX } from '../lib/configurator/photo-paths';

const prisma = new PrismaClient();

const BINDINGS: Array<{ code: string; factoryNamePrefix: string; fallbackFile?: string }> = [
  { code: 'DomeoDoors_Pearl_6', factoryNamePrefix: 'Дверное полотно Rimini 2 ПО', fallbackFile: 'Pearl_6_Белоснежный.png' },
  { code: 'DomeoDoors_Pearl_7', factoryNamePrefix: 'Дверное полотно Rimini 12 ПО', fallbackFile: 'Pearl_7_Белоснежный.png' },
  { code: 'DomeoDoors_Invisible', factoryNamePrefix: 'Дверь Фантом Люкс' },
];

const DOOR_COLOR_PROPERTY = 'Domeo_Модель_Цвет';
const UPLOADS_PREFIX = DOOR_PHOTOS_UPLOAD_PREFIX;

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    console.error('Категория "Межкомнатные двери" не найдена.');
    process.exit(1);
  }

  console.log('=== Привязка обложек Pearl_6 / Pearl_7 ===\n');

  for (const { code, factoryNamePrefix, fallbackFile } of BINDINGS) {
    const propertyValue = code.toLowerCase();
    let photoPath: string | null = null;

    const colorCover = await prisma.propertyPhoto.findFirst({
      where: {
        categoryId: doorsCategoryId,
        propertyName: DOOR_COLOR_PROPERTY,
        photoType: 'cover',
        propertyValue: { startsWith: factoryNamePrefix + '|' },
      },
      select: { photoPath: true },
    });
    if (colorCover?.photoPath) {
      photoPath = colorCover.photoPath;
      console.log(code, '→ обложка из Domeo_Модель_Цвет:', photoPath);
    }
    if (!photoPath && fallbackFile) {
      photoPath = UPLOADS_PREFIX + fallbackFile;
      console.log(code, '→ fallback путь:', photoPath);
    }
    if (!photoPath) {
      console.log(code, '→ пропуск (нет фото в Domeo_Модель_Цвет и нет fallback)');
      continue;
    }

    if (dryRun) {
      console.log('[dry-run] upsert', DOOR_MODEL_CODE_PROPERTY, propertyValue, photoPath);
    } else {
      const ok = await upsertPropertyPhoto(doorsCategoryId, DOOR_MODEL_CODE_PROPERTY, propertyValue, photoPath, 'cover', {
        originalFilename: photoPath.split('/').pop() || fallbackFile || '',
      });
      console.log(ok ? 'OK' : 'Ошибка', code);
    }
  }

  console.log('\nГотово. Перезапустите приложение или вызовите DELETE /api/catalog/doors/complete-data для сброса кэша.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
