import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { getPropertyPhotosFromPool, getPropertyPhotosByValuePrefixFromPool, structurePropertyPhotos, loadAllPropertyPhotosForDoors, DOOR_COLOR_PROPERTY, DOOR_MODEL_CODE_PROPERTY } from '../../../../../lib/property-photos';
import { getDoorsCategoryId } from '../../../../../lib/catalog-categories';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/middleware';
import { getClientIP, publicApiRateLimiter, createNextRateLimitResponse } from '@/lib/security/rate-limiter';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';
import { getCompleteDataCache, clearCompleteDataCache } from '../../../../../lib/catalog/complete-data-cache';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import { findDoorPhotoFile } from '../../../../../lib/configurator/door-photo-fallback';

const CACHE_TTL = 30 * 60 * 1000;

// DELETE - очистка кэша
async function deleteHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  clearCompleteDataCache();
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
  const clientIP = getClientIP(req);
  if (!publicApiRateLimiter.isAllowed(clientIP)) {
    return createNextRateLimitResponse(publicApiRateLimiter, clientIP);
  }
  const loggingContext = getLoggingContextFromRequest(req);
  const { searchParams } = new URL(req.url);
  const style = searchParams.get('style');
  const forceRefresh = searchParams.get('refresh') === '1';

  const completeDataCache = getCompleteDataCache();
  const cacheKey = style || 'all';
  const cached = completeDataCache.get(cacheKey);
  if (!forceRefresh && cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return apiSuccess({ ok: true, ...(cached.data as object) });
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

    const [products, photoPool] = await Promise.all([
      prisma.product.findMany({
        where: {
          catalog_category_id: DOORS_CATEGORY_ID,
          is_active: true
        },
        select: {
          id: true,
          sku: true,
          properties_data: true
        }
      }),
      loadAllPropertyPhotosForDoors(DOORS_CATEGORY_ID)
    ]);

  logger.debug(`Загружено ${products.length} товаров, ${photoPool.length} записей PropertyPhoto`, 'catalog/doors/complete-data/GET', { productsCount: products.length, photoPoolCount: photoPool.length }, loggingContext);

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
      const modelName = properties['Название модели'];
      const productStyle = properties['Domeo_Стиль Web'] || 'Классика';

      const modelKey = domeoCode;
      const displayName = modelKey;
      const styleString = typeof productStyle === 'string' ? productStyle : String(productStyle || 'Классика');
      const factoryName = typeof modelName === 'string' ? modelName.trim() : '';
      const supplier = String(properties['Поставщик'] ?? '').trim();

      if (!modelKey) return;
      if (style && styleString !== style) return;

      styles.add(styleString);

      if (!modelMap.has(modelKey)) {
        modelMap.set(modelKey, {
          model: displayName,
          modelKey: modelKey,
          style: styleString,
          products: [],
          factoryModelNames: new Set<string>(),
          suppliers: new Set<string>()
        });
      }

      const modelData = modelMap.get(modelKey);
      modelData.products.push({
        id: product.id,
        sku: product.sku,
        properties: properties
      });
      if (factoryName) modelData.factoryModelNames.add(factoryName);
      if (supplier) modelData.suppliers.add(supplier);
    } catch (error) {
      logger.warn(`Ошибка обработки товара`, 'catalog/doors/complete-data/GET', { sku: product.sku, error }, loggingContext);
    }
  });

  // Наполнение по коду модели: по ВСЕМ товарам с данным кодом (без фильтра по стилю), чтобы в UI предлагались все варианты для выбранного кода.
  const fillingByModelKey = new Map<string, Set<string>>();
  products.forEach(product => {
    try {
      const properties = product.properties_data ?
        (typeof product.properties_data === 'string' ? JSON.parse(product.properties_data) : product.properties_data) : {};
      const domeoCode = String(properties['Код модели Domeo (Web)'] ?? '').trim();
      if (!domeoCode) return;
      const fill = properties['Domeo_Опции_Название_наполнения'] != null ? String(properties['Domeo_Опции_Название_наполнения']).trim() : '';
      if (!fill) return;
      if (!fillingByModelKey.has(domeoCode)) fillingByModelKey.set(domeoCode, new Set<string>());
      fillingByModelKey.get(domeoCode)!.add(fill);
    } catch {
      // ignore
    }
  });

  // Теперь структурируем фото для каждой модели: обложка — первая доступная среди всех фабричных вариантов (лист "Цвет")
  const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i;
  const normalizePhotoPath = (raw: string | null): string | null => {
    if (!raw) return null;
    let path = String(raw).trim();
    if (!path) return null;
    // Technical notes/placeholders should not be treated as image paths.
    if (path.includes('не рассматриваем') || path.includes('пока не добавляем')) return null;
    // Локальные пути: только public/uploads (в т.ч. final-filled/doors). Внешние URL не используем.
    if (path.startsWith('http://') || path.startsWith('https://')) return null;
    // Нормализуем обратные слеши (Windows) в прямые для веб-путей
    path = path.replace(/\\/g, '/');
    // Абсолютный путь к uploads (Windows или *nix) → оставляем только /uploads/...
    const uploadsIdx = path.toLowerCase().indexOf('/uploads/');
    if (uploadsIdx !== -1) path = path.slice(uploadsIdx);
    const winUploads = path.match(/^[a-z]:\/.*?\/uploads\/(.+)$/i);
    if (winUploads) path = `/uploads/${winUploads[1]}`;
    if (path.startsWith('/uploads/')) return IMAGE_EXT.test(path) ? path : null;
    if (path.startsWith('products/')) {
      const normalized = `/uploads/${path}`;
      return IMAGE_EXT.test(normalized) ? normalized : null;
    }
    if (path.startsWith('uploads/')) {
      const normalized = `/uploads/${path.substring(7)}`;
      return IMAGE_EXT.test(normalized) ? normalized : null;
    }
    // Относительный путь (напр. final-filled/doors/файл.jpg) → под public/uploads
    const normalized = path.startsWith('/') ? path : `/uploads/${path}`;
    return IMAGE_EXT.test(normalized) ? normalized : null;
  };

  // Подстановка реального имени файла, если в БД короткое (Дверь_Molis_1_Белый_...), а на диске длинное (Дверь_Molis_1_эмаль_ДГ_Исполнение_Эмаль_Белый_...)
  const resolveDoorPhotoToExistingFile = (normalizedPath: string | null): string | null => {
    if (!normalizedPath || !normalizedPath.includes('/final-filled/doors/')) return normalizedPath;
    const prefix = '/uploads/final-filled/doors/';
    if (!normalizedPath.startsWith(prefix)) return normalizedPath;
    const fileName = normalizedPath.slice(prefix.length);
    const doorsDir = join(process.cwd(), 'public', 'uploads', 'final-filled', 'doors');
    const fullPath = join(doorsDir, fileName);
    if (existsSync(fullPath)) return normalizedPath;
    const found = findDoorPhotoFile(doorsDir, fileName);
    if (!found) return normalizedPath;
    return `${prefix}${basename(found)}`;
  };

  // Одна запись на (modelKey, style) только если есть хотя бы один товар. Правила: docs/DOOR_CONFIGURATOR_DATA_RULES.md
  type ModelEntry = [string, { model: string; modelKey: string; style: string; products: any[]; factoryModelNames: Set<string>; suppliers: Set<string> }];
  const modelEntries: ModelEntry[] = [];
  if (style) {
    for (const [modelKey, modelData] of modelMap.entries()) {
      if ((modelData.products?.length ?? 0) > 0) modelEntries.push([modelKey, modelData as any]);
    }
  } else {
    for (const [modelKey, modelData] of modelMap.entries()) {
      const products = modelData.products ?? [];
      const styleSet = new Set<string>();
      for (const p of products) {
        const s = String((p.properties || {})['Domeo_Стиль Web'] ?? 'Классика').trim();
        styleSet.add(s);
      }
      for (const styleVal of styleSet) {
        const productsForStyle = products.filter((p: any) => String((p.properties || {})['Domeo_Стиль Web'] ?? 'Классика').trim() === styleVal);
        if (productsForStyle.length === 0) continue;
        const factoryModelNames = new Set<string>();
        const suppliers = new Set<string>();
        for (const p of productsForStyle) {
          const props = p.properties || {};
          const name = typeof props['Название модели'] === 'string' ? String(props['Название модели']).trim() : '';
          if (name) factoryModelNames.add(name);
          const sup = String(props['Поставщик'] ?? '').trim();
          if (sup) suppliers.add(sup);
        }
        modelEntries.push([
          modelKey,
          {
            model: modelData.model,
            modelKey,
            style: styleVal,
            products: productsForStyle,
            factoryModelNames,
            suppliers
          }
        ]);
      }
    }
  }

  const modelPromises = modelEntries.map(async ([modelKey, modelData]) => {
    logger.debug(`Получаем фото для модели`, 'catalog/doors/complete-data/GET', { model: modelData.model, modelKey, style: modelData.style }, loggingContext);

    const normalizedCode = modelKey && typeof modelKey === 'string' ? modelKey.trim().toLowerCase() : '';

    // Список покрытий и цветов: сначала из PropertyPhoto (полный каталог по модели), затем дополняем из товаров — после отката в товарах по одному цвету на покрытие, в PropertyPhoto все цвета.
    const coatingsMap = new Map<string, { id: string; coating_type: string; color_name: string; photo_path: string | null }>();
    const prefixModel = `${modelKey}|`;
    const colorPhotosForModel = getPropertyPhotosByValuePrefixFromPool(photoPool, DOOR_COLOR_PROPERTY, prefixModel);
    for (const ph of colorPhotosForModel) {
      const parts = String(ph.propertyValue ?? '').split('|');
      const finish = parts.length >= 3 ? parts[1].trim() : '';
      const colorName = parts.length >= 3 ? parts[2].trim() : parts.length === 2 ? parts[1].trim() : '';
      if (!colorName) continue;
      const key = `${finish}_${colorName}`;
      if (coatingsMap.has(key)) continue;
      coatingsMap.set(key, {
        id: key,
        coating_type: finish || '—',
        color_name: colorName,
        photo_path: null
      });
    }
    for (const p of modelData.products ?? []) {
      const props = p.properties || {};
      const coatingType = String(props['Тип покрытия'] ?? '').trim();
      const colorName = String(props['Цвет/Отделка'] ?? '').trim();
      if (!coatingType || !colorName) continue;
      const key = `${coatingType}_${colorName}`;
      if (coatingsMap.has(key)) continue;
      coatingsMap.set(key, {
        id: key,
        coating_type: coatingType,
        color_name: colorName,
        photo_path: null
      });
    }
    // Фото цвета: один кандидат — modelKey|Тип покрытия|Цвет (PropertyPhoto Domeo_Модель_Цвет)
    let firstColorCover: string | null = null;
    for (const [, entry] of coatingsMap) {
      const propertyValue = `${modelKey}|${entry.coating_type}|${entry.color_name}`;
      const colorPhotos = getPropertyPhotosFromPool(photoPool, DOOR_COLOR_PROPERTY, propertyValue);
      const coverPhoto = colorPhotos.find((ph: { photoType: string }) => ph.photoType === 'cover');
      const rawPath = coverPhoto?.photoPath;
      let photo_path = rawPath ? normalizePhotoPath(rawPath) : null;
      if (photo_path) photo_path = resolveDoorPhotoToExistingFile(photo_path);
      if (photo_path) {
        entry.photo_path = photo_path;
        firstColorCover = firstColorCover || photo_path;
      }
    }
    if (!firstColorCover) {
      for (const c of coatingsMap.values()) {
        if (c.photo_path) {
          firstColorCover = c.photo_path;
          break;
        }
      }
    }
    const coatings = Array.from(coatingsMap.values());

    // Обложка модели: 1) по коду (Код модели Domeo (Web)), 2) по префиксу кода в Domeo_Модель_Цвет, 3) первое из coatings, 4) null
    let modelCover: string | null = null;
    if (normalizedCode) {
      const byCode = getPropertyPhotosFromPool(photoPool, DOOR_MODEL_CODE_PROPERTY, normalizedCode);
      const structuredByCode = structurePropertyPhotos(byCode);
      modelCover = resolveDoorPhotoToExistingFile(normalizePhotoPath(structuredByCode.cover));
    }
    if (!modelCover && normalizedCode) {
      const byPrefix = getPropertyPhotosByValuePrefixFromPool(photoPool, DOOR_COLOR_PROPERTY, normalizedCode + '|');
      const structuredByPrefix = structurePropertyPhotos(byPrefix);
      modelCover = resolveDoorPhotoToExistingFile(normalizePhotoPath(structuredByPrefix.cover));
    }
    if (!modelCover && modelKey.trim() !== normalizedCode) {
      const byKeyPrefix = getPropertyPhotosByValuePrefixFromPool(photoPool, DOOR_COLOR_PROPERTY, modelKey.trim() + '|');
      const structuredByKey = structurePropertyPhotos(byKeyPrefix);
      modelCover = resolveDoorPhotoToExistingFile(normalizePhotoPath(structuredByKey.cover));
    }
    if (!modelCover && firstColorCover) modelCover = resolveDoorPhotoToExistingFile(firstColorCover);
    const photoStructure = { cover: modelCover, gallery: [] as string[] };
    // Типы покрытия и цвета по типам
    const finishes = [...new Set(coatings.map((c) => c.coating_type))].filter(Boolean).sort();
    const colorsByFinish: Record<string, Array<{ id: string; color_name: string; photo_path: string | null }>> = {};
    coatings.forEach((c) => {
      const t = c.coating_type || '';
      if (!t) return;
      if (!colorsByFinish[t]) colorsByFinish[t] = [];
      colorsByFinish[t].push({ id: c.id, color_name: c.color_name, photo_path: c.photo_path });
    });
    const colors = [...new Set(coatings.map((c) => c.color_name))].filter(Boolean).sort();

    const normalizedCover = normalizePhotoPath(photoStructure.cover);
    const normalizedGallery = (photoStructure.gallery || []).map(normalizePhotoPath).filter((p): p is string => p !== null);
    const hasGallery = normalizedGallery.length > 0;

    logger.debug(`Нормализация путей к фото`, 'catalog/doors/complete-data/GET', { 
      model: modelData.model,
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
    const edgeOptionsMap = new Map<string, { id: string; name: string; surcharge: number }>();

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

      const inBase = String(props['Domeo_Кромка_в_базе_включена'] ?? '').trim().toLowerCase() === 'да';
      if (inBase) edgeInBase = true;
      const baseColor = props['Domeo_Кромка_базовая_цвет'] != null ? String(props['Domeo_Кромка_базовая_цвет']).trim() : '';
      if (baseColor && !edgeBaseColor) edgeBaseColor = baseColor;
      if (inBase) {
        if (baseColor) {
          const cur = edgeOptionsMap.get(baseColor);
          if (!cur || 0 > (cur.surcharge ?? 0)) edgeOptionsMap.set(baseColor, { id: baseColor, name: baseColor, surcharge: 0 });
        }
        for (const i of [2, 3, 4] as const) {
          const colorVal = props[`Domeo_Кромка_Цвет_${i}`] != null ? String(props[`Domeo_Кромка_Цвет_${i}`]).trim() : '';
          const surchargeVal = Number(props[`Domeo_Кромка_Наценка_Цвет_${i}`]) || 0;
          if (colorVal) {
            const cur = edgeOptionsMap.get(colorVal);
            if (!cur || surchargeVal > (cur.surcharge ?? 0)) edgeOptionsMap.set(colorVal, { id: colorVal, name: colorVal, surcharge: surchargeVal });
          }
        }
      }
    }

    let edgeOptionsList = Array.from(edgeOptionsMap.values());
    if (edgeInBase && edgeOptionsList.length === 0) {
      const edgeNames = new Set<string>();
      for (const p of allProducts) {
        const v = p.properties?.['Кромка'] != null ? String(p.properties['Кромка']).trim() : '';
        if (v && v !== '-') edgeNames.add(v);
      }
      edgeOptionsList = Array.from(edgeNames).map((name) => ({ id: name, name, surcharge: 0 }));
    }

    const glassColors = Array.from(glassColorsSet);
    const fillingName = fillingNames.size > 0 ? Array.from(fillingNames)[0] : '';

    // Размеры (ширина × высота) без передачи полного массива products — уменьшает ответ и устраняет ERR_INCOMPLETE_CHUNKED_ENCODING на слабых ВМ
    const sizes = (modelData.products ?? [])
      .map((p: { properties?: Record<string, unknown> }) => ({
        width: Number(p.properties?.['Ширина/мм']) || 800,
        height: Number(p.properties?.['Высота/мм']) || 2000,
      }))
      .filter((s: { width: number; height: number }) => s.width && s.height);

    const result = {
      model: modelData.model,
      modelKey: modelData.modelKey,
      style: modelData.style,
      suppliers: Array.from(modelData.suppliers || new Set<string>()).filter(Boolean),
      photo: normalizedCover ?? null,
      photos: {
        cover: normalizedCover ?? null,
        gallery: normalizedGallery
      },
      hasGallery: hasGallery,
      sizes: sizes.length > 0 ? sizes : undefined,
      coatings,
      colorsByFinish,
      // products не отдаём — объём слишком большой, приводит к ERR_INCOMPLETE_CHUNKED_ENCODING; клиент использует sizes, coatings, edge_options
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
      filling_names: (() => {
        const fromAllProducts = fillingByModelKey.get(modelData.modelKey);
        if (fromAllProducts && fromAllProducts.size > 0) return Array.from(fromAllProducts);
        return fillingNames.size > 0 ? Array.from(fillingNames) : [];
      })()
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
  getCompleteDataCache().set(cacheKey, {
    data: result,
    timestamp: Date.now()
  });

    logger.info(`API complete-data - найдено моделей`, 'catalog/doors/complete-data/GET', { modelsCount: models.length }, loggingContext);

    const res = apiSuccess({
      ok: true,
      ...result
    });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
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
