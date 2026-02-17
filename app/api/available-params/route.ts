import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError, NotFoundError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';

async function getHandler(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    logger.info('Получение доступных параметров', 'available-params', { userId: user.userId });
    // Простой GET endpoint для тестирования
    const products = await prisma.product.findMany({
      where: {
        is_active: true,
        catalog_category: {
          name: 'Межкомнатные двери'
        }
      },
      select: {
        properties_data: true
      },
      take: 100 // Ограничиваем для производительности
    });

    const availableParams = {
      finishes: new Set<string>(),
      colors: new Set<string>(),
      widths: new Set<number>(),
      heights: new Set<number>()
    };

    products.forEach((product: { properties_data: unknown }) => {
      const props = product.properties_data ? 
        (typeof product.properties_data === 'string' ? JSON.parse(product.properties_data) : product.properties_data) : {};
      
      if (props?.['Тип покрытия']) {
        availableParams.finishes.add(props['Тип покрытия']);
      }
      if (props?.['Цвет/Отделка']) {
        availableParams.colors.add(props['Цвет/Отделка']);
      }
      if (props?.['Ширина/мм']) {
        availableParams.widths.add(Number(props['Ширина/мм']));
      }
      if (props?.['Высота/мм']) {
        availableParams.heights.add(Number(props['Высота/мм']));
      }
    });

    logger.info('Доступные параметры получены', 'available-params', { 
      finishes: Array.from(availableParams.finishes).length,
      colors: Array.from(availableParams.colors).length,
      widths: Array.from(availableParams.widths).length,
      heights: Array.from(availableParams.heights).length
    });

    return apiSuccess({
      params: {
        finishes: Array.from(availableParams.finishes).sort(),
        colors: Array.from(availableParams.colors).sort(),
        widths: Array.from(availableParams.widths).sort((a, b) => a - b),
        heights: Array.from(availableParams.heights).sort((a, b) => a - b)
      }
    });
  } catch (error) {
    logger.error('Error in GET /api/available-params', 'available-params', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Failed to fetch available parameters', 500);
  }
}

export const GET = withErrorHandling(
  requireAuth(getHandler),
  'available-params/GET'
);

async function postHandler(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    logger.debug('Request body', 'available-params', { body });
    const { style, model, color } = body;
    
    if (!style || !model) {
      logger.warn('Missing style or model', 'available-params', { style, model });
      throw new ValidationError('Style and model are required');
    }

    // Получаем все товары и фильтруем на клиенте
    const products = await prisma.product.findMany({
      where: {
        is_active: true
      },
      select: {
        properties_data: true
      }
    });

    logger.debug('Total products loaded', 'available-params', { count: products.length });

    // Фильтруем по стилю, модели и цвету (если указан) на клиенте
    const filteredProducts = products.filter((product: { properties_data: unknown }) => {
      try {
        const props = product.properties_data ? 
          (typeof product.properties_data === 'string' ? JSON.parse(product.properties_data) : product.properties_data) : {};
        const styleMatch = props?.['Domeo_Стиль Web'] === style;
        const modelMatch = props?.['Название модели']?.includes(model);
        const colorMatch = !color || props?.['Цвет/Отделка'] === color; // Если цвет не указан, пропускаем проверку
        
        return styleMatch && modelMatch && colorMatch;
      } catch (error) {
        logger.error('Error parsing product properties', 'available-params', error instanceof Error ? { error: error.message } : { error: String(error) });
        return false;
      }
    });

    logger.debug('Filtered products', 'available-params', { count: filteredProducts.length });

    if (filteredProducts.length === 0) {
      logger.warn('No products found', 'available-params', { style, model });
      throw new NotFoundError('No products found');
    }

    // Извлекаем уникальные значения для каждого параметра
    const availableParams = {
      finishes: new Set<string>(),
      colors: new Set<string>(),
      widths: new Set<number>(),
      heights: new Set<number>(),
      hardwareKits: new Set<string>()
    };

    filteredProducts.forEach((product: { properties_data: unknown }) => {
      const props = product.properties_data ? 
        (typeof product.properties_data === 'string' ? JSON.parse(product.properties_data) : product.properties_data) : {};
      
      if (props?.['Тип покрытия']) {
        availableParams.finishes.add(props['Тип покрытия']);
      }
      if (props?.['Цвет/Отделка']) {
        availableParams.colors.add(props['Цвет/Отделка']);
      }
      if (props?.['Ширина/мм']) {
        availableParams.widths.add(Number(props['Ширина/мм']));
      }
      if (props?.['Высота/мм']) {
        availableParams.heights.add(Number(props['Высота/мм']));
      }
    });

    // Получаем доступные комплекты фурнитуры
    const hardwareKits = await prisma.product.findMany({
      where: {
        is_active: true,
        catalog_category: {
          name: 'Комплекты фурнитуры'
        }
      },
      select: {
        id: true,
        name: true,
        properties_data: true
      }
    });

    logger.debug('Hardware kits found', 'available-params', { count: hardwareKits.length });

    const hardwareKitOptions: Array<{id: string, name: string}> = [];
    hardwareKits.forEach((kit: { id: string; name: string; properties_data: unknown }) => {
      const props = kit.properties_data ? 
        (typeof kit.properties_data === 'string' ? JSON.parse(kit.properties_data) : kit.properties_data) : {};
      
      // Попробуем разные поля для названия группы
      const groupName = props?.['Группа'] || props?.['Ценовая группа'] || props?.['Наименование для Web'] || kit.name;
      
      if (groupName) {
        hardwareKitOptions.push({
          id: kit.id,
          name: groupName
        });
      }
    });

    // Получаем доступные ручки
    const handles = await prisma.product.findMany({
      where: {
        is_active: true,
        catalog_category: {
          name: 'Ручки'
        }
      },
      select: {
        id: true,
        name: true,
        properties_data: true
      }
    });

    const handleOptions: Array<{id: string, name: string, group: string}> = [];
    handles.forEach((handle: { id: string; name: string; properties_data: unknown }) => {
      const props = handle.properties_data ? 
        (typeof handle.properties_data === 'string' ? JSON.parse(handle.properties_data) : handle.properties_data) : {};
      if (props?.['Domeo_наименование ручки_1С'] || props?.['Domeo_наименование для Web']) {
        handleOptions.push({
          id: handle.id,
          name: props['Domeo_наименование ручки_1С'] || props['Domeo_наименование для Web'] || handle.name,
          group: props['Группа'] || 'Без группы'
        });
      }
    });

    logger.info('Available params retrieved', 'available-params', {
      finishes: Array.from(availableParams.finishes).length,
      colors: Array.from(availableParams.colors).length,
      widths: Array.from(availableParams.widths).length,
      heights: Array.from(availableParams.heights).length,
      hardwareKits: hardwareKitOptions.length,
      handles: handleOptions.length
    });

    return NextResponse.json({
      success: true,
      params: {
        finishes: Array.from(availableParams.finishes).sort(),
        colors: Array.from(availableParams.colors).sort(),
        widths: Array.from(availableParams.widths).sort((a, b) => a - b),
        heights: Array.from(availableParams.heights).sort((a, b) => a - b),
        hardwareKits: hardwareKitOptions,
        handles: handleOptions
      }
    }, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    });

  } catch (error) {
    logger.error('Error fetching available parameters', 'available-params', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Failed to fetch available parameters', 500);
  }
}

export const POST = withErrorHandling(
  requireAuth(postHandler),
  'available-params/POST'
);
