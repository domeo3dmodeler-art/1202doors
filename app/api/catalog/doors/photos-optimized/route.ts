import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';
import { getDoorsCategoryId } from '@/lib/catalog-categories';

// Оптимизированный кэш для фотографий
const photosCache = new Map<string, { photos: string[], timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 минут

// Кэш для моделей с фотографиями
const modelsCache = new Map<string, { model: string, photos: string[], timestamp: number }>();
const MODELS_CACHE_TTL = 30 * 60 * 1000; // 30 минут

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

  // Проверяем кэш фотографий
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

  logger.debug('API photos-optimized - поиск фотографий для модели', 'catalog/doors/photos-optimized/GET', { model, style }, loggingContext);

    // Сначала проверяем кэш моделей
    let photos: string[] = [];
    
    // Ищем в кэше моделей
    for (const [cachedModel, cachedData] of modelsCache.entries()) {
      if (Date.now() - cachedData.timestamp < MODELS_CACHE_TTL) {
        if (cachedModel === model || cachedModel.includes(model)) {
          photos = cachedData.photos;
          logger.debug('Найдено в кэше моделей', 'catalog/doors/photos-optimized/GET', {
            cachedModel,
            photosCount: photos.length
          }, loggingContext);
          break;
        }
      }
    }

    // Если не найдено в кэше, ищем в БД
    if (photos.length === 0) {
      logger.debug('API photos-optimized - поиск в БД', 'catalog/doors/photos-optimized/GET', {}, loggingContext);

      const doorsCategoryId = await getDoorsCategoryId();
      if (!doorsCategoryId) {
        return apiSuccess({ model, style, photos: [], count: 0, cached: false });
      }

      // Оптимизированный запрос: ищем только товары с фотографиями
      const products = await prisma.product.findMany({
        where: {
          catalog_category_id: doorsCategoryId,
          properties_data: {
            not: null,
            contains: '"photos":'
          }
        },
        select: {
          id: true,
          sku: true,
          name: true,
          properties_data: true
        },
        take: 100, // Уменьшаем количество
        orderBy: {
          created_at: 'desc'
        }
      });

      logger.debug('Найдено товаров с фотографиями', 'catalog/doors/photos-optimized/GET', { productsCount: products.length }, loggingContext);

      // Обрабатываем товары
      const seenArticles = new Set<string>();
      
      for (const product of products) {
        try {
          const properties = typeof product.properties_data === 'string' 
            ? JSON.parse(product.properties_data) 
            : product.properties_data;

          const productModel = properties['Domeo_Название модели для Web'];
          const productArticle = properties['Артикул поставщика'];
          const productPhotos = properties.photos || [];

          // Точное совпадение модели
          if (productModel === model && productPhotos.length > 0) {
            logger.debug('Найдена модель с фотографиями', 'catalog/doors/photos-optimized/GET', {
              model,
              article: productArticle,
              photosCount: productPhotos.length
            }, loggingContext);

            if (productArticle && !seenArticles.has(productArticle)) {
              seenArticles.add(productArticle);
              photos.push(productPhotos[0]);
            }
            break;
          }
        } catch (error) {
          logger.warn('Ошибка обработки товара', 'catalog/doors/photos-optimized/GET', { sku: product.sku, error }, loggingContext);
        }
      }

      // Если не найдено точное совпадение, ищем частичное
      if (photos.length === 0) {
        for (const product of products) {
          try {
            const properties = typeof product.properties_data === 'string' 
              ? JSON.parse(product.properties_data) 
              : product.properties_data;

            const productModel = properties['Domeo_Название модели для Web'];
            const productArticle = properties['Артикул поставщика'];
            const productPhotos = properties.photos || [];

            // Частичное совпадение
            if (productModel && productModel.includes(model) && productPhotos.length > 0) {
              logger.debug('Найдена модель (частичное совпадение) с фотографиями', 'catalog/doors/photos-optimized/GET', {
                model,
                article: productArticle,
                photosCount: productPhotos.length
              }, loggingContext);

              if (productArticle && !seenArticles.has(productArticle)) {
                seenArticles.add(productArticle);
                photos.push(productPhotos[0]);
              }
              break;
            }
          } catch (error) {
            logger.warn('Ошибка обработки товара', 'catalog/doors/photos-optimized/GET', { sku: product.sku, error }, loggingContext);
          }
        }
      }

      // Сохраняем в кэш моделей
      if (photos.length > 0) {
        modelsCache.set(model, {
          model,
          photos,
          timestamp: Date.now()
        });
      }
    }

    // Сохраняем в кэш фотографий
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
  'catalog/doors/photos-optimized/GET'
);
