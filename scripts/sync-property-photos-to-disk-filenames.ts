/**
 * Сверка property_photos (фото дверей) с файлами на диске.
 * Приводит photoPath в БД к точному имени файла на диске (как на диске).
 *
 * Правила:
 * - Файл по текущему photoPath есть → запись не трогаем.
 * - Файла нет → ищем на диске файл с тем же каноническим именем (NFC, пробелы→_).
 *   Нашли → обновляем photoPath на точное имя файла с диска.
 *   Не нашли → запись в отчёт "missing".
 *
 * Запуск (нужен .env с DATABASE_URL):
 *   npx tsx scripts/sync-property-photos-to-disk-filenames.ts [--dry-run] [--apply]
 *   --dry-run (по умолчанию): только отчёт, БД не меняется.
 *   --apply: выполнить обновление БД.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
function loadDatabaseUrl(): void {
  if (process.env.DATABASE_URL?.startsWith('postgres')) return;
  const envPath = join(root, '.env.postgresql');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf-8');
  const m = content.match(/DATABASE_URL=["']?([^"'\s]+)["']?/m);
  if (m?.[1]) process.env.DATABASE_URL = m[1];
}
loadDatabaseUrl();

import { PrismaClient } from '@prisma/client';
import { getDoorsCategoryId } from '../lib/catalog-categories';
import {
  canonicalFilenameForComparison,
  basenameOfPhotoPath,
  normalizePhotoPathPrefix,
  isDoorsPhotoPath,
} from '../lib/photo-path-normalize';

const prisma = new PrismaClient();

const DOORS_SUBFOLDER = 'final-filled/doors';
const UPLOADS_PREFIX = '/uploads/final-filled/doors/';

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--apply');
  const apply = args.includes('--apply');

  const cwd = process.cwd();
  const doorsDir = join(cwd, 'public', 'uploads', 'final-filled', 'doors');

  if (!existsSync(doorsDir)) {
    console.error('Папка не найдена:', doorsDir);
    process.exit(1);
  }

  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    console.error('Категория "Межкомнатные двери" не найдена.');
    process.exit(1);
  }

  // Список имён файлов на диске (как есть)
  const diskFiles = readdirSync(doorsDir, { withFileTypes: true })
    .filter((d) => d.isFile() && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(d.name))
    .map((d) => d.name);

  // Карта: каноническое имя -> точное имя на диске (первое вхождение)
  const canonicalToDiskName = new Map<string, string>();
  for (const name of diskFiles) {
    const canon = canonicalFilenameForComparison(name);
    if (!canonicalToDiskName.has(canon)) {
      canonicalToDiskName.set(canon, name);
    }
  }

  console.log('Папка дверей:', doorsDir);
  console.log('Файлов на диске:', diskFiles.length);
  console.log('Уникальных канонических имён:', canonicalToDiskName.size);
  console.log('Режим:', dryRun ? 'dry-run (без изменений БД)' : 'apply (обновление БД)');
  console.log('');

  // Все записи property_photos для категории дверей с путём к doors
  const records = await prisma.propertyPhoto.findMany({
    where: {
      categoryId: doorsCategoryId,
      photoPath: { contains: 'final-filled' },
    },
    select: { id: true, propertyName: true, propertyValue: true, photoType: true, photoPath: true },
  });

  const doorsRecords = records.filter((r) => isDoorsPhotoPath(r.photoPath));
  console.log('Записей property_photos с путём к doors:', doorsRecords.length);

  let ok = 0;
  let updated = 0;
  const missing: { id: string; propertyValue: string; photoPath: string; filename: string }[] = [];
  const updates: { id: string; oldPath: string; newPath: string }[] = [];

  for (const row of doorsRecords) {
    const pathNorm = normalizePhotoPathPrefix(row.photoPath);
    const filename = basenameOfPhotoPath(pathNorm);
    const fullPath = join(doorsDir, filename);

    if (existsSync(fullPath)) {
      ok++;
      continue;
    }

    const canonical = canonicalFilenameForComparison(filename);
    const diskName = canonicalToDiskName.get(canonical);

    if (diskName) {
      const newPath = UPLOADS_PREFIX + diskName;
      updates.push({ id: row.id, oldPath: row.photoPath, newPath });
      if (apply) {
        await prisma.propertyPhoto.update({
          where: { id: row.id },
          data: { photoPath: newPath, updatedAt: new Date() },
        });
      }
      updated++;
    } else {
      missing.push({
        id: row.id,
        propertyValue: row.propertyValue,
        photoPath: row.photoPath,
        filename,
      });
    }
  }

  console.log('');
  console.log('Итог:');
  console.log('  — Файл есть по текущему пути:', ok);
  console.log('  — Обновлено (подставлено имя с диска):', updated);
  console.log('  — Нет файла и не найдено по канону (missing):', missing.length);

  if (updates.length > 0) {
    console.log('');
    console.log('Обновления (первые 20):');
    updates.slice(0, 20).forEach((u) => {
      console.log('  ', u.oldPath, '->', u.newPath);
    });
    if (updates.length > 20) {
      console.log('  ... и ещё', updates.length - 20);
    }
  }

  if (missing.length > 0) {
    console.log('');
    console.log('Записи без файла на диске (первые 20):');
    missing.slice(0, 20).forEach((m) => {
      console.log('  ', m.propertyValue, '|', m.filename);
    });
    if (missing.length > 20) {
      console.log('  ... и ещё', missing.length - 20);
    }
  }

  if (dryRun && updates.length > 0) {
    console.log('');
    console.log('Чтобы применить обновления, запустите с флагом --apply');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
