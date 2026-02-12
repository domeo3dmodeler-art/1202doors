import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { getPropertyPhotos, structurePropertyPhotos, getPropertyPhotosByValuePrefix, DOOR_COLOR_PROPERTY } from '../../../../../lib/property-photos';
import { getDoorsCategoryId } from '../../../../../lib/catalog-categories';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';

// Кэширование
const completeDataCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 минут

// DELETE - очистка кэша
async function deleteHandler(
  req: NextRequest,
  user: ReturnType<typeof getAuthenticatedUser>
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  completeDataCache.clear();
  logger.info('Кэш complete-data очищен', 'catalog/doors/complete-data/DELETE', {}, loggingContext);
  return apiSuccess({ success: true, message: 'Кэш очищен' });
}

export const DELETE = withErrorHandling(
  requireAuth(deleteHandler),
  'catalog/doors/complete-data/DELETE'
);

async function getHandler(
  req: NextRequest
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { searchParams } = new URL(req.url);
  const style = searchParams.get('style');

  const cacheKey = style || 'all';
  
  // Проверяем кэш
  const cached = completeDataCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug('API complete-data - используем кэш', 'catalog/doors/complete-data/GET', { cacheKey }, loggingContext);
    const res = apiSuccess({
      ok: true,
      ...cached.data,
      cached: true
    });
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res;
  }

  logger.info('API complete-data - загрузка данных для стиля', 'catalog/doors/complete-data/GET', { style: style || 'все' }, loggingContext);

  try {
    // Проверяем подключение к БД
    await prisma.$connect();

    const DOORS_CATEGORY_ID = await getDoorsCategoryId();
    if (!DOORS_CATEGORY_ID) {
      logger.warn('Категория "Межкомнатные двери" не найдена', 'catalog/doors/complete-data/GET', {}, loggingContext);
      return apiSuccess({
        ok: true,
        models: [],
        totalModels: 0,
        styles: [],
        timestamp: Date.now()
      });
    }

    const products = await prisma.product.findMany({
      where: {
        catalog_category_id: DOORS_CATEGORY_ID,
        is_active: true
      },
      select: {
        id: true,
        sku: true,
        properties_data: true
      }
    });

  logger.debug(`Загружено ${products.length} товаров из БД`, 'catalog/doors/complete-data/GET', { productsCount: products.length }, loggingContext);

  // Обработка данных
  const models: any[] = [];
  const styles = new Set<string>();

  // Сначала собираем все товары по моделям
  const modelMap = new Map<string, any>();

  products.forEach(product => {
    try {
      const properties = product.properties_data ?
        (typeof product.properties_data === 'string' ? JSON.parse(product.properties_data) : product.properties_data) : {};

      // Группировка только по "Код модели Domeo (Web)". Артикул поставщика в этой версии не используется.
      const domeoCode = String(properties['Код модели Domeo (Web)'] ?? '').trim();
      const modelName = properties['Domeo_Название модели для Web'];
      const productStyle = properties['Domeo_Стиль Web'] || 'Классика';

      const modelKey = domeoCode;
      const displayName = modelKey;
      const styleString = typeof productStyle === 'string' ? productStyle : String(productStyle || 'Классика');
      const factoryName = typeof modelName === 'string' ? modelName.trim() : '';

      if (!modelKey) return;
      if (style && styleString !== style) return;

      styles.add(styleString);

      if (!modelMap.has(modelKey)) {
        modelMap.set(modelKey, {
          model: displayName,
          modelKey: modelKey,
          style: styleString,
          products: [],
          factoryModelNames: new Set<string>()
        });
      }

      const modelData = modelMap.get(modelKey);
      modelData.products.push({
        id: product.id,
        sku: product.sku,
        properties: properties
      });
      if (factoryName) modelData.factoryModelNames.add(factoryName);
    } catch (error) {
      logger.warn(`Ошибка обработки товара`, 'catalog/doors/complete-data/GET', { sku: product.sku, error }, loggingContext);
    }
  });

  // Теперь структурируем фото для каждой модели: обложка — первая доступная среди всех фабричных вариантов (лист "Цвет")
  const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i;
  const isLocalUploadPath = (path: string | null): boolean => {
    return typeof path === 'string' && path.startsWith('/uploads/');
  };
  const pickPreferredPhoto = (current: string | null, next: string | null): string | null => {
    if (!next) return current;
    if (!current) return next;
    const currentIsLocal = isLocalUploadPath(current);
    const nextIsLocal = isLocalUploadPath(next);
    if (nextIsLocal && !currentIsLocal) return next;
    return current;
  };
  const normalizePhotoPath = (raw: string | null): string | null => {
    if (!raw) return null;
    const path = String(raw).trim();
    if (!path) return null;
    // Technical notes/placeholders should not be treated as image paths.
    if (path.includes('не рассматриваем') || path.includes('пока не добавляем')) return null;
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return IMAGE_EXT.test(path) ? path : null;
    }
    if (path.startsWith('/uploads/')) return IMAGE_EXT.test(path) ? path : null;
    if (path.startsWith('products/')) {
      const normalized = `/uploads/${path}`;
      return IMAGE_EXT.test(normalized) ? normalized : null;
    }
    if (path.startsWith('uploads/')) {
      const normalized = `/uploads/${path.substring(7)}`;
      return IMAGE_EXT.test(normalized) ? normalized : null;
    }
    const normalized = `/uploads/${path}`;
    return IMAGE_EXT.test(normalized) ? normalized : null;
  };

  const modelPromises = Array.from(modelMap.entries()).map(async ([modelKey, modelData]) => {
    logger.debug(`Получаем фото для модели`, 'catalog/doors/complete-data/GET', { model: modelData.model, modelKey }, loggingContext);

    let modelPhotos: any[] = [];
    const factoryNames = Array.from(modelData.factoryModelNames || []);

    // Обложка модели: привязка по Код модели Domeo (Web). В БД обложки хранятся в PropertyPhoto с propertyName="Артикул поставщика", propertyValue=код (lowercase).
    if (modelKey && typeof modelKey === 'string' && modelKey.trim() !== '') {
      const normalized = modelKey.toLowerCase();
      let byCode = await getPropertyPhotos(DOORS_CATEGORY_ID, 'Артикул поставщика', normalized);
      for (let i = 1; i <= 10; i++) {
        const variantPhotos = await getPropertyPhotos(DOORS_CATEGORY_ID, 'Артикул поставщика', `${normalized}_${i}`);
        if (variantPhotos.length > 0) byCode = byCode.concat(variantPhotos);
      }
      modelPhotos = byCode;
    }
    if (modelPhotos.length === 0 && factoryNames.length > 0) {
      const firstFactory = factoryNames[0];
      modelPhotos = await getPropertyPhotos(DOORS_CATEGORY_ID, 'Domeo_Название модели для Web', firstFactory);
    }

    // Prefer local photos when both local and external variants exist.
    modelPhotos.sort((a, b) => {
      const aPath = normalizePhotoPath(a.photoPath);
      const bPath = normalizePhotoPath(b.photoPath);
      const aLocal = isLocalUploadPath(aPath) ? 1 : 0;
      const bLocal = isLocalUploadPath(bPath) ? 1 : 0;
      return bLocal - aLocal;
    });

    const photoStructure = structurePropertyPhotos(modelPhotos);

    // Объединяем цвета/фото по всем фабричным названиям этой модели Domeo (одна модель = несколько фабрик → одна обложка: первая найденная)
    const coatingsMap = new Map<string, { id: string; coating_type: string; color_name: string; photo_path: string | null }>();
    let firstColorCover: string | null = null;
    const addColorPhotos = (colorPhotos: { propertyValue: string; photoType: string; photoPath: string }[]) => {
      for (const p of colorPhotos) {
        const parts = p.propertyValue.split('|');
        const coatingType = parts[1] || '';
        const colorName = parts[2] || '';
        const key = `${coatingType}_${colorName}`;
        const rawPath = p.photoType === 'cover' ? p.photoPath : null;
        const photo_path = rawPath ? normalizePhotoPath(rawPath) : null;
        if (!coatingsMap.has(key)) {
          coatingsMap.set(key, {
            id: key,
            coating_type: coatingType,
            color_name: colorName,
            photo_path
          });
          if (p.photoType === 'cover') {
            firstColorCover = pickPreferredPhoto(firstColorCover, photo_path);
          }
        } else if (p.photoType === 'cover') {
          const currentPath = coatingsMap.get(key)!.photo_path;
          coatingsMap.get(key)!.photo_path = pickPreferredPhoto(currentPath, photo_path);
          firstColorCover = pickPreferredPhoto(firstColorCover, photo_path);
        }
      }
    };
    for (const factoryName of factoryNames) {
      const name = (factoryName || '').trim();
      if (!name) continue;
      const colorPhotos = await getPropertyPhotosByValuePrefix(DOORS_CATEGORY_ID, DOOR_COLOR_PROPERTY, name + '|');
      addColorPhotos(colorPhotos);
    }
    // Fallback: фото цветов могут быть привязаны по коду модели (DomeoDoors_Base_1), а не по фабричному названию
    if (coatingsMap.size === 0 && modelKey && typeof modelKey === 'string' && modelKey.trim() !== '') {
      const prefix = modelKey.trim() + '|';
      const colorPhotosByKey = await getPropertyPhotosByValuePrefix(DOORS_CATEGORY_ID, DOOR_COLOR_PROPERTY, prefix);
      addColorPhotos(colorPhotosByKey);
    }
    const coatings = Array.from(coatingsMap.values());
    // Типы покрытия модели (у каждой модели свой набор)
    const finishes = [...new Set(coatings.map((c) => c.coating_type))].filter(Boolean).sort();
    // Цвета по типам покрытия: у каждого типа покрытия — свой набор цветов (лист "Цвет")
    const colorsByFinish: Record<string, Array<{ id: string; color_name: string; photo_path: string | null }>> = {};
    coatings.forEach((c) => {
      const t = c.coating_type || '';
      if (!t) return;
      if (!colorsByFinish[t]) colorsByFinish[t] = [];
      colorsByFinish[t].push({
        id: c.id,
        color_name: c.color_name,
        photo_path: c.photo_path,
      });
    });
    // Для обратной совместимости: все уникальные цвета по модели (без привязки к типу)
    const colors = [...new Set(coatings.map((c) => c.color_name))].filter(Boolean).sort();

    // Обложка: при наличии цветов у модели предпочитаем первое фото из цветов (надёжнее, чем привязка по индексу в скрипте). Иначе — PropertyPhoto по коду, затем ProductImage.
    const preferredStructuredCover = normalizePhotoPath(photoStructure.cover);
    const preferredColorCover = normalizePhotoPath(firstColorCover);
    let coverToUse = coatings.length > 0
      ? pickPreferredPhoto(preferredStructuredCover, preferredColorCover)
      : pickPreferredPhoto(preferredColorCover, preferredStructuredCover);
    if (!coverToUse && modelData.products?.length > 0) {
      for (const p of modelData.products) {
        const productId = p.id;
        if (!productId) continue;
        const primaryImage = await prisma.productImage.findFirst({
          where: { product_id: productId },
          orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }],
          select: { url: true }
        });
        const normalizedPrimary = normalizePhotoPath(primaryImage?.url || null);
        if (normalizedPrimary) {
          coverToUse = normalizedPrimary;
          break;
        }
      }
    }
    const hasGallery = photoStructure.gallery.length > 0;

    const normalizedCover = normalizePhotoPath(coverToUse);
    const normalizedGallery = photoStructure.gallery.map(normalizePhotoPath).filter((p): p is string => p !== null);

    logger.debug(`Нормализация путей к фото`, 'catalog/doors/complete-data/GET', { 
      model: modelData.model,
      coverOriginal: coverToUse,
      coverNormalized: normalizedCover,
      coatingsCount: coatings.length
    }, loggingContext);

    // Опции по модели: объединение по ВСЕМ товарам с данным Код модели Domeo (Web) — доступно то, что доступно хотя бы у одного.
    const allProducts = modelData.products ?? [];
    let reversAvailable = false;
    let reversSurchargeRub = 0;
    let thresholdAvailable = false;
    let thresholdPriceRub = 0;
    let mirrorAvailable = false;
    let mirrorOneRub = 0;
    let mirrorBothRub = 0;
    const fillingNames = new Set<string>();
    const glassColorsSet = new Set<string>();
    let edgeInBase = false;
    let edgeBaseColor = '';
    const edgeOptionsList: Array<{ id: string; name: string; surcharge: number }> = [];

    for (const p of allProducts) {
      const props = p.properties || {};
      if (String(props['Domeo_Опции_Реверс_доступен'] ?? '').toLowerCase().includes('да')) reversAvailable = true;
      reversSurchargeRub = Math.max(reversSurchargeRub, Number(props['Domeo_Опции_Надбавка_реверс_руб']) || 0);
      if (String(props['Domeo_Опции_Порог_доступен'] ?? '').toLowerCase().includes('да')) thresholdAvailable = true;
      thresholdPriceRub = Math.max(thresholdPriceRub, Number(props['Domeo_Опции_Цена_порога_руб']) || 0);
      if (String(props['Domeo_Опции_Зеркало_доступно'] ?? '').toLowerCase().includes('да')) mirrorAvailable = true;
      mirrorOneRub = Math.max(mirrorOneRub, Number(props['Domeo_Опции_Зеркало_одна_сторона_руб']) || 0);
      mirrorBothRub = Math.max(mirrorBothRub, Number(props['Domeo_Опции_Зеркало_две_стороны_руб']) || 0);
      const fill = props['Domeo_Опции_Название_наполнения'] != null ? String(props['Domeo_Опции_Название_наполнения']).trim() : '';
      if (fill) fillingNames.add(fill);
      const glass = props['Domeo_Стекло_доступность'];
      if (Array.isArray(glass)) glass.forEach((c: unknown) => { if (typeof c === 'string') glassColorsSet.add(c); });

      // Кромка: одинаковая у всех товаров одной модели (лист «Наценка за кромку» по названию модели), берём из первого
      if (!edgeBaseColor && (props['Domeo_Кромка_в_базе_включена'] != null || props['Domeo_Кромка_базовая_цвет'] != null)) {
        edgeInBase = String(props['Domeo_Кромка_в_базе_включена'] ?? '').trim().toLowerCase() === 'да';
        edgeBaseColor = props['Domeo_Кромка_базовая_цвет'] != null ? String(props['Domeo_Кромка_базовая_цвет']).trim() : '';
        if (edgeInBase) {
          edgeOptionsList.length = 0;
          if (edgeBaseColor) edgeOptionsList.push({ id: edgeBaseColor, name: edgeBaseColor, surcharge: 0 });
          for (const i of [2, 3, 4] as const) {
            const colorVal = props[`Domeo_Кромка_Цвет_${i}`] != null ? String(props[`Domeo_Кромка_Цвет_${i}`]).trim() : '';
            const surchargeVal = Number(props[`Domeo_Кромка_Наценка_Цвет_${i}`]) || 0;
            if (colorVal) edgeOptionsList.push({ id: colorVal, name: colorVal, surcharge: surchargeVal });
          }
        }
      }
    }

    // Если кромка в базе, но опции не заполнились из Domeo_* — собираем из свойства «Кромка» у товаров
    if (edgeInBase && edgeOptionsList.length === 0) {
      const edgeNames = new Set<string>();
      for (const p of allProducts) {
        const v = p.properties?.['Кромка'] != null ? String(p.properties['Кромка']).trim() : '';
        if (v && v !== '-') edgeNames.add(v);
      }
      edgeNames.forEach((name) => edgeOptionsList.push({ id: name, name, surcharge: 0 }));
    }

    const glassColors = Array.from(glassColorsSet);
    const fillingName = fillingNames.size > 0 ? Array.from(fillingNames)[0] : '';

    const result = {
      model: modelData.model,
      modelKey: modelData.modelKey, // Код модели Domeo (Web) — для связи вкладок и расчёта цены
      style: modelData.style,
      photo: normalizedCover,
      photos: {
        cover: normalizedCover,
        gallery: normalizedGallery
      },
      hasGallery: hasGallery,
      products: modelData.products,
      coatings,
      colorsByFinish,
      glassColors, // варианты цвета стекла (на цену не влияет; для спецификации)
      edge_in_base: edgeInBase,
      edge_options: edgeOptionsList,
      options: {
        finishes,
        colors,
        colorsByFinish,
        types: [] as string[],
        widths: [] as number[],
        heights: [] as number[]
      },
      doorOptions: {
        revers_available: reversAvailable,
        revers_surcharge_rub: reversSurchargeRub,
        threshold_available: thresholdAvailable,
        threshold_price_rub: thresholdPriceRub,
        mirror_available: mirrorAvailable,
        mirror_one_rub: mirrorOneRub,
        mirror_both_rub: mirrorBothRub,
        filling_name: fillingName || undefined
      },
      filling_names: fillingNames.size > 0 ? Array.from(fillingNames) : []
    };
    
    logger.debug(`Возвращаем данные для модели`, 'catalog/doors/complete-data/GET', { 
      model: result.model, 
      modelKey: result.modelKey,
      hasPhoto: !!result.photo,
      photo: result.photo,
      photosCover: result.photos.cover,
      photosGalleryCount: result.photos.gallery.length,
      hasGallery 
    }, loggingContext);
    
    return result;
  });

  const modelResults = await Promise.all(modelPromises);
  models.push(...modelResults);

  const result = {
    models: models.sort((a, b) => {
      const modelA = a.model || '';
      const modelB = b.model || '';
      return modelA.localeCompare(modelB);
    }),
    totalModels: models.length,
    styles: Array.from(styles),
    timestamp: Date.now()
  };

  // Сохраняем в кэш
  completeDataCache.set(cacheKey, {
    data: result,
    timestamp: Date.now()
  });

    logger.info(`API complete-data - найдено моделей`, 'catalog/doors/complete-data/GET', { modelsCount: models.length }, loggingContext);

    const res = apiSuccess({
      ok: true,
      ...result
    });
    res.headers.set('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;
    
    logger.error('Error fetching complete-data', 'catalog/doors/complete-data/GET', { 
      error: errorMessage,
      code: errorCode,
      stack: error instanceof Error ? error.stack : undefined
    }, loggingContext);
    
    // В development возвращаем детали ошибки
    if (process.env.NODE_ENV === 'development') {
      return apiError(
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        'Ошибка при получении данных каталога',
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

// Публичный API - каталог доступен всем
export const GET = withErrorHandling(
  getHandler,
  'catalog/doors/complete-data/GET'
);
