import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, withErrorHandling } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/middleware';
import type { AuthenticatedUser } from '@/lib/auth/request-helpers';

// GET /api/catalog/categories-flat - Получить плоский список категорий для импорта
async function getHandler(
  request: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  
  logger.debug('Загрузка плоского списка категорий для импорта', 'catalog/categories-flat', {}, loggingContext);

  const categories = await prisma.catalogCategory.findMany({
    where: { is_active: true },
    orderBy: [
      { level: 'asc' },
      { sort_order: 'asc' },
      { name: 'asc' }
    ]
  });

  // Подсчитываем товары для каждой категории
  const categoriesWithCounts = await Promise.all(
    categories.map(async (category) => {
      const productCount = await prisma.product.count({
        where: {
          catalog_category_id: category.id
        }
      });
      
      return {
        id: category.id,
        name: category.name,
        level: category.level,
        parent_id: category.parent_id,
        product_count: productCount,
        displayName: category.name
      };
    })
  );

  logger.info(`Загружено ${categoriesWithCounts.length} категорий`, 'catalog/categories-flat', { count: categoriesWithCounts.length }, loggingContext);

  return apiSuccess({
    categories: categoriesWithCounts,
    total_count: categoriesWithCounts.length
  });
}

export const GET = withErrorHandling(
  requireAuth(getHandler),
  'catalog/categories-flat/GET'
);
