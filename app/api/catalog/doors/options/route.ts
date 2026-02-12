import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';
import { getDoorsCategoryId } from '@/lib/catalog-categories';

// Кэш для опций дверей
const optionsCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 минут

async function getHandler(
  req: NextRequest,
  user: ReturnType<typeof getAuthenticatedUser>
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

  logger.debug('API options - загрузка данных', 'catalog/doors/options/GET', {
    style,
    model,
    finish,
    color,
    type,
    width,
    height
  }, loggingContext);

  try {
    // Проверяем подключение к БД
    await prisma.$connect();

    const doorsCategoryId = await getDoorsCategoryId();
    if (!doorsCategoryId) {
      return apiSuccess({
        domain: {
          style: [],
          model: [],
          finish: [],
          color: [],
          type: [],
          width: [],
          height: [],
          kits: [],
          handles: []
        },
        cached: false
      });
    }

    // Получаем только нужные поля для оптимизации
    const products = await prisma.product.findMany({
      where: {
        catalog_category_id: doorsCategoryId
      },
      select: {
        properties_data: true
      }
    });

  // Извлекаем уникальные значения из properties_data
  const distinctStyles = new Set<string>();
  const distinctModels = new Set<string>();
  const distinctFinishes = new Set<string>();
  const distinctColors = new Set<string>();
  const distinctTypes = new Set<string>();
  const distinctWidths = new Set<number>();
  const distinctHeights = new Set<number>();

  products.forEach(product => {
    try {
      const properties = product.properties_data ?
        (typeof product.properties_data === 'string' ? JSON.parse(product.properties_data) : product.properties_data) : {};

      // Нормализуем параметры фильтрации
      const normalizedStyle = style ? style.trim() : null;
      const productStyle = properties['Domeo_Стиль Web'] ? String(properties['Domeo_Стиль Web']).trim() : null;
      
      // Фильтруем по стилю и модели если они указаны
      if (normalizedStyle && productStyle !== normalizedStyle) return;
      if (model && !properties['Domeo_Название модели для Web']?.includes(model)) return;

      // Извлекаем данные из properties_data согласно реальной структуре
      if (productStyle) distinctStyles.add(productStyle);
    if (properties['Domeo_Название модели для Web']) distinctModels.add(properties['Domeo_Название модели для Web']);
    if (properties['Тип покрытия']) distinctFinishes.add(properties['Тип покрытия']);
    if (properties['Domeo_Цвет']) distinctColors.add(properties['Domeo_Цвет']);
    if (properties['Тип конструкции']) distinctTypes.add(properties['Тип конструкции']);
    if (properties['Ширина/мм']) distinctWidths.add(Number(properties['Ширина/мм']));
    if (properties['Высота/мм']) distinctHeights.add(Number(properties['Высота/мм']));
    } catch (error) {
      logger.warn('Ошибка парсинга properties_data в options', 'catalog/doors/options/GET', {
        error: error instanceof Error ? error.message : String(error)
      }, loggingContext);
    }
  });

  // Статические данные для комплектов и ручек
  const kits = [
    { id: "KIT_STD", name: "Базовый комплект", group: 1, price_rrc: 5000 },
    { id: "KIT_SOFT", name: "SoftClose", group: 2, price_rrc: 2400 },
  ];

  const handles = [
    {
      id: "HNDL_PRO",
      name: "Pro",
      supplier_name: "HandleCo",
      supplier_sku: "H-PRO",
      price_opt: 900,
      price_rrc: 1200,
      price_group_multiplier: 1.15,
    },
    {
      id: "HNDL_SIL",
      name: "Silver",
      supplier_name: "HandleCo",
      supplier_sku: "H-SIL",
      price_opt: 1100,
      price_rrc: 1400,
      price_group_multiplier: 1.15,
    },
  ];

  const responseData = {
    domain: {
      style: Array.from(distinctStyles).sort(),
      model: Array.from(distinctModels).sort(),
      finish: Array.from(distinctFinishes).sort(),
      color: Array.from(distinctColors).sort(),
      type: Array.from(distinctTypes).sort(),
      width: Array.from(distinctWidths).sort((a, b) => a - b),
      height: Array.from(distinctHeights).sort((a, b) => a - b),
      kits,
      handles
    },
    cached: false
  };

    logger.debug('API options - данные загружены', 'catalog/doors/options/GET', {
      stylesCount: distinctStyles.size,
      modelsCount: distinctModels.size,
      finishesCount: distinctFinishes.size,
      colorsCount: distinctColors.size,
      typesCount: distinctTypes.size,
      widthsCount: distinctWidths.size,
      heightsCount: distinctHeights.size
    }, loggingContext);

    return apiSuccess(responseData);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;
    
    logger.error('Error fetching options', 'catalog/doors/options/GET', { 
      error: errorMessage,
      code: errorCode,
      stack: error instanceof Error ? error.stack : undefined
    }, loggingContext);
    
    // В development возвращаем детали ошибки
    if (process.env.NODE_ENV === 'development') {
      return apiError(
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        'Ошибка при получении опций',
        500,
        {
          message: errorMessage,
          code: errorCode,
          stack: error instanceof Error ? error.stack : undefined,
          prismaMeta: error && typeof error === 'object' && 'meta' in error ? error.meta : undefined,
        }
      );
    }
    
    throw error;
  }
}

export const GET = withErrorHandling(
  requireAuth(getHandler),
  'catalog/doors/options/GET'
);