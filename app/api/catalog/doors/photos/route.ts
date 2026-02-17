import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';
import { getDoorsCategoryId } from '@/lib/catalog-categories';
import { getPropertyPhotos, getPropertyPhotosByValuePrefix, structurePropertyPhotos, DOOR_COLOR_PROPERTY, DOOR_MODEL_CODE_PROPERTY } from '@/lib/property-photos';

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
  user: AuthenticatedUser
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
  user: AuthenticatedUser
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
        productModel: properties['Название модели'],
        productDomeoCode: typeof properties['Код модели Domeo (Web)'] === 'string' ? String(properties['Код модели Domeo (Web)']).trim() : '',
        productArticle: properties['Артикул поставщика'],
        productPhotos
      };
    } catch (error) {
      logger.warn(`Ошибка парсинга properties_data для товара`, 'catalog/doors/photos/GET', { sku: product.sku, error }, loggingContext);
      return {
        ...product,
        parsedProperties: {},
        productModel: null,
        productDomeoCode: '',
        productArticle: null,
        productPhotos: []
      };
    }
  });

  const modelNorm = model.trim().toLowerCase();

  // 1) Совпадение по Код модели Domeo (Web) — приоритет для UI (modelKey)
  for (const product of parsedProducts) {
    const code = (product as { productDomeoCode?: string }).productDomeoCode;
    if (code && code.toLowerCase() === modelNorm) {
      const productPhotos = (product as { productPhotos?: string[] }).productPhotos ?? [];
      if (productPhotos.length > 0) {
        photos.push(productPhotos[0]);
        logger.debug('API photos - фото по коду модели (из товара)', 'catalog/doors/photos/GET', { model, photosCount: 1 }, loggingContext);
      }
      break;
    }
  }

  // 2) Точное совпадение по Название модели
  if (photos.length === 0) {
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
  }

  // 3) Частичное совпадение по Название модели
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

  // 4) Fallback: PropertyPhoto по коду модели, затем по префиксу кода в Domeo_Модель_Цвет. Правила: docs/DOOR_CONFIGURATOR_DATA_RULES.md
  if (photos.length === 0 && modelNorm) {
    try {
      const doorsCategoryId = await getDoorsCategoryId();
      if (doorsCategoryId) {
        const byCode = await getPropertyPhotos(doorsCategoryId, DOOR_MODEL_CODE_PROPERTY, modelNorm);
        const structured = structurePropertyPhotos(byCode);
        if (structured.cover) {
          photos.push(structured.cover);
          logger.debug('API photos - фото из PropertyPhoto по коду', 'catalog/doors/photos/GET', { model }, loggingContext);
        }
        if (photos.length === 0) {
          const byPrefix = await getPropertyPhotosByValuePrefix(doorsCategoryId, DOOR_COLOR_PROPERTY, modelNorm + '|');
          const byPrefixStructured = structurePropertyPhotos(byPrefix);
          if (byPrefixStructured.cover) {
            photos.push(byPrefixStructured.cover);
            logger.debug('API photos - фото из PropertyPhoto по префиксу кода', 'catalog/doors/photos/GET', { model }, loggingContext);
          }
        }
      }
    } catch (err) {
      logger.warn('API photos - ошибка чтения PropertyPhoto', 'catalog/doors/photos/GET', { model, error: err }, loggingContext);
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
