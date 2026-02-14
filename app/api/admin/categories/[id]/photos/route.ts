import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import type { AuthenticatedUser } from '@/lib/auth/request-helpers';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError, NotFoundError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';

async function putHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const categoryId = resolvedParams.id;
    const { photoMapping, photoData } = await req.json();

    logger.info('Сохранение фотографий категории', 'admin/categories/[id]/photos', { 
      userId: user.userId,
      categoryId,
      hasPhotoMapping: !!photoMapping,
      hasPhotoData: !!photoData
    });

    if (!categoryId) {
      throw new ValidationError('Не указан ID категории');
    }

    // Проверяем существование категории
    const existingCategory = await prisma.frontendCategory.findUnique({
      where: { id: categoryId }
    });

    if (!existingCategory) {
      throw new NotFoundError('Категория не найдена');
    }

    // Подготавливаем данные для обновления
    const updateData: Record<string, unknown> = {
      updated_at: new Date()
    };

    if (photoMapping) {
      logger.debug('Сохранение упрощенного photoMapping', 'admin/categories/[id]/photos', {
        mappingType: photoMapping.mappingType,
        totalFiles: photoMapping.totalFiles,
        mappedCount: photoMapping.mappedCount
      });
      
      try {
        const minimalMapping = {
          mappingType: photoMapping.mappingType,
          totalFiles: photoMapping.totalFiles || 0,
          mappedCount: photoMapping.mappedCount || 0,
          savedAt: new Date().toISOString()
        };
        
        updateData.photo_mapping = JSON.stringify(minimalMapping);
        logger.debug('Упрощенный photoMapping подготовлен', 'admin/categories/[id]/photos');
      } catch (error) {
        logger.error('Ошибка сериализации photoMapping', 'admin/categories/[id]/photos', error instanceof Error ? { error: error.message } : { error: String(error) });
        throw new ValidationError('Ошибка сериализации данных фотографий');
      }
    }
    
    if (photoData) {
      logger.debug('Сохранение photoData', 'admin/categories/[id]/photos');
      try {
        updateData.photo_data = JSON.stringify(photoData);
        logger.debug('photoData успешно подготовлен', 'admin/categories/[id]/photos');
      } catch (error) {
        logger.error('Ошибка сериализации photoData', 'admin/categories/[id]/photos', error instanceof Error ? { error: error.message } : { error: String(error) });
        throw new ValidationError('Ошибка сериализации данных фотографий');
      }
    }

    // Обновляем категорию
    const updatedCategory = await prisma.frontendCategory.update({
      where: { id: categoryId },
      data: updateData
    });
    
    logger.info('Категория успешно обновлена с фотографиями', 'admin/categories/[id]/photos', { categoryId });
    
    return apiSuccess({
      message: 'Данные фотографий успешно сохранены',
      categoryId: updatedCategory.id,
      photoMapping: photoMapping ? {
        mappingType: photoMapping.mappingType,
        totalFiles: photoMapping.totalFiles,
        mappedCount: photoMapping.mappedCount
      } : null,
      photoData: photoData ? {
        totalCount: photoData.totalCount,
        filesCount: photoData.files?.length || 0
      } : null
    });

  } catch (error) {
    logger.error('Общая ошибка сохранения фотографий', 'admin/categories/[id]/photos', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка при сохранении фотографий', 500);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(
    requireAuthAndPermission(
      async (request: NextRequest, user: AuthenticatedUser) => {
        return await putHandler(request, user, { params });
      },
      'ADMIN'
    ),
    'admin/categories/[id]/photos/PUT'
  )(req);
}
