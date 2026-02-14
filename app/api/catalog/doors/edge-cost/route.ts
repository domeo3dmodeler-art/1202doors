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
  const model = searchParams.get('model');
  const finish = searchParams.get('finish');
  const color = searchParams.get('color');
  const type = searchParams.get('type');
  const width = searchParams.get('width');
  const height = searchParams.get('height');

  logger.debug('Получение стоимости кромки', 'catalog/doors/edge-cost/GET', {
    style,
    model,
    finish,
    color,
    type,
    width,
    height
  }, loggingContext);

  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    return apiSuccess({ edgeCost: 0, message: 'Категория дверей не найдена' });
  }

  // Получаем все товары категории двери
  const products = await prisma.product.findMany({
    where: {
      catalog_category_id: doorsCategoryId
    },
    select: {
      properties_data: true
    }
  });

  // Фильтруем товары по выбранным параметрам
  const filteredProducts = products.filter(product => {
    const properties = product.properties_data ?
      (typeof product.properties_data === 'string' ? JSON.parse(product.properties_data) : product.properties_data) : {};

    // Применяем фильтры по порядку
    if (style && properties['Domeo_Стиль Web'] !== style) return false;
    if (model && properties['Артикул поставщика'] !== model) return false;
    if (finish && properties['Тип покрытия'] !== finish) return false;
    if (color && properties['Domeo_Цвет'] !== color) return false;
    if (type && properties['Тип конструкции'] !== type) return false;
    if (width && properties['Ширина/мм'] !== width) return false;
    if (height && properties['Высота/мм'] !== height) return false;

    return true;
  });

  logger.debug('Отфильтровано товаров', 'catalog/doors/edge-cost/GET', {
    filtered: filteredProducts.length,
    total: products.length
  }, loggingContext);

  // Анализируем кромку и стоимость
  const costValues = new Set<string>();
  let sampleProduct: { cost: string; edge: string; style: unknown; model: unknown; finish: unknown; color: unknown } | null = null;
  let hasNoEdgeWithoutCost = 0;  // Кромка "нет" без стоимости
  let hasNoEdgeWithCost = 0;     // Кромка "нет" со стоимостью
  let hasSpecificEdgeProducts = 0;

  filteredProducts.forEach(product => {
    const properties = product.properties_data ?
      (typeof product.properties_data === 'string' ? JSON.parse(product.properties_data) : product.properties_data) : {};

    const edgeValue = properties['Кромка'];
    const costValue = properties['Стоимость надбавки за кромку'];
    
    if (!edgeValue || edgeValue === '-' || edgeValue === '' || 
        edgeValue.toLowerCase() === 'нет' || edgeValue.toLowerCase() === 'no') {
      // Проверяем наличие стоимости надбавки
      if (costValue && costValue !== '-' && costValue !== '' && costValue !== null) {
        hasNoEdgeWithCost++;
        costValues.add(costValue);
        if (!sampleProduct) {
          sampleProduct = {
            cost: costValue,
            edge: edgeValue,
            style: properties['Domeo_Стиль Web'],
            model: properties['Domeo_Название модели для Web'],
            finish: properties['Тип покрытия'],
            color: properties['Domeo_Цвет']
          };
        }
      } else {
        hasNoEdgeWithoutCost++;
      }
    } else {
      hasSpecificEdgeProducts++;
    }
  });

  const responseData = {
    filteredCount: filteredProducts.length,
    costValues: Array.from(costValues).sort(),
    sampleProduct,
    hasCost: costValues.size > 0,
    hasNoEdgeWithoutCost,
    hasNoEdgeWithCost,
    hasSpecificEdgeProducts,
    isEdgeUnavailable: hasNoEdgeWithoutCost > 0 && hasNoEdgeWithCost === 0 && hasSpecificEdgeProducts === 0
  };

  logger.debug('Стоимость кромки', 'catalog/doors/edge-cost/GET', responseData, loggingContext);

  return apiSuccess(responseData);
}

export const GET = withErrorHandling(
  requireAuth(getHandler),
  'catalog/doors/edge-cost/GET'
);
