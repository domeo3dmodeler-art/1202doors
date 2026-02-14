import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import type { AuthenticatedUser } from '@/lib/auth/request-helpers';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError, NotFoundError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';

// ===================== Удаление категории =====================

async function deleteHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const categoryId = resolvedParams.id;

    if (!categoryId) {
      throw new ValidationError('Не указан ID категории');
    }

    logger.info('Удаление категории', 'admin/categories/[id]', { userId: user.userId, categoryId });

    // Проверяем существование категории
    const category = await prisma.frontendCategory.findUnique({
      where: { id: categoryId }
    });

    if (!category) {
      throw new NotFoundError('Категория не найдена');
    }

    // Удаляем категорию
    await prisma.frontendCategory.delete({
      where: { id: categoryId }
    });

    logger.info('Категория удалена', 'admin/categories/[id]', { categoryId });

    return apiSuccess({
      message: 'Категория успешно удалена'
    });

  } catch (error) {
    logger.error('Category deletion error', 'admin/categories/[id]', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка при удалении категории', 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(
    requireAuthAndPermission(
      async (request: NextRequest, user: AuthenticatedUser) => {
        return await deleteHandler(request, user, { params });
      },
      'ADMIN'
    ),
    'admin/categories/[id]/DELETE'
  )(req);
}

// ===================== Обновление категории =====================

async function putHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const categoryId = resolvedParams.id;
    const { 
      name, 
      slug, 
      description, 
      isActive, 
      catalogCategoryIds, 
      propertyMapping, 
      photoMapping, 
      photoData 
    } = await req.json();

    logger.info('Обновление категории', 'admin/categories/[id]', { 
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
      updated_at: new Date() // Всегда обновляем timestamp
    };

    // Добавляем поля только если они переданы (не undefined)
    if (name !== undefined) {
      updateData.name = name;
    }
    if (slug !== undefined) {
      updateData.slug = slug;
    }
    if (description !== undefined) {
      updateData.description = description;
    }
    if (isActive !== undefined) {
      updateData.is_active = isActive;
    }

    // Добавляем дополнительные поля если они переданы
    if (catalogCategoryIds) {
      updateData.catalog_category_ids = JSON.stringify(catalogCategoryIds);
    }
    
    if (propertyMapping) {
      updateData.property_mapping = JSON.stringify(propertyMapping);
    }
    
    if (photoMapping) {
      logger.debug('Сохранение упрощенного photoMapping', 'admin/categories/[id]', {
        mappingType: photoMapping.mappingType,
        totalFiles: photoMapping.totalFiles,
        mappedCount: photoMapping.mappedCount
      });
      
      try {
        // Сохраняем только минимальные данные - статистику
        const minimalMapping = {
          mappingType: photoMapping.mappingType,
          totalFiles: photoMapping.totalFiles || 0,
          mappedCount: photoMapping.mappedCount || 0,
          savedAt: new Date().toISOString()
        };
        
        updateData.photo_mapping = JSON.stringify(minimalMapping);
        logger.debug('Упрощенный photoMapping подготовлен', 'admin/categories/[id]');
      } catch (error) {
        logger.error('Ошибка сериализации упрощенного photoMapping', 'admin/categories/[id]', error instanceof Error ? { error: error.message } : { error: String(error) });
        throw new ValidationError('Ошибка сериализации данных фотографий');
      }
    }
    
    if (photoData) {
      logger.debug('Сохранение photoData', 'admin/categories/[id]');
      try {
        updateData.photo_data = JSON.stringify(photoData);
        logger.debug('photoData успешно сериализован', 'admin/categories/[id]');
      } catch (error) {
        logger.error('Ошибка сериализации photoData', 'admin/categories/[id]', error instanceof Error ? { error: error.message } : { error: String(error) });
        throw new ValidationError('Ошибка сериализации данных фотографий');
      }
    }

    // Обновляем категорию
    const updatedCategory = await prisma.frontendCategory.update({
      where: { id: categoryId },
      data: updateData
    });
    
    logger.info('Категория успешно обновлена', 'admin/categories/[id]', { categoryId });

    return apiSuccess({
      category: {
        id: updatedCategory.id,
        name: updatedCategory.name,
        slug: updatedCategory.slug,
        description: updatedCategory.description,
        isActive: updatedCategory.is_active,
        catalogCategoryIds: JSON.parse(updatedCategory.catalog_category_ids),
        displayConfig: JSON.parse(updatedCategory.display_config),
        createdAt: updatedCategory.created_at,
        updatedAt: updatedCategory.updated_at
      },
      message: 'Категория успешно обновлена'
    });

  } catch (error) {
    logger.error('Category update error', 'admin/categories/[id]', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка при обновлении категории', 500);
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
    'admin/categories/[id]/PUT'
  )(req);
}

// ===================== Получение категории по ID =====================

async function getHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const categoryId = resolvedParams.id;

    if (!categoryId) {
      throw new ValidationError('Не указан ID категории');
    }

    logger.info('Получение категории по ID', 'admin/categories/[id]', { userId: user.userId, categoryId });

    const category = await prisma.frontendCategory.findUnique({
      where: { id: categoryId }
    });

    if (!category) {
      throw new NotFoundError('Категория не найдена');
    }

    const formattedCategory = {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      isActive: category.is_active,
      catalogCategoryIds: JSON.parse(category.catalog_category_ids),
      displayConfig: JSON.parse(category.display_config),
      productsCount: 0, // Пока не реализовано
      subcategoriesCount: 0, // Пока не реализовано
      configuratorConfig: {},
      pageTemplate: null,
      customLayout: null,
      properties: [],
      importMapping: {},
      createdAt: category.created_at,
      updatedAt: category.updated_at
    };

    logger.info('Категория получена', 'admin/categories/[id]', { categoryId });

    return apiSuccess({
      category: formattedCategory
    });

  } catch (error) {
    logger.error('Category fetch error', 'admin/categories/[id]', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка при получении категории', 500);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(
    requireAuthAndPermission(
      async (request: NextRequest, user: AuthenticatedUser) => {
        return await getHandler(request, user, { params });
      },
      'ADMIN'
    ),
    'admin/categories/[id]/GET'
  )(req);
}
