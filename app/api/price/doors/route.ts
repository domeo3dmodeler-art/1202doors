import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ApiException, NotFoundError } from '@/lib/api/errors';
import { getDoorsCategoryId } from '@/lib/catalog-categories';

function parseProductProperties(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return value as Record<string, unknown>;
}

function getProductRrc(product: { base_price?: number | null; properties_data?: unknown }): number {
  const props = parseProductProperties(product.properties_data);
  const rrc = Number(props['Цена РРЦ']);
  if (Number.isFinite(rrc) && rrc > 0) return rrc;
  return Number(product.base_price || 0);
}

function pickMaxPriceProduct<T extends { base_price?: number | null; properties_data?: unknown }>(products: T[]): T {
  return products.reduce((maxProduct, currentProduct) => {
    return getProductRrc(currentProduct) > getProductRrc(maxProduct) ? currentProduct : maxProduct;
  }, products[0]);
}

// Высоты-диапазоны: базовая цена за 2000 мм, надбавка в % из листа «Опции»
const HEIGHT_BAND_2301_2500 = 2350;
const HEIGHT_BAND_2501_3000 = 2750;

function heightForMatching(selectionHeight: number | undefined): number | undefined {
  if (selectionHeight == null) return undefined;
  if (selectionHeight === HEIGHT_BAND_2301_2500 || selectionHeight === HEIGHT_BAND_2501_3000) return 2000;
  return selectionHeight;
}

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
    // Проверяем подключение к БД
    await prisma.$connect();

    // Ищем продукт в базе данных по всем параметрам
    const products = await prisma.product.findMany({
      where: {
        catalog_category: {
          name: "Межкомнатные двери"
        }
      },
      select: {
        id: true,
        sku: true,
        name: true,
        model: true,
        series: true,
        base_price: true,
        properties_data: true
      },
      orderBy: {
        id: 'asc'
      }
    });

  // Фильтр по параметрам (опционально ослабляем совпадение по стилю и типу покрытия)
  const filterProducts = (requireStyle: boolean, requireFinish: boolean) =>
    products.filter(p => {
      const properties = p.properties_data ?
        (typeof p.properties_data === 'string' ? JSON.parse(p.properties_data) : p.properties_data) : {};

      const styleMatch = !requireStyle || !selection.style || properties['Domeo_Стиль Web'] === selection.style ||
        (typeof selection.style === 'string' && properties['Domeo_Стиль Web']?.startsWith(selection.style.slice(0, 8)));

      const modelName = properties['Domeo_Название модели для Web'];
      const modelCode = properties['Код модели Domeo (Web)'] ?? properties['Артикул поставщика'];
      const modelMatch = !selection.model ||
        modelName === selection.model ||
        modelCode === selection.model ||
        (typeof selection.model === 'string' && (modelName?.includes(selection.model) || modelCode?.includes(selection.model)));

      if (!styleMatch || !modelMatch) return false;

      const finishMatch = !requireFinish || !selection.finish || properties['Тип покрытия'] === selection.finish;
      const colorMatch = !selection.color || properties['Domeo_Цвет'] === selection.color || properties['Domeo_Цвет'] == null;
      const typeMatch = !selection.type || properties['Тип конструкции'] === selection.type;
      const widthMatch = !selection.width || properties['Ширина/мм'] == selection.width;
      const heightToMatch = heightForMatching(selection.height);
      const heightMatch = !heightToMatch || properties['Высота/мм'] == heightToMatch;

      return finishMatch && colorMatch && typeMatch && widthMatch && heightMatch;
    });

  let matchingProducts = filterProducts(true, true);
  if (matchingProducts.length === 0) matchingProducts = filterProducts(true, false);
  if (matchingProducts.length === 0) matchingProducts = filterProducts(false, false);

  logger.debug(`Найдено ${matchingProducts.length} подходящих товаров`, 'price/doors', {
    count: matchingProducts.length
  }, loggingContext);

  if (matchingProducts.length === 0) {
    logger.warn('Товар не найден для параметров', 'price/doors', {
      style: selection.style,
      model: selection.model,
      finish: selection.finish,
      width: selection.width,
      height: selection.height
    }, loggingContext);
    throw new NotFoundError('Товар с указанными параметрами', JSON.stringify(selection));
  }

  // Бизнес-правило: при нескольких совпадениях берем максимальную РРЦ.
  const product = pickMaxPriceProduct(matchingProducts);
  
  const finalProduct = product;

  // Парсим свойства продукта
  const properties = finalProduct.properties_data ? 
    (typeof finalProduct.properties_data === 'string' ? JSON.parse(finalProduct.properties_data) : finalProduct.properties_data) : {};

  // Рассчитываем цену из цены РРЦ товара
  const rrcPrice = Number(properties['Цена РРЦ']) || 0;
  const basePrice = finalProduct.base_price || 0;
  let doorPrice = rrcPrice || basePrice;
  
  logger.debug('Расчет цены', 'price/doors', {
    productId: finalProduct.id,
    rrcPrice,
    basePrice,
    finalDoorPrice: doorPrice,
    rrcPriceExists: !!properties['Цена РРЦ']
  }, loggingContext);
  
  let total = doorPrice;
  const breakdown: Array<{ label: string; amount: number }> = [
    { label: "Дверь", amount: doorPrice }
  ];

  // Надбавка за высоту 2301–2500 мм или 2501–3000 мм (% к цене за 2000 мм)
  const selHeight = selection.height;
  if (selHeight === HEIGHT_BAND_2301_2500) {
    const pct = Number(properties['Domeo_Опции_Надбавка_2301_2500_процент']) || 0;
    if (pct > 0) {
      const surcharge = Math.round((doorPrice * pct) / 100);
      total += surcharge;
      breakdown.push({ label: 'Надбавка за высоту 2301–2500 мм', amount: surcharge });
    }
  } else if (selHeight === HEIGHT_BAND_2501_3000) {
    const pct = Number(properties['Domeo_Опции_Надбавка_2501_3000_процент']) || 0;
    if (pct > 0) {
      const surcharge = Math.round((doorPrice * pct) / 100);
      total += surcharge;
      breakdown.push({ label: 'Надбавка за высоту 2501–3000 мм', amount: surcharge });
    }
  }

  // Реверс: надбавка из опций модели (не отдельная строка в корзине)
  if (selection.reversible) {
    const reversSurcharge = Number(properties['Domeo_Опции_Надбавка_реверс_руб']) || 0;
    if (reversSurcharge > 0) {
      total += reversSurcharge;
      breakdown.push({ label: 'Реверс', amount: reversSurcharge });
    }
  }

  // Зеркало: опция, влияет на цену, не отдельная строка в корзине
  const mirror = selection.mirror as string | undefined;
  if (mirror === 'one' || mirror === 'mirror_one') {
    const mirrorOne = Number(properties['Domeo_Опции_Зеркало_одна_сторона_руб']) || 0;
    if (mirrorOne > 0) {
      total += mirrorOne;
      breakdown.push({ label: 'Зеркало (одна сторона)', amount: mirrorOne });
    }
  } else if (mirror === 'both' || mirror === 'mirror_both') {
    const mirrorBoth = Number(properties['Domeo_Опции_Зеркало_две_стороны_руб']) || 0;
    if (mirrorBoth > 0) {
      total += mirrorBoth;
      breakdown.push({ label: 'Зеркало (две стороны)', amount: mirrorBoth });
    }
  }

  // Порог: опция, влияет на цену, не отдельная строка в корзине
  if (selection.threshold) {
    const thresholdPrice = Number(properties['Domeo_Опции_Цена_порога_руб']) || 0;
    if (thresholdPrice > 0) {
      total += thresholdPrice;
      breakdown.push({ label: 'Порог', amount: thresholdPrice });
    }
  }

  // Кромка: цвет кромки (базовая = 0, Цвет 2/3/4 = наценка из листа «Наценка за кромку»)
  const edgeId = typeof selection.edge_id === 'string' ? selection.edge_id.trim() : '';
  if (edgeId && edgeId !== 'none') {
    const baseColor = (properties['Domeo_Кромка_базовая_цвет'] != null ? String(properties['Domeo_Кромка_базовая_цвет']).trim() : '');
    let edgeSurcharge = 0;
    if (baseColor && edgeId === baseColor) {
      edgeSurcharge = 0;
    } else {
      for (const i of [2, 3, 4] as const) {
        const colorVal = properties[`Domeo_Кромка_Цвет_${i}`] != null ? String(properties[`Domeo_Кромка_Цвет_${i}`]).trim() : '';
        if (colorVal && edgeId === colorVal) {
          edgeSurcharge = Number(properties[`Domeo_Кромка_Наценка_Цвет_${i}`]) || 0;
          break;
        }
      }
    }
    if (edgeSurcharge > 0) {
      total += edgeSurcharge;
      breakdown.push({ label: `Кромка: ${edgeId}`, amount: edgeSurcharge });
    }
  }

  // Добавляем комплект фурнитуры если выбран
  if (selection.hardware_kit?.id) {
    logger.debug('Выбран комплект фурнитуры', 'price/doors', {
      kitId: selection.hardware_kit.id
    }, loggingContext);
    
    // Получаем комплекты фурнитуры из базы данных
    const hardwareKits = await prisma.product.findMany({
      where: {
        catalog_category: {
          name: "Комплекты фурнитуры"
        }
      },
      select: {
        id: true,
        name: true,
        base_price: true,
        properties_data: true
      }
    });

    logger.debug('Доступные комплекты фурнитуры', 'price/doors', {
      count: hardwareKits.length
    }, loggingContext);
    
    const kit = hardwareKits.find(k => k.id === selection.hardware_kit.id);
    
    if (kit) {
      const kitProps = kit.properties_data ? 
        (typeof kit.properties_data === 'string' ? JSON.parse(kit.properties_data) : kit.properties_data) : {};
      const kitPrice = parseFloat(kitProps['Группа_цена']) || Number(kit.base_price) || 0;
      logger.debug('Цена комплекта', 'price/doors', { kitPrice }, loggingContext);
      total += kitPrice;
      breakdown.push({ 
        label: `Комплект: ${kitProps['Наименование для Web'] || kit.name || 'Фурнитура'}`,
        amount: kitPrice 
      });
    }
  }

  // Добавляем ручку если выбрана
  if (selection.handle?.id) {
    logger.debug('Выбрана ручка', 'price/doors', {
      handleId: selection.handle.id
    }, loggingContext);
    
    // Получаем ручки из базы данных (категория "Ручки и завертки")
    const handles = await prisma.product.findMany({
      where: {
        catalog_category: {
          name: { in: ["Ручки", "Ручки и завертки"] }
        }
      },
      select: {
        id: true,
        name: true,
        base_price: true,
        properties_data: true
      }
    });

    logger.debug('Доступные ручки', 'price/doors', {
      count: handles.length
    }, loggingContext);
    
    const handle = handles.find(h => h.id === selection.handle.id);
    
    if (handle) {
      const handleProps = handle.properties_data ? 
        (typeof handle.properties_data === 'string' ? JSON.parse(handle.properties_data) : handle.properties_data) : {};
      const handlePrice = parseFloat(handleProps['Domeo_цена группы Web']) || Number(handle.base_price) || 0;
      logger.debug('Цена ручки', 'price/doors', { handlePrice }, loggingContext);
      total += handlePrice;
      breakdown.push({ 
        label: `Ручка: ${handleProps['Domeo_наименование ручки_1С'] || handle.name || 'Ручка'}`,
        amount: handlePrice 
      });
    }
  }

  // Ограничитель
  if (selection.limiter_id) {
    const limiter = await prisma.product.findFirst({
      where: { id: selection.limiter_id },
      select: { id: true, name: true, base_price: true, properties_data: true },
    });
    if (limiter) {
      const props = limiter.properties_data ? (typeof limiter.properties_data === 'string' ? JSON.parse(limiter.properties_data) : limiter.properties_data) : {};
      const limiterPrice = parseFloat((props as Record<string, string>)['Цена РРЦ']) || Number(limiter.base_price) || 0;
      total += limiterPrice;
      breakdown.push({ label: `Ограничитель: ${limiter.name}`, amount: limiterPrice });
    }
  }

  // Доп. опции по id (наличники — отдельные товары, отображаются в корзине; зеркало/порог уже учтены выше)
  if (selection.option_ids && selection.option_ids.length > 0) {
    const optionProducts = await prisma.product.findMany({
      where: { id: { in: selection.option_ids } },
      select: { id: true, name: true, base_price: true, properties_data: true },
    });
    for (const opt of optionProducts) {
      const props = opt.properties_data ? (typeof opt.properties_data === 'string' ? JSON.parse(opt.properties_data) : opt.properties_data) : {};
      const price = parseFloat((props as Record<string, string>)['Цена РРЦ']) || Number(opt.base_price) || 0;
      total += price;
      breakdown.push({ label: opt.name, amount: price });
    }
  }

    const result = {
      currency: "RUB",
      base: doorPrice,
      breakdown,
      total: Math.round(total),
      sku: finalProduct.sku,
      selection_policy: 'max_price'
    };
    
    return apiSuccess(result);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;
    
    logger.error('Error calculating price', 'price/doors/POST', { 
      error: errorMessage,
      code: errorCode,
      stack: error instanceof Error ? error.stack : undefined
    }, loggingContext);
    
    // Сохраняем корректный HTTP-код для ApiException (например 404 для NotFoundError)
    if (error instanceof ApiException) {
      return apiError(error.code, error.message, error.statusCode, error.details);
    }
    
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
