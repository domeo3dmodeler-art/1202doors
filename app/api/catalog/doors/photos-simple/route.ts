import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';
import { getDoorsCategoryId } from '@/lib/catalog-categories';

async function getHandler(
  req: NextRequest,
  user: ReturnType<typeof getAuthenticatedUser>
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { searchParams } = new URL(req.url);
  const model = searchParams.get('model');

  if (!model) {
    throw new ValidationError('Не указана модель');
  }

  logger.debug('API photos-simple - поиск фотографий для модели', 'catalog/doors/photos-simple/GET', { model }, loggingContext);

  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    return apiSuccess({ model, photos: [], count: 0 });
  }

  // Простой запрос к БД
  const products = await prisma.product.findMany({
    where: {
      catalog_category_id: doorsCategoryId,
      is_active: true
    },
    select: {
      id: true,
      sku: true,
      properties_data: true
    },
    take: 100 // Ограничиваем для производительности
  });

  logger.debug(`Загружено товаров из БД`, 'catalog/doors/photos-simple/GET', { productsCount: products.length }, loggingContext);

  // Ищем фотографии для модели
  const photos: string[] = [];

  for (const product of products) {
    try {
      const properties = product.properties_data ?
        (typeof product.properties_data === 'string' ? JSON.parse(product.properties_data) : product.properties_data) : {};

      const productModel = properties['Domeo_Название модели для Web'];
      
      // Поддерживаем старый формат (массив) и новый (объект с cover/gallery)
      let productPhotos: string[] = [];
      if (properties.photos) {
        if (Array.isArray(properties.photos)) {
          productPhotos = properties.photos;
        } else if (properties.photos.cover || properties.photos.gallery) {
          productPhotos = [
            properties.photos.cover,
            ...(properties.photos.gallery || []).filter((p: string) => p !== null)
          ].filter(Boolean);
        }
      }

      // Точное совпадение модели
      if (productModel === model && productPhotos.length > 0) {
        logger.debug(`Найдена модель с фотографиями`, 'catalog/doors/photos-simple/GET', { model, photosCount: productPhotos.length }, loggingContext);
        photos.push(...productPhotos);
        break; // Берем первое найденное фото
      }
    } catch (error) {
      logger.warn(`Ошибка обработки товара`, 'catalog/doors/photos-simple/GET', { sku: product.sku, error }, loggingContext);
    }
  }

  // Если не найдено точное совпадение, ищем частичное
  if (photos.length === 0) {
    for (const product of products) {
      try {
        const properties = product.properties_data ?
          (typeof product.properties_data === 'string' ? JSON.parse(product.properties_data) : product.properties_data) : {};

        const productModel = properties['Domeo_Название модели для Web'];
        
        // Поддерживаем старый формат (массив) и новый (объект с cover/gallery)
        let productPhotos: string[] = [];
        if (properties.photos) {
          if (Array.isArray(properties.photos)) {
            productPhotos = properties.photos;
          } else if (properties.photos.cover || properties.photos.gallery) {
            productPhotos = [
              properties.photos.cover,
              ...(properties.photos.gallery || []).filter((p: string) => p !== null)
            ].filter(Boolean);
          }
        }

        // Частичное совпадение
        if (productModel && productModel.includes(model) && productPhotos.length > 0) {
          logger.debug(`Найдена модель (частичное совпадение) с фотографиями`, 'catalog/doors/photos-simple/GET', { model, photosCount: productPhotos.length }, loggingContext);
          photos.push(...productPhotos);
          break;
        }
      } catch (error) {
        logger.warn(`Ошибка обработки товара`, 'catalog/doors/photos-simple/GET', { sku: product.sku, error }, loggingContext);
      }
    }
  }

  return apiSuccess({
    model,
    photos,
    count: photos.length,
    cached: false
  });
}

export const GET = withErrorHandling(
  requireAuth(getHandler),
  'catalog/doors/photos-simple/GET'
);
