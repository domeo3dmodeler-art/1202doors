import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';

const DOOR_COLOR_PROPERTY = 'Domeo_Модель_Цвет';
const DOOR_CODE_PROPERTY = 'Артикул поставщика';

// GET /api/admin/property-photos - Получить фото для свойств
async function getHandler(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId');
    const propertyName = searchParams.get('propertyName');
    const propertyValue = searchParams.get('propertyValue');

    logger.info('Получение фото свойств', 'admin/property-photos', { userId: user.userId, categoryId, propertyName, propertyValue });

    const where: Record<string, unknown> = {};
    
    if (categoryId) where.categoryId = categoryId;
    if (propertyName) where.propertyName = propertyName;
    if (propertyValue) where.propertyValue = propertyValue;

    const photos = await prisma.propertyPhoto.findMany({
      where,
      orderBy: [
        { propertyName: 'asc' },
        { propertyValue: 'asc' },
        { photoType: 'asc' }
      ]
    });

    logger.info('Фото свойств получены', 'admin/property-photos', { count: photos.length });

    return apiSuccess({
      photos,
      count: photos.length
    });

  } catch (error) {
    logger.error('Ошибка получения фото свойств', 'admin/property-photos', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка сервера при получении фото свойств', 500);
  }
}

export const GET = withErrorHandling(
  requireAuthAndPermission(getHandler, 'ADMIN'),
  'admin/property-photos/GET'
);

// POST /api/admin/property-photos - Добавить фото для свойства
async function postHandler(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    const body = await request.json();
    const {
      categoryId,
      propertyName,
      propertyValue,
      photoPath,
      photoType = 'cover',
      originalFilename,
      fileSize,
      mimeType,
      scope, // 'color' | 'code'
      coverPath,
      galleryPaths,
    } = body;

    const resolvedPropertyName =
      propertyName
      || (scope === 'color' ? DOOR_COLOR_PROPERTY : null)
      || (scope === 'code' ? DOOR_CODE_PROPERTY : null);

    const hasBulkGalleryPayload =
      (typeof coverPath === 'string' && coverPath.trim().length > 0)
      || (Array.isArray(galleryPaths) && galleryPaths.length > 0);

    if (hasBulkGalleryPayload) {
      if (!categoryId || !resolvedPropertyName || !propertyValue) {
        throw new ValidationError('Для загрузки cover/gallery укажите categoryId, propertyValue и propertyName/scope');
      }

      const safeCover = typeof coverPath === 'string' && coverPath.trim().length > 0 ? coverPath.trim() : null;
      const safeGallery = Array.isArray(galleryPaths)
        ? galleryPaths.filter((p: unknown): p is string => typeof p === 'string' && p.trim().length > 0)
        : [];

      const photos = await prisma.$transaction(async (tx) => {
        if (safeCover) {
          await tx.propertyPhoto.upsert({
            where: {
              categoryId_propertyName_propertyValue_photoType: {
                categoryId,
                propertyName: resolvedPropertyName,
                propertyValue,
                photoType: 'cover'
              }
            },
            update: {
              photoPath: safeCover,
              updatedAt: new Date()
            },
            create: {
              categoryId,
              propertyName: resolvedPropertyName,
              propertyValue,
              photoPath: safeCover,
              photoType: 'cover'
            }
          });
        }

        await tx.propertyPhoto.deleteMany({
          where: {
            categoryId,
            propertyName: resolvedPropertyName,
            propertyValue,
            photoType: { startsWith: 'gallery_' }
          }
        });

        for (let i = 0; i < safeGallery.length; i++) {
          await tx.propertyPhoto.create({
            data: {
              categoryId,
              propertyName: resolvedPropertyName,
              propertyValue,
              photoPath: safeGallery[i],
              photoType: `gallery_${i + 1}`
            }
          });
        }

        return tx.propertyPhoto.findMany({
          where: { categoryId, propertyName: resolvedPropertyName, propertyValue },
          orderBy: [{ photoType: 'asc' }]
        });
      });

      logger.info('Галерея свойства сохранена', 'admin/property-photos', {
        userId: user.userId,
        categoryId,
        propertyName: resolvedPropertyName,
        propertyValue,
        hasCover: !!safeCover,
        galleryCount: safeGallery.length
      });

      return apiSuccess({
        photos,
        message: 'Галерея фото сохранена'
      });
    }

    if (!categoryId || !resolvedPropertyName || !propertyValue || !photoPath) {
      throw new ValidationError('Не указаны обязательные поля: categoryId, propertyName, propertyValue, photoPath');
    }

    logger.info('Добавление фото свойства', 'admin/property-photos', { userId: user.userId, categoryId, propertyName: resolvedPropertyName, propertyValue, photoType });

    // Проверяем, есть ли уже фото для этого свойства и типа
    const existingPhoto = await prisma.propertyPhoto.findUnique({
      where: {
        categoryId_propertyName_propertyValue_photoType: {
          categoryId,
          propertyName: resolvedPropertyName,
          propertyValue,
          photoType
        }
      }
    });

    let photo;
    if (existingPhoto) {
      // Обновляем существующее фото
      photo = await prisma.propertyPhoto.update({
        where: { id: existingPhoto.id },
        data: {
          photoPath,
          originalFilename,
          fileSize,
          mimeType,
          updatedAt: new Date()
        }
      });
      logger.info('Фото свойства обновлено', 'admin/property-photos', { photoId: photo.id });
    } else {
      // Создаем новое фото
      photo = await prisma.propertyPhoto.create({
        data: {
          categoryId,
          propertyName: resolvedPropertyName,
          propertyValue,
          photoPath,
          photoType,
          originalFilename,
          fileSize,
          mimeType
        }
      });
      logger.info('Фото свойства создано', 'admin/property-photos', { photoId: photo.id });
    }

    return apiSuccess({
      photo,
      message: existingPhoto ? 'Фото обновлено' : 'Фото добавлено'
    });

  } catch (error) {
    logger.error('Ошибка добавления фото свойства', 'admin/property-photos', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof ValidationError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка сервера при добавлении фото свойства', 500);
  }
}

