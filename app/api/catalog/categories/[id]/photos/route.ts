import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';

async function deleteHandler(
  request: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const categoryId = resolvedParams.id;
    
    logger.info('Удаление фотографий категории', 'catalog/categories/[id]/photos', { userId: user.userId, categoryId });

    // Получаем все товары категории
    const products = await prisma.product.findMany({
      where: { catalog_category_id: categoryId },
      select: {
        id: true,
        sku: true,
        name: true,
        properties_data: true
      }
    });

    if (products.length === 0) {
      throw new NotFoundError('В категории нет товаров');
    }

    let deletedCount = 0;
    let processedCount = 0;

    // Обрабатываем каждый товар
    for (const product of products) {
      try {
        const properties = typeof product.properties_data === 'string' 
          ? JSON.parse(product.properties_data) 
          : product.properties_data;

        // Проверяем наличие фотографий
        if (properties.photos && Array.isArray(properties.photos) && properties.photos.length > 0) {
          deletedCount += properties.photos.length;
          
          // Удаляем массив фотографий
          delete properties.photos;
          
          // Обновляем товар
          await prisma.product.update({
            where: { id: product.id },
            data: {
              properties_data: JSON.stringify(properties)
            }
          });
        }
        
        processedCount++;
      } catch (error) {
        logger.error(`Ошибка при обработке товара ${product.sku}`, 'catalog/categories/[id]/photos', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
      }
    }

    logger.info('Фотографии успешно удалены', 'catalog/categories/[id]/photos', { 
      categoryId, 
      processedCount, 
      deletedCount 
    });

    return apiSuccess({
      message: `Фотографии успешно удалены из ${processedCount} товаров`,
      deletedCount: deletedCount,
      processedCount: processedCount
    });

  } catch (error) {
    logger.error('Ошибка при удалении всех фотографий', 'catalog/categories/[id]/photos', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof NotFoundError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка при удалении всех фотографий', 500);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(
    requireAuthAndPermission(
      async (req: NextRequest, user: AuthenticatedUser) => {
        return await deleteHandler(req, user, { params });
      },
      'ADMIN'
    ),
    'catalog/categories/[id]/photos/DELETE'
  )(request);
}
