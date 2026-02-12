import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';
import { getDoorsCategoryId } from '@/lib/catalog-categories';

// Кэш для фотографий
const photosCache = new Map<string, { photos: string[], timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 минут (уменьшено с 30)

// Кэш для всех товаров (чтобы не делать запрос к БД каждый раз)
let allProductsCache: Array<{
  id: string;
  sku: string;
  name: string | null;
  properties_data: unknown;
}> | null = null;
let allProductsCacheTimestamp = 0;
const ALL_PRODUCTS_CACHE_TTL = 5 * 60 * 1000; // 5 минут (уменьшено с 10)

// Максимальный размер кэша фотографий
const MAX_PHOTOS_CACHE_SIZE = 50;

// DELETE - очистка кэша
async function deleteHandler(
  req: NextRequest,
  user: ReturnType<typeof getAuthenticatedUser>
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  photosCache.clear();
  allProductsCache = null;
  allProductsCacheTimestamp = 0;
  logger.info('Кэш photos очищен', 'catalog/doors/photos/DELETE', {}, loggingContext);
  return apiSuccess({ success: true, message: 'Кэш photos очищен' });
}

export const DELETE = withErrorHandling(
  requireAuth(deleteHandler),
  'catalog/doors/photos/DELETE'
);

async function getHandler(
  req: NextRequest,
  user: ReturnType<typeof getAuthenticatedUser>
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { searchParams } = new URL(req.url);
  const model = searchParams.get('model');
  const style = searchParams.get('style');

  if (!model) {
    throw new ValidationError('Не указана модель');
  }

  // Проверяем кэш
  const cacheKey = `${model}_${style || 'all'}`;
  const cached = photosCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return apiSuccess({
      model,
      style,
      photos: cached.photos,
      count: cached.photos.length,
      cached: true
    });
  }

  logger.debug('API photos - поиск фотографий для модели', 'catalog/doors/photos/GET', { model, style }, loggingContext);

  // Получаем товары из кэша или из БД
  let products;
  if (allProductsCache && Date.now() - allProductsCacheTimestamp < ALL_PRODUCTS_CACHE_TTL) {
    logger.debug('API photos - используем кэш товаров', 'catalog/doors/photos/GET', {}, loggingContext);
    products = allProductsCache;
  } else {
    logger.debug('API photos - загружаем товары из БД', 'catalog/doors/photos/GET', {}, loggingContext);
    const doorsCategoryId = await getDoorsCategoryId();
    if (!doorsCategoryId) {
      return apiSuccess({ model, style, photos: [], count: 0, cached: false });
    }
    products = await prisma.product.findMany({
      where: {
        catalog_category_id: doorsCategoryId
      },
      select: {
        id: true,
        sku: true,
        name: true,
        properties_data: true
      },
      // Оптимизация: уменьшаем количество товаров и добавляем сортировку
      take: 200,
      orderBy: {
        created_at: 'desc'
      }
    });

    // Сохраняем в кэш
    allProductsCache = products;
    allProductsCacheTimestamp = Date.now();
    logger.debug('API photos - товары сохранены в кэш', 'catalog/doors/photos/GET', { productsCount: products.length }, loggingContext);
  }

  // Ищем фотографии для модели
  const photos: string[] = [];
  const seenArticles = new Set<string>();

  // Оптимизация: предварительно парсим все properties_data
  const parsedProducts = products.map(product => {
    try {
      const properties = product.properties_data ?
        (typeof product.properties_data === 'string' ? JSON.parse(product.properties_data) : product.properties_data) : {};
      
      // Поддерживаем старый формат (массив) и новый (объект с cover/gallery)
      let productPhotos: string[] = [];
      if (properties.photos) {
        if (Array.isArray(properties.photos)) {
          // Старый формат: массив
          productPhotos = properties.photos;
        } else if (properties.photos.cover || properties.photos.gallery) {
          // Новый формат: объект { cover, gallery }
          productPhotos = [
            properties.photos.cover,
            ...(properties.photos.gallery || []).filter((p: string) => p !== null)
          ].filter(Boolean);
        }
      }
      
      return {
        ...product,
        parsedProperties: properties,
        productModel: properties['Domeo_Название модели для Web'],
        productArticle: properties['Артикул поставщика'],
        productPhotos
      };
    } catch (error) {
      logger.warn(`Ошибка парсинга properties_data для товара`, 'catalog/doors/photos/GET', { sku: product.sku, error }, loggingContext);
      return {
        ...product,
        parsedProperties: {},
        productModel: null,
        productArticle: null,
        productPhotos: []
      };
    }
  });

  // Точное совпадение модели
  for (const product of parsedProducts) {
    if (product.productModel === model && product.productPhotos.length > 0) {
      logger.debug(`Найдена модель с фотографиями`, 'catalog/doors/photos/GET', {
        model,
        article: product.productArticle,
        photosCount: product.productPhotos.length
      }, loggingContext);

      // Добавляем фотографии только если артикул еще не обработан
      if (product.productArticle && !seenArticles.has(product.productArticle)) {
        seenArticles.add(product.productArticle);

        // Берем первую фотографию
        if (product.productPhotos.length > 0) {
          photos.push(product.productPhotos[0]);
        }
      }

      break; // Берем первое найденное фото
    }
  }

  // Если не найдено точное совпадение, ищем по частичному совпадению
  if (photos.length === 0) {
    for (const product of parsedProducts) {
      // Частичное совпадение (модель содержит искомое название)
      if (product.productModel && product.productModel.includes(model) && product.productPhotos.length > 0) {
        logger.debug(`Найдена модель (частичное совпадение) с фотографиями`, 'catalog/doors/photos/GET', {
          model,
          article: product.productArticle,
          photosCount: product.productPhotos.length
        }, loggingContext);

        // Добавляем фотографии только если артикул еще не обработан
        if (product.productArticle && !seenArticles.has(product.productArticle)) {
          seenArticles.add(product.productArticle);

          // Берем первую фотографию
          if (product.productPhotos.length > 0) {
            photos.push(product.productPhotos[0]);
          }
        }

        break;
      }
    }
  }

  // Сохраняем в кэш с ограничением размера
  if (photosCache.size >= MAX_PHOTOS_CACHE_SIZE) {
    // Удаляем самый старый элемент
    const oldestKey = photosCache.keys().next().value;
    photosCache.delete(oldestKey);
  }
  
  photosCache.set(cacheKey, {
    photos,
    timestamp: Date.now()
  });

  return apiSuccess({
    model,
    style,
    photos,
    count: photos.length,
    cached: false
  });
}

export const GET = withErrorHandling(
  requireAuth(getHandler),
  'catalog/doors/photos/GET'
);
