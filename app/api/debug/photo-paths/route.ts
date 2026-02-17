/**
 * Диагностика: почему не отображаются фото дверей.
 * GET /api/debug/photo-paths — только для отладки, в проде отключить.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDoorsCategoryId } from '@/lib/catalog-categories';
import { DOOR_MODEL_CODE_PROPERTY, DOOR_COLOR_PROPERTY } from '@/lib/property-photos';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

export async function GET() {
  const cwd = process.cwd();
  const uploadsBase = join(cwd, 'public', 'uploads');
  const doorsDir = join(uploadsBase, 'final-filled', 'doors');

  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    return NextResponse.json({ error: 'Категория дверей не найдена' }, { status: 500 });
  }

  // Пути из БД (PropertyPhoto): обложки по коду модели и по цвету
  const byModelCode = await prisma.propertyPhoto.findMany({
    where: { categoryId: doorsCategoryId, propertyName: DOOR_MODEL_CODE_PROPERTY },
    take: 5,
    select: { propertyValue: true, photoPath: true, photoType: true },
  });
  const byColor = await prisma.propertyPhoto.findMany({
    where: { categoryId: doorsCategoryId, propertyName: DOOR_COLOR_PROPERTY },
    take: 5,
    select: { propertyValue: true, photoPath: true, photoType: true },
  });

  const checkPath = (photoPath: string) => {
    const raw = (photoPath || '').trim().replace(/\\/g, '/');
    const relative = raw.startsWith('/uploads/') ? raw.slice(9) : raw.startsWith('uploads/') ? raw.slice(8) : raw;
    const withColor = relative;
    const withDoors = relative.replace(/final-filled\/Цвет\/?/g, 'final-filled/doors/');
    const fullColor = join(uploadsBase, withColor);
    const fullDoors = join(uploadsBase, withDoors);
    return {
      pathInDb: photoPath,
      relative,
      withDoors,
      existsAsIs: existsSync(fullColor),
      existsWithDoors: existsSync(fullDoors),
    };
  };

  const filesOnDisk = existsSync(doorsDir)
    ? readdirSync(doorsDir, { withFileTypes: true }).filter((d) => d.isFile()).slice(0, 20).map((d) => d.name)
    : [];

  return NextResponse.json({
    message: 'Диагностика путей к фото дверей',
    uploadsBase,
    doorsDirExists: existsSync(doorsDir),
    filesCountInDoors: existsSync(doorsDir) ? readdirSync(doorsDir, { withFileTypes: true }).filter((d) => d.isFile()).length : 0,
    sampleFilesOnDisk: filesOnDisk,
    propertyPhotosByModelCode: byModelCode.map((p) => ({ ...checkPath(p.photoPath), propertyValue: p.propertyValue })),
    propertyPhotosByColor: byColor.map((p) => ({ ...checkPath(p.photoPath), propertyValue: p.propertyValue })),
  });
}
