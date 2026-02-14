import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';

// POST /api/test-photo - Тестирование загрузки фото
async function postHandler(
  request: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { categoryId, mappingProperty, fileName } = await request.json();

  logger.info('Тест загрузки фото', 'test-photo/POST', {
    categoryId,
    mappingProperty,
    fileName
  }, loggingContext);

  // Получаем товары из категории
  const products = await prisma.product.findMany({
    where: {
      catalog_category_id: categoryId
    },
    select: {
      id: true,
      sku: true,
      name: true,
      properties_data: true
    },
    take: 10
  });

  logger.debug('Найдено товаров в категории', 'test-photo/POST', {
    productsCount: products.length
  }, loggingContext);

  const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, '');
  const results = [];

  for (const product of products) {
    try {
      const properties = JSON.parse(product.properties_data || '{}');
      const allKeys = Object.keys(properties);
      
      logger.debug(`Анализ товара ${product.sku}`, 'test-photo/POST', {
        availableKeys: allKeys,
        availableValues: Object.values(properties)
      }, loggingContext);

      // Ищем совпадения по всем ключам
      const matches = [];
      allKeys.forEach(key => {
        const value = properties[key];
        if (value) {
          const valueStr = value.toString().trim();
          const fileNameStr = fileNameWithoutExt.trim();
          
          if (valueStr === fileNameStr || 
              valueStr.includes(fileNameStr) || 
              fileNameStr.includes(valueStr)) {
            matches.push({
              key,
              value: valueStr,
              matchType: valueStr === fileNameStr ? 'exact' : 'partial'
            });
          }
        }
      });

      results.push({
        product: {
          id: product.id,
          sku: product.sku,
          name: product.name
        },
        matches,
        properties: properties
      });

      if (matches.length > 0) {
        logger.debug(`Найдены совпадения для ${product.sku}`, 'test-photo/POST', { matches }, loggingContext);
      } else {
        logger.debug(`Совпадений не найдено для ${product.sku}`, 'test-photo/POST', {}, loggingContext);
      }

    } catch (error) {
      logger.warn(`Ошибка обработки товара ${product.sku}`, 'test-photo/POST', { error }, loggingContext);
      results.push({
        product: {
          id: product.id,
          sku: product.sku,
          name: product.name
        },
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
        matches: []
      });
    }
  }

  return apiSuccess({
    testResults: {
      categoryId,
      mappingProperty,
      fileName,
      fileNameWithoutExt,
      totalProducts: products.length,
      results
    }
  });
}

export const POST = withErrorHandling(
  requireAuth(postHandler),
  'test-photo/POST'
);



