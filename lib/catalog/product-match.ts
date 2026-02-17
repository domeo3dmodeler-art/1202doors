/**
 * Поиск товаров в БД по конфигурации из корзины.
 * Конфигуратор и корзина работают строго на данных из БД — сопоставление точное.
 * Высоты 2350 и 2750 (интервалы 2301–2500 и 2501–3000) — виртуальные; в БД у товаров высота 2000.
 */

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';

const LOG_SCOPE = 'product-match';

/** Виртуальные высоты для интервалов 2301–2500 и 2501–3000 мм; в БД у товаров хранится 2000. */
const HEIGHT_BAND_2301_2500 = 2350;
const HEIGHT_BAND_2501_3000 = 2750;

function heightForMatch(itemHeight: string): string {
  const num = parseInt(itemHeight, 10);
  if (num === HEIGHT_BAND_2301_2500 || num === HEIGHT_BAND_2501_3000) return '2000';
  return itemHeight;
}

export interface CartItemForMatch {
  type?: string;
  itemType?: string;
  model?: string;
  /** Название модели из БД (подмодель) — для точного совпадения при экспорте */
  model_name?: string | null;
  finish?: string;
  color?: string;
  width?: number | null;
  height?: number | null;
  handleId?: string;
  limiterId?: string;
}

export interface ProductWithProps {
  id: string;
  properties_data: string | object | null;
  name: string | null;
  sku: string | null;
}

