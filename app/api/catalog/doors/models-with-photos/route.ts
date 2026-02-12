import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';
import { getDoorsCategoryId } from '@/lib/catalog-categories';

// Кэш для моделей с фото
const modelsWithPhotosCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 минут - увеличиваем время кэширования

async function getHandler(
  req: NextRequest,
  user: ReturnType<typeof getAuthenticatedUser>
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { searchParams } = new URL(req.url);
  const style = searchParams.get('style');

  // Проверяем кэш
  const cacheKey = style || 'all';
  const cached = modelsWithPhotosCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug('API models-with-photos - используем кэш', 'catalog/doors/models-with-photos/GET', {}, loggingContext);
    return apiSuccess({
      models: cached.data,
      cached: true
    });
  }

  logger.debug('API models-with-photos - загрузка моделей с фото для стиля', 'catalog/doors/models-with-photos/GET', {
    style: style || 'все'
  }, loggingContext);

  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    return apiSuccess({ models: [], cached: false });
  }

  // Оптимизированный запрос к БД с фильтрацией на уровне БД
  const products = await prisma.product.findMany({
    where: {
      catalog_category_id: doorsCategoryId,
      is_active: true // Добавляем фильтр активных товаров
    },
    select: {
      properties_data: true
    },
    orderBy: {
      created_at: 'desc' // Сортируем по дате создания для консистентности
    }
  });

  // Обрабатываем данные и создаем карту моделей с фото
  const modelPhotoMap = new Map<string, { model: string, style: string, photo: string | null }>();

  products.forEach(product => {
    const properties = product.properties_data ?
      (typeof product.properties_data === 'string' ? JSON.parse(product.properties_data) : product.properties_data) : {};

    const model = properties['Domeo_Название модели для Web'];
    const productStyle = properties['Domeo_Стиль Web'];
    const productArticle = properties['Артикул поставщика'];
    const productPhotos = properties.photos || [];

    if (model && productStyle) {
      // Если указан стиль, фильтруем только по этому стилю
      if (!style || productStyle === style) {
        // Берем первую фотографию для модели
        const photo = productPhotos.length > 0 ? productPhotos[0] : null;
        
        // Сохраняем только если модель еще не обработана или у нас есть фото
        if (!modelPhotoMap.has(model) || photo) {
          modelPhotoMap.set(model, {
            model,
            style: productStyle,
            photo
          });
        }
      }
    }
  });

  const models = Array.from(modelPhotoMap.values())
    .sort((a, b) => a.model.localeCompare(b.model));

  // Сохраняем в кэш
  modelsWithPhotosCache.set(cacheKey, {
    data: models,
    timestamp: Date.now()
  });

  logger.info('API models-with-photos - найдено моделей с фото', 'catalog/doors/models-with-photos/GET', {
    modelsCount: models.length,
    style: style || 'все'
  }, loggingContext);

  return apiSuccess({
    models: models,
    cached: false
  });
}

export const GET = withErrorHandling(
  requireAuth(getHandler),
  'catalog/doors/models-with-photos/GET'
);
