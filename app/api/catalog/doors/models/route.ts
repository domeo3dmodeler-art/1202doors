import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';
import { getDoorsCategoryId } from '@/lib/catalog-categories';

// Кэш для моделей
const modelsCache = new Map<string, { models: any[], timestamp: number }>();
const CACHE_TTL = 15 * 60 * 1000; // 15 минут

// Кэш для всех товаров (чтобы не делать запрос к БД каждый раз)
let allProductsCache: Array<{
  properties_data: unknown;
}> | null = null;
let allProductsCacheTimestamp = 0;
const ALL_PRODUCTS_CACHE_TTL = 10 * 60 * 1000; // 10 минут

async function getHandler(
  req: NextRequest,
  user: ReturnType<typeof getAuthenticatedUser>
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { searchParams } = new URL(req.url);
  const styleParam = searchParams.get('style');
  // Нормализуем стиль: пустая строка или null = нет фильтра
  const style = styleParam && styleParam.trim() !== '' ? styleParam.trim() : null;

  // Проверяем кэш
  const cacheKey = style || 'all';
  const cached = modelsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return apiSuccess({
      models: cached.models,
      cached: true
    });
  }

  logger.debug('API models - загрузка моделей для стиля', 'catalog/doors/models/GET', {
    style: style || 'все',
    styleParam: styleParam,
    productsCount: allProductsCache ? allProductsCache.length : 0
  }, loggingContext);

  // Получаем товары из кэша или из БД
  let products;
  if (allProductsCache && Date.now() - allProductsCacheTimestamp < ALL_PRODUCTS_CACHE_TTL) {
    logger.debug('API models - используем кэш товаров', 'catalog/doors/models/GET', {}, loggingContext);
    products = allProductsCache;
  } else {
    logger.debug('API models - загружаем товары из БД', 'catalog/doors/models/GET', {}, loggingContext);

    const DOORS_CATEGORY_ID = await getDoorsCategoryId();
    if (!DOORS_CATEGORY_ID) {
      return apiSuccess({ models: [], cached: false });
    }

    products = await prisma.product.findMany({
      where: {
        catalog_category_id: DOORS_CATEGORY_ID,
        is_active: true
      },
      select: {
        properties_data: true
      }
    });

    // Сохраняем в кэш
    allProductsCache = products;
    allProductsCacheTimestamp = Date.now();
    logger.debug('API models - товары сохранены в кэш', 'catalog/doors/models/GET', {
      productsCount: products.length
    }, loggingContext);
  }

  // Извлекаем уникальные модели и стили из properties_data
  const modelStyleMap = new Map<string, string>();

  products.forEach(product => {
    try {
      const properties = product.properties_data ?
        (typeof product.properties_data === 'string' ? JSON.parse(product.properties_data) : product.properties_data) : {};

      const model = properties['Domeo_Название модели для Web'];
      const productStyle = properties['Domeo_Стиль Web'];

      if (model) {
        const normalizedProductStyle = productStyle ? String(productStyle).trim() : null;
        
        // Если указан стиль, фильтруем только по этому стилю
        // Если стиль не указан, показываем все модели
        if (!style) {
          // Без фильтра - добавляем все модели
          if (normalizedProductStyle) {
            modelStyleMap.set(model, normalizedProductStyle);
          } else {
            // Если стиль не указан в товаре, все равно добавляем модель
            modelStyleMap.set(model, 'Без стиля');
          }
        } else {
          // С фильтром - только если стиль совпадает
          if (normalizedProductStyle && normalizedProductStyle === style) {
            modelStyleMap.set(model, normalizedProductStyle);
          }
        }
      }
    } catch (error) {
      logger.warn('Ошибка парсинга properties_data', 'catalog/doors/models/GET', {
        error: error instanceof Error ? error.message : String(error)
      }, loggingContext);
    }
  });

  const models = Array.from(modelStyleMap.entries()).map(([model, style]) => ({
    model,
    style
  })).sort((a, b) => a.model.localeCompare(b.model));

  // Сохраняем в кэш
  modelsCache.set(cacheKey, {
    models,
    timestamp: Date.now()
  });

  logger.info('API models - найдено моделей', 'catalog/doors/models/GET', {
    modelsCount: models.length,
    style: style || 'все',
    styleParam: styleParam,
    uniqueStyles: Array.from(new Set(models.map(m => m.style)))
  }, loggingContext);

  return apiSuccess({
    models: models,
    cached: false
  });
}

export const GET = withErrorHandling(
  requireAuth(getHandler),
  'catalog/doors/models/GET'
);