import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ApiException, NotFoundError } from '@/lib/api/errors';
import { getDoorsCategoryId } from '@/lib/catalog-categories';
import { pickMaxPriceProduct, calculateDoorPrice, type ProductWithProps } from '@/lib/price/doors-price-engine';

// GET /api/price/doors - Получить базовую информацию о ценах
async function getHandler(
  req: NextRequest
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { searchParams } = new URL(req.url);
  const model = searchParams.get('model');
  
  if (!model) {
    return apiSuccess({
      message: "API для расчета цен дверей",
      usage: "Используйте POST запрос с данными selection для расчета цены",
      example: {
        method: "POST",
        body: {
          selection: {
            model: "Классика",
            hardware_kit: { id: "KIT_STD" },
            handle: { id: "HNDL_PRO" }
          }
        }
      }
    });
  }

  // Если передан model, возвращаем базовую информацию.
  // Сначала поиск по полю product.model; у дверей модель часто в properties_data — тогда ищем по категории «Межкомнатные двери».
  let product = await prisma.product.findFirst({
    where: { model },
    select: {
      id: true,
      sku: true,
      name: true,
      model: true,
      series: true,
      base_price: true
    }
  });

  if (!product) {
    const doorsCategoryId = await getDoorsCategoryId();
    if (doorsCategoryId) {
      const doorsProducts = await prisma.product.findMany({
        where: { catalog_category_id: doorsCategoryId, is_active: true },
        select: {
          id: true,
          sku: true,
          name: true,
          model: true,
          series: true,
          base_price: true,
          properties_data: true
        },
        take: 5000
      });
      const matched = doorsProducts.filter((p) => {
        const props = p.properties_data
          ? (typeof p.properties_data === 'string' ? JSON.parse(p.properties_data) : p.properties_data)
          : {};
        const code = props['Код модели Domeo (Web)'] ?? props['Артикул поставщика'];
        const name = props['Domeo_Название модели для Web'];
        return (
          (typeof code === 'string' && code.trim() === model.trim()) ||
          (typeof name === 'string' && name.trim() === model.trim())
        );
      });
      if (matched.length > 0) {
        const match = pickMaxPriceProduct(matched);
        product = {
          id: match.id,
          sku: match.sku,
          name: match.name,
          model: match.model,
          series: match.series,
          base_price: match.base_price
        };
      }
    }
  }

  if (!product) {
    throw new NotFoundError('Продукт', model);
  }

  return apiSuccess({
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      model: product.model,
      series: product.series,
      base_price: product.base_price
    },
    selection_policy: 'max_price',
    message: "Для полного расчета цены используйте POST запрос"
  });
}

// Публичный API - расчет цен доступен всем
export const GET = withErrorHandling(
  getHandler,
  'price/doors/GET'
);

// POST /api/price/doors - Расчет цены дверей
async function postHandler(
  req: NextRequest
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  let body: unknown;
  try {
    body = await req.json();
  } catch (jsonError) {
    logger.error('Ошибка парсинга JSON в price/doors', 'price/doors', jsonError instanceof Error ? { error: jsonError.message, stack: jsonError.stack } : { error: String(jsonError) }, loggingContext);
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Некорректный формат JSON в теле запроса',
      400
    );
  }
  
  logger.debug('Расчет цены дверей', 'price/doors', {
    bodyType: typeof body,
    hasSelection: !!body?.selection
  }, loggingContext);
  
  // Данные могут приходить напрямую в body или в поле selection
  const selection = body?.selection || body;
  
  logger.debug('Извлеченные данные selection', 'price/doors', {
    style: selection?.style,
    model: selection?.model,
    finish: selection?.finish,
    color: selection?.color,
    width: selection?.width,
    height: selection?.height,
    filling: selection?.filling,
    hardware_kit: selection?.hardware_kit,
    handle: selection?.handle
  }, loggingContext);

  if (!selection) {
    logger.error('Selection is undefined or null', 'price/doors', {}, loggingContext);
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Данные для расчета не предоставлены',
      400
    );
  }

  try {
    await prisma.$connect();

    const products = (await prisma.product.findMany({
      where: { catalog_category: { name: 'Межкомнатные двери' } },
      select: {
        id: true,
        sku: true,
        name: true,
        model: true,
        series: true,
        base_price: true,
        properties_data: true
      },
      orderBy: { id: 'asc' }
    })) as ProductWithProps[];

    let hardwareKits: ProductWithProps[] = [];
    if (selection.hardware_kit?.id) {
      hardwareKits = (await prisma.product.findMany({
        where: { catalog_category: { name: 'Комплекты фурнитуры' } },
        select: { id: true, name: true, base_price: true, properties_data: true }
      })) as ProductWithProps[];
    }

    let handles: ProductWithProps[] = [];
    if (selection.handle?.id) {
      handles = (await prisma.product.findMany({
        where: { catalog_category: { name: { in: ['Ручки', 'Ручки и завертки'] } } },
        select: { id: true, name: true, base_price: true, properties_data: true }
      })) as ProductWithProps[];
    }

    let limiterProduct: ProductWithProps | null = null;
    if (selection.limiter_id) {
      const row = await prisma.product.findFirst({
        where: { id: selection.limiter_id },
        select: { id: true, name: true, base_price: true, properties_data: true }
      });
      limiterProduct = row as ProductWithProps | null;
    }

    let optionProducts: ProductWithProps[] = [];
    if (selection.option_ids?.length) {
      optionProducts = (await prisma.product.findMany({
        where: { id: { in: selection.option_ids } },
        select: { id: true, name: true, base_price: true, properties_data: true }
      })) as ProductWithProps[];
    }

    const result = calculateDoorPrice({
      products,
      selection,
      hardwareKits,
      handles,
      getLimiter: (id) => (limiterProduct?.id === id ? limiterProduct : null),
      getOptionProducts: (ids) => optionProducts.filter((o) => ids.includes(o.id))
    });

    logger.debug('Расчет цены', 'price/doors', {
      base: result.base,
      total: result.total,
      breakdownLength: result.breakdown.length
    }, loggingContext);

    return apiSuccess({
      ...result,
      selection_policy: 'max_price'
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;

    if (error instanceof ApiException) {
      return apiError(error.code, error.message, error.statusCode, error.details);
    }
    if (error instanceof Error && error.message.includes('Товар с указанными параметрами не найден')) {
      logger.warn('Товар не найден для параметров', 'price/doors', { selection }, loggingContext);
      throw new NotFoundError('Товар с указанными параметрами', JSON.stringify(selection));
    }

    logger.error('Error calculating price', 'price/doors/POST', {
      error: errorMessage,
      code: errorCode,
      stack: error instanceof Error ? error.stack : undefined
    }, loggingContext);
    
    // В development возвращаем детали для прочих ошибок
    if (process.env.NODE_ENV === 'development') {
      return apiError(
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        'Ошибка при расчете цены',
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

// Публичный API - расчет цен доступен всем
export const POST = withErrorHandling(
  postHandler,
  'price/doors/POST'
);