export const POST = withErrorHandling(
  requireAuthAndPermission(postHandler, 'ADMIN'),
  'admin/property-photos/POST'
);

// DELETE /api/admin/property-photos - Удалить фото свойства
async function deleteHandler(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const categoryId = searchParams.get('categoryId');
    const propertyName = searchParams.get('propertyName');
    const propertyValue = searchParams.get('propertyValue');
    const photoType = searchParams.get('photoType');

    logger.info('Удаление фото свойства', 'admin/property-photos', { userId: user.userId, id, categoryId, propertyName, propertyValue, photoType });

    if (id) {
      // Удаляем конкретное фото по ID
      await prisma.propertyPhoto.delete({
        where: { id }
      });
      logger.info('Фото свойства удалено по ID', 'admin/property-photos', { id });
    } else if (categoryId && propertyName && propertyValue) {
      // Удаляем все фото для конкретного свойства
      const where: Record<string, unknown> = {
        categoryId,
        propertyName,
        propertyValue
      };
      
      if (photoType) {
        where.photoType = photoType;
      }

      const result = await prisma.propertyPhoto.deleteMany({
        where
      });
      logger.info('Фото свойств удалены', 'admin/property-photos', { count: result.count });
    } else {
      throw new ValidationError('Не указаны параметры для удаления');
    }

    return apiSuccess({
      message: 'Фото удалено'
    });

  } catch (error) {
    logger.error('Ошибка удаления фото свойства', 'admin/property-photos', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof ValidationError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка сервера при удалении фото свойства', 500);
  }
}

export const DELETE = withErrorHandling(
  requireAuthAndPermission(deleteHandler, 'ADMIN'),
  'admin/property-photos/DELETE'
);
