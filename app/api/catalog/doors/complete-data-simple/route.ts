import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';
import { getDoorsCategoryId } from '@/lib/catalog-categories';

async function getHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { searchParams } = new URL(req.url);
  const style = searchParams.get('style');

  logger.debug('API complete-data-simple - загрузка данных для стиля', 'catalog/doors/complete-data-simple/GET', {
    style: style || 'все'
  }, loggingContext);

  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    return apiSuccess({ ok: true, models: [], styles: [], timestamp: Date.now() });
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
    take: 100 // Ограничиваем для тестирования
  });

  logger.debug('Загружено товаров из БД', 'catalog/doors/complete-data-simple/GET', {
    productsCount: products.length
  }, loggingContext);

  // Простая обработка данных
  const models: any[] = [];
  const styles = new Set<string>();

  products.forEach(product => {
    try {
      const properties = product.properties_data ?
        (typeof product.properties_data === 'string' ? JSON.parse(product.properties_data) : product.properties_data) : {};

      const model = properties['Название модели'];
      const productStyle = properties['Domeo_Стиль Web'];
      const productPhotos = properties.photos || [];

      if (model && productStyle) {
        // Фильтруем по стилю если указан
        if (style && productStyle !== style) {
          return;
        }

        styles.add(productStyle);

        // Проверяем, есть ли уже такая модель
        const existingModel = models.find(m => m.model === model);
        if (!existingModel) {
          models.push({
            model,
            style: productStyle,
            photo: productPhotos.length > 0 ? productPhotos[0] : null,
            options: {
              finishes: [],
              colors: [],
              types: [],
              widths: [],
              heights: []
            }
          });
        }
      }
    } catch (error) {
      logger.warn(`Ошибка обработки товара ${product.sku}`, 'catalog/doors/complete-data-simple/GET', { error }, loggingContext);
    }
  });

  const result = {
    models: models.sort((a, b) => a.model.localeCompare(b.model)),
    totalModels: models.length,
    styles: Array.from(styles),
    timestamp: Date.now()
  };

  logger.info('API complete-data-simple - найдено моделей', 'catalog/doors/complete-data-simple/GET', {
    modelsCount: models.length
  }, loggingContext);

  return apiSuccess(result);
}

export const GET = withErrorHandling(
  requireAuth(getHandler),
  'catalog/doors/complete-data-simple/GET'
);