function parseProps(properties_data: string | object | null): Record<string, unknown> {
  if (!properties_data) return {};
  if (typeof properties_data === 'string') {
    try {
      return JSON.parse(properties_data) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return properties_data as Record<string, unknown>;
}

/** Строгое сравнение: значения из корзины должны совпадать с полями в БД. */
function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

/** Ручка по ID (категория «Ручки»). */
export async function findHandleById(handleId: string): Promise<ProductWithProps[]> {
  if (!handleId) return [];
  const product = await prisma.product.findFirst({
    where: {
      id: handleId,
      catalog_category: { name: { in: ['Ручки', 'Ручки и завертки'] } },
    },
    select: { id: true, properties_data: true, name: true, sku: true },
  });
  if (product) {
    logger.debug('Найдена ручка', LOG_SCOPE, { handleId, sku: product.sku });
    return [product];
  }
  logger.debug('Ручка не найдена', LOG_SCOPE, { handleId });
  return [];
}

/** Ограничитель по ID (категория «Ограничители»). */
export async function findLimiterById(limiterId: string): Promise<ProductWithProps[]> {
  if (!limiterId) return [];
  const product = await prisma.product.findFirst({
    where: {
      id: limiterId,
      catalog_category: { name: 'Ограничители' },
    },
    select: { id: true, properties_data: true, name: true, sku: true },
  });
  if (product) {
    logger.debug('Найден ограничитель', LOG_SCOPE, { limiterId, sku: product.sku });
    return [product];
  }
  logger.debug('Ограничитель не найден', LOG_SCOPE, { limiterId });
  return [];
}

/** Двери по конфигурации: точное совпадение с полями БД (без нормализации). */
async function findDoorsByConfiguration(item: CartItemForMatch): Promise<ProductWithProps[]> {
  const products = await prisma.product.findMany({
    where: { catalog_category: { name: 'Межкомнатные двери' } },
    select: { id: true, properties_data: true, name: true, sku: true },
    take: 10000,
  });

  const matching: ProductWithProps[] = [];
  const itemModel = str(item.model);
  const itemModelName = item.model_name != null ? str(item.model_name) : '';
  const itemFinish = str(item.finish);
  const itemColor = str(item.color);
  const itemWidth = item.width != null ? str(item.width) : '';
  const itemHeight = item.height != null ? str(item.height) : '';

  for (const product of products) {
    const props = parseProps(product.properties_data);

    const dbCode = str(props['Код модели Domeo (Web)']);
    const modelMatch = !itemModel || dbCode === itemModel;

    const dbModelName = str(props['Название модели']);
    const modelNameMatch = !itemModelName || dbModelName === itemModelName;

    const dbFinish = str(props['Тип покрытия']);
    const finishMatch = !itemFinish || dbFinish === itemFinish;

    const dbColor = str(props['Цвет/Отделка']);
    const colorMatch = !itemColor || dbColor === itemColor;

    const dbWidth = str(props['Ширина/мм']);
    const widthMatch = !itemWidth || dbWidth === itemWidth;

    const dbHeight = str(props['Высота/мм']);
    const heightMatch = !itemHeight || heightForMatch(itemHeight) === heightForMatch(dbHeight);

    if (modelMatch && modelNameMatch && finishMatch && colorMatch && widthMatch && heightMatch) {
      matching.push(product);
    }
  }

  logger.debug('Поиск дверей по конфигурации', LOG_SCOPE, {
    itemModel,
    itemModelName: itemModelName || undefined,
    itemFinish,
    itemColor,
    itemWidth,
    itemHeight,
    found: matching.length,
  });
  return matching;
}

/**
 * Возвращает товары из БД, соответствующие позиции корзины.
 * Ручки и завертки — по handleId; ограничители — по limiterId; двери — по модели, покрытию, цвету, размерам (строгое совпадение с БД).
 */
export async function getMatchingProducts(item: CartItemForMatch): Promise<ProductWithProps[]> {
  const type = (item.type || item.itemType || '').toLowerCase();

  if ((type === 'handle' || type === 'backplate') && item.handleId) {
    return findHandleById(item.handleId);
  }

  if (type === 'limiter' && item.limiterId) {
    return findLimiterById(item.limiterId);
  }

  return findDoorsByConfiguration(item);
}

/**
 * По коду/названию модели возвращает «Название модели» из БД (первый найденный товар с такой моделью).
 * Используется только для fallback-строки, когда точного совпадения по конфигурации нет.
 */
export async function getModelNameByCode(modelCode: string | undefined): Promise<string> {
  if (!modelCode || typeof modelCode !== 'string') return '';
  const products = await findDoorsByConfiguration({ model: modelCode });
  if (products.length === 0) return '';
  const props = parseProps(products[0].properties_data);
  const name = str(props['Название модели']);
  return name;
}

/**
 * Метаданные модели из БД для fallback-строки Excel: название, поставщик, цена опт, цена РРЦ.
 * Используется когда точного совпадения по конфигурации нет — подставляем из первого товара с таким кодом модели.
 */
export async function getModelMetadataByCode(modelCode: string | undefined): Promise<{
  modelName: string;
  supplier: string;
  priceOpt: string | number;
  priceRrc: string | number;
}> {
  const empty = { modelName: '', supplier: '', priceOpt: '', priceRrc: '' };
  if (!modelCode || typeof modelCode !== 'string') return empty;
  const products = await findDoorsByConfiguration({ model: modelCode });
  if (products.length === 0) return empty;
  const props = parseProps(products[0].properties_data);
  const modelName = str(props['Название модели']);
  const supplier = str(props['Поставщик']);
  const priceOpt = props['Цена опт'] ?? props['Цена опт (руб)'] ?? '';
  const priceOptStr = priceOpt !== '' && priceOpt != null ? String(priceOpt) : '';
  const priceRrc = props['Цена РРЦ'] ?? props['Цена розница'] ?? '';
  const priceRrcStr = priceRrc !== '' && priceRrc != null ? String(priceRrc) : '';
  return { modelName, supplier, priceOpt: priceOptStr, priceRrc: priceRrcStr };
}

/**
 * Полные properties_data первого товара по коду модели (для fallback-строки Excel).
 * Когда точного совпадения по конфигурации нет — подставляем из БД по коду модели, чтобы заполнить Цена РРЦ, Поставщик, Покрытие, Толщина и т.д.
 */
export async function getFirstProductPropsByModelCode(modelCode: string | undefined): Promise<Record<string, unknown> | null> {
  if (!modelCode || typeof modelCode !== 'string') return null;
  const products = await findDoorsByConfiguration({ model: modelCode });
  if (products.length === 0) return null;
  return parseProps(products[0].properties_data);
}
