import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';

// GET /api/products/batch-info?ids=id1,id2,id3 - Получить информацию о товарах по ID
async function getHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { searchParams } = new URL(req.url);
  const idsParam = searchParams.get('ids');
  
  if (!idsParam) {
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Не указаны ID товаров',
      400
    );
  }
  
  const ids = idsParam.split(',').map(id => id.trim()).filter(Boolean);
  
  if (ids.length === 0) {
    return apiSuccess({ products: [] });
  }
  
  logger.debug('Загрузка информации о товарах', 'products/batch-info/GET', { count: ids.length }, loggingContext);
  
  // Получаем товары с информацией о категории
  const products = await prisma.product.findMany({
    where: {
      id: { in: ids }
    },
    select: {
      id: true,
      name: true,
      sku: true,
      catalog_category: {
        select: {
          id: true,
          name: true
        }
      },
      properties_data: true
    }
  });
  
  // Форматируем данные
  const formattedProducts = products.map(product => {
    let props: Record<string, unknown> = {};
    try {
      props = typeof product.properties_data === 'string' 
        ? JSON.parse(product.properties_data) 
        : product.properties_data || {};
    } catch (e) {
      logger.warn('Ошибка парсинга свойств товара', 'products/batch-info/GET', { productId: product.id }, loggingContext);
    }
    
    // Определяем является ли товар ручкой по категории
    const isHandle = product.catalog_category?.name === 'Ручки';
    
    // Для ручек используем специальное название из properties_data
    let displayName = product.name;
    if (isHandle) {
      displayName = (props['Domeo_наименование для Web'] as string) || 
        (props['Domeo_наименование ручки_1С'] as string) || 
        product.name;
    }
    
    return {
      id: product.id,
      name: displayName,
      sku: product.sku,
      isHandle,
      categoryName: product.catalog_category?.name || ''
    };
  });
  
  return apiSuccess({ products: formattedProducts });
}

export const GET = withErrorHandling(
  requireAuth(getHandler),
  'products/batch-info/GET'
);

