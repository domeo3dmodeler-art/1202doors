import { NextRequest } from 'next/server';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { validateImageFile } from '@/lib/validation/file-validation';

const GALLERY_BASE = ['public', 'uploads', 'gallery', 'doors'];

async function postHandler(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  const formData = await request.formData();
  const coverFile = formData.get('cover') as File | null;
  const galleryFiles = formData.getAll('gallery') as File[];

  if ((!coverFile || coverFile.size === 0) && galleryFiles.length === 0) {
    throw new ValidationError('Укажите хотя бы один файл: cover или gallery');
  }

  const dirId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const relDir = path.join(...GALLERY_BASE, dirId);
  const uploadDir = path.join(process.cwd(), relDir);
  await mkdir(uploadDir, { recursive: true });

  let coverPath: string | null = null;
  const galleryPaths: string[] = [];

  if (coverFile && coverFile.size > 0) {
    const validation = validateImageFile(coverFile);
    if (!validation.isValid) throw new ValidationError(validation.error || 'Неверный файл обложки');
    const buffer = Buffer.from(await coverFile.arrayBuffer());
    const ext = path.extname(coverFile.name).toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';
    const fileName = `cover${safeExt}`;
    const filePath = path.join(uploadDir, fileName);
    await writeFile(filePath, buffer);
    coverPath = `/uploads/gallery/doors/${dirId}/${fileName}`;
  }

  const orderedGallery = galleryFiles.filter((f) => f && f.size > 0);
  for (let i = 0; i < orderedGallery.length; i++) {
    const file = orderedGallery[i];
    const validation = validateImageFile(file);
    if (!validation.isValid) {
      logger.warn('Пропуск файла галереи', 'admin/upload-gallery-files', { name: file.name, error: validation.error });
      continue;
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = path.extname(file.name).toLowerCase() || '.jpg';
    const safeExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext) ? ext : '.jpg';
    const fileName = `gallery_${i + 1}${safeExt}`;
    const filePath = path.join(uploadDir, fileName);
    await writeFile(filePath, buffer);
    galleryPaths.push(`/uploads/gallery/doors/${dirId}/${fileName}`);
  }

  logger.info('Файлы галереи загружены', 'admin/upload-gallery-files', {
    userId: user.userId,
    dirId,
    hasCover: !!coverPath,
    galleryCount: galleryPaths.length,
  });

  return apiSuccess({
    coverPath,
    galleryPaths,
  });
}

export const POST = withErrorHandling(
  requireAuthAndPermission(postHandler, 'ADMIN'),
  'admin/upload-gallery-files/POST'
);
