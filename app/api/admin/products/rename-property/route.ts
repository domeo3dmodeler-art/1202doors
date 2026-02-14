import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import type { AuthenticatedUser } from '@/lib/auth/request-helpers';

// POST /api/admin/products/rename-property - Переименование значения свойства товара
async function postHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const body = await req.json();
  const { categoryId, propertyName, oldValue, newValue } = body;

  // Валидация
  if (!categoryId || !propertyName || !oldValue || !newValue) {
    throw new ValidationError('Не указаны обязательные параметры', {
      required: ['categoryId', 'propertyName', 'oldValue', 'newValue']
    });
  }

  logger.info('Переименование свойства', 'admin/products/rename-property/POST', {
    categoryId,
    propertyName,
    oldValue,
    newValue
  }, loggingContext);

  // Получаем все товары категории
  const products = await prisma.product.findMany({
    where: {
      catalog_category_id: categoryId
    },
    select: {
      id: true,
      sku: true,
      properties_data: true,
      specifications: true
    }
  });

  logger.debug('Найдено товаров для обновления', 'admin/products/rename-property/POST', {
    productsCount: products.length
  }, loggingContext);

  let updatedCount = 0;
  let errorCount = 0;

  // Обновляем каждый товар
  for (const product of products) {
    try {
      // Парсим properties_data
      const propertiesData = typeof product.properties_data === 'string'
        ? JSON.parse(product.properties_data)
        : product.properties_data;

      // Парсим specifications
      const specifications = typeof product.specifications === 'string'
        ? JSON.parse(product.specifications || '{}')
        : product.specifications;

      let hasChanges = false;

      // Обновляем свойство в properties_data (с учетом разных регистров)
      // Проверяем основное свойство
      if (propertiesData[propertyName]) {
        const currentValue = String(propertiesData[propertyName]);
        if (currentValue.toLowerCase() === oldValue.toLowerCase()) {
          propertiesData[propertyName] = newValue;
          hasChanges = true;
          logger.debug('Обновлено свойство в properties_data', 'admin/products/rename-property/POST', {
            sku: product.sku,
            propertyName,
            oldValue: currentValue,
            newValue
          }, loggingContext);
        }
      }

      // Проверяем также поле "Общее_Тип покрытия", если это свойство "Тип покрытия"
      const generalPropertyName = `Общее_${propertyName}`;
      if (propertiesData[generalPropertyName]) {
        const currentValue = String(propertiesData[generalPropertyName]);
        if (currentValue.toLowerCase() === oldValue.toLowerCase()) {
          propertiesData[generalPropertyName] = newValue;
          hasChanges = true;
          logger.debug('Обновлено общее свойство в properties_data', 'admin/products/rename-property/POST', {
            sku: product.sku,
            propertyName: generalPropertyName,
            oldValue: currentValue,
            newValue
          }, loggingContext);
        }
      }

      // Обновляем свойство в specifications (с учетом разных регистров)
      if (specifications[propertyName]) {
        const currentValue = String(specifications[propertyName]);
        if (currentValue.toLowerCase() === oldValue.toLowerCase()) {
          specifications[propertyName] = newValue;
          hasChanges = true;
        }
      }

      // Проверяем также поле "Общее_Тип покрытия" в specifications
      if (specifications[generalPropertyName]) {
        const currentValue = String(specifications[generalPropertyName]);
        if (currentValue.toLowerCase() === oldValue.toLowerCase()) {
          specifications[generalPropertyName] = newValue;
          hasChanges = true;
        }
      }

      // Если были изменения, обновляем товар в БД
      if (hasChanges) {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            properties_data: JSON.stringify(propertiesData),
            specifications: JSON.stringify(specifications),
            updated_at: new Date()
          }
        });
        updatedCount++;
      }
    } catch (error) {
      logger.warn('Ошибка обновления товара', 'admin/products/rename-property/POST', {
        sku: product.sku,
        error
      }, loggingContext);
      errorCount++;
    }
  }

  logger.info('Переименование свойства завершено', 'admin/products/rename-property/POST', {
    totalProducts: products.length,
    updated: updatedCount,
    errors: errorCount
  }, loggingContext);

  return apiSuccess({
    message: `Свойство "${propertyName}" переименовано: "${oldValue}" → "${newValue}"`,
    stats: {
      totalProducts: products.length,
      updated: updatedCount,
      errors: errorCount
    }
  });
}

export const POST = withErrorHandling(
  requireAuthAndPermission(postHandler, 'ADMIN'),
  'admin/products/rename-property/POST'
);

