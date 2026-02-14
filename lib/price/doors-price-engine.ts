/**
 * Движок расчёта цены дверей (без Prisma).
 * Используется API route и юнит-тестами.
 */

export interface ProductWithProps {
  id: string;
  sku?: string | null;
  name?: string | null;
  base_price?: number | null;
  properties_data?: unknown;
}

export interface PriceSelection {
  style?: string | null;
  model?: string | null;
  finish?: string | null;
  color?: string | null;
  type?: string | null;
  width?: number | null;
  height?: number | null;
  filling?: string | null;
  supplier?: string | null;
  reversible?: boolean;
  mirror?: string | null;
  threshold?: boolean;
  edge_id?: string | null;
  hardware_kit?: { id: string } | null;
  handle?: { id: string } | null;
  backplate?: boolean;
  limiter_id?: string | null;
  option_ids?: string[] | null;
}

export interface BreakdownItem {
  label: string;
  amount: number;
}

export interface PriceResult {
  currency: string;
  base: number;
  breakdown: BreakdownItem[];
  total: number;
  sku: string | null;
}

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

export function getProductRrc(product: ProductWithProps): number {
  const props = parseProductProperties(product.properties_data);
  const rrc = Number(props['Цена РРЦ']);
  if (Number.isFinite(rrc) && rrc > 0) return rrc;
  return Number(product.base_price || 0);
}

export function pickMaxPriceProduct<T extends ProductWithProps>(products: T[]): T {
  return products.reduce((maxProduct, currentProduct) => {
    return getProductRrc(currentProduct) > getProductRrc(maxProduct) ? currentProduct : maxProduct;
  }, products[0]);
}

export const HEIGHT_BAND_2301_2500 = 2350;
export const HEIGHT_BAND_2501_3000 = 2750;

export function heightForMatching(selectionHeight: number | undefined): number | undefined {
  if (selectionHeight == null) return undefined;
  if (selectionHeight === HEIGHT_BAND_2301_2500 || selectionHeight === HEIGHT_BAND_2501_3000) return 2000;
  return selectionHeight;
}

export function filterProducts(
  products: ProductWithProps[],
  selection: PriceSelection,
  requireStyle: boolean,
  requireFinish: boolean
): ProductWithProps[] {
  return products.filter((p) => {
    const properties = parseProductProperties(p.properties_data);

    const styleMatch =
      !requireStyle ||
      !selection.style ||
      properties['Domeo_Стиль Web'] === selection.style ||
      (typeof selection.style === 'string' &&
        (properties['Domeo_Стиль Web'] as string)?.startsWith?.(selection.style.slice(0, 8)));

    const modelName = properties['Domeo_Название модели для Web'];
    const modelCode = properties['Код модели Domeo (Web)'] ?? properties['Артикул поставщика'];
    const modelMatch =
      !selection.model ||
      modelName === selection.model ||
      modelCode === selection.model ||
      (typeof selection.model === 'string' &&
        ((modelName as string)?.includes?.(selection.model) || (modelCode as string)?.includes?.(selection.model)));

    if (!styleMatch || !modelMatch) return false;

    const finishMatch = !requireFinish || !selection.finish || properties['Тип покрытия'] === selection.finish;
    const colorMatch =
      !selection.color || properties['Domeo_Цвет'] === selection.color || properties['Domeo_Цвет'] == null;
    const typeMatch = !selection.type || properties['Тип конструкции'] === selection.type;
    const widthMatch = !selection.width || properties['Ширина/мм'] == selection.width;
    const heightToMatch = heightForMatching(selection.height ?? undefined);
    const heightMatch = !heightToMatch || properties['Высота/мм'] == heightToMatch;
    const fillingMatch =
      !selection.filling ||
      String(properties['Domeo_Опции_Название_наполнения'] ?? '').trim() === selection.filling;
    const supplierMatch =
      !selection.supplier || String(properties['Поставщик'] ?? '').trim() === selection.supplier;

    return finishMatch && colorMatch && typeMatch && widthMatch && heightMatch && fillingMatch && supplierMatch;
  });
}

export interface EngineInput {
  products: ProductWithProps[];
  selection: PriceSelection;
  hardwareKits: ProductWithProps[];
  handles: ProductWithProps[];
  getLimiter: (id: string) => ProductWithProps | null;
  getOptionProducts: (ids: string[]) => ProductWithProps[];
}

/**
 * Рассчитывает итоговую цену по выбору и данным товаров.
 * @throws если не найден ни один подходящий товар двери
 */
export function calculateDoorPrice(input: EngineInput): PriceResult {
  const { products, selection, hardwareKits, handles, getLimiter, getOptionProducts } = input;

  let matching = filterProducts(products, selection, true, true);
  if (matching.length === 0) matching = filterProducts(products, selection, true, false);
  if (matching.length === 0) matching = filterProducts(products, selection, false, false);

  if (matching.length === 0) {
    throw new Error(`Товар с указанными параметрами не найден: ${JSON.stringify(selection)}`);
  }

  const product = pickMaxPriceProduct(matching);
  const properties = parseProductProperties(product.properties_data);

  const rrcPrice = Number(properties['Цена РРЦ']) || 0;
  const basePrice = Number(product.base_price || 0);
  let doorPrice = rrcPrice || basePrice;

  let total = doorPrice;
  const breakdown: BreakdownItem[] = [{ label: 'Дверь', amount: doorPrice }];

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

  if (selection.reversible) {
    const reversSurcharge = Number(properties['Domeo_Опции_Надбавка_реверс_руб']) || 0;
    if (reversSurcharge > 0) {
      total += reversSurcharge;
      breakdown.push({ label: 'Реверс', amount: reversSurcharge });
    }
  }

  const mirror = selection.mirror;
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

  if (selection.threshold) {
    const thresholdPrice = Number(properties['Domeo_Опции_Цена_порога_руб']) || 0;
    if (thresholdPrice > 0) {
      total += thresholdPrice;
      breakdown.push({ label: 'Порог', amount: thresholdPrice });
    }
  }

  const edgeId = typeof selection.edge_id === 'string' ? selection.edge_id.trim() : '';
  if (edgeId && edgeId !== 'none') {
    const baseColor =
      properties['Domeo_Кромка_базовая_цвет'] != null
        ? String(properties['Domeo_Кромка_базовая_цвет']).trim()
        : '';
    let edgeSurcharge = 0;
    if (baseColor && edgeId === baseColor) {
      edgeSurcharge = 0;
    } else {
      for (const i of [2, 3, 4] as const) {
        const colorVal =
          properties[`Domeo_Кромка_Цвет_${i}`] != null
            ? String(properties[`Domeo_Кромка_Цвет_${i}`]).trim()
            : '';
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

  if (selection.hardware_kit?.id) {
    const kit = hardwareKits.find((k) => k.id === selection.hardware_kit!.id);
    if (kit) {
      const kitProps = parseProductProperties(kit.properties_data);
      const kitPrice =
        Number(kitProps['Группа_цена']) || Number(kit.base_price) || 0;
      total += kitPrice;
      breakdown.push({
        label: `Комплект: ${(kitProps['Наименование для Web'] as string) || kit.name || 'Фурнитура'}`,
        amount: kitPrice
      });
    }
  }

  if (selection.handle?.id) {
    const handle = handles.find((h) => h.id === selection.handle!.id);
    if (handle) {
      const handleProps = parseProductProperties(handle.properties_data);
      const handlePrice =
        Number(handleProps['Domeo_цена группы Web']) ||
        Number(handleProps['Цена продажи (руб)']) ||
        Number(handle.base_price) ||
        0;
      total += handlePrice;
      breakdown.push({
        label: `Ручка: ${(handleProps['Domeo_наименование ручки_1С'] as string) || handle.name || 'Ручка'}`,
        amount: handlePrice
      });
      if (selection.backplate === true) {
        const backplatePrice = Number(handleProps['Завертка, цена РРЦ'] ?? 0) || 0;
        if (backplatePrice > 0) {
          total += backplatePrice;
          breakdown.push({
            label: `Завертка: ${(handleProps['Domeo_наименование ручки_1С'] as string) || handle.name || 'Завертка'}`,
            amount: backplatePrice
          });
        }
      }
    }
  }

  if (selection.limiter_id) {
    const limiter = getLimiter(selection.limiter_id);
    if (limiter) {
      const props = parseProductProperties(limiter.properties_data);
      const limiterPrice = Number(props['Цена РРЦ']) || Number(limiter.base_price) || 0;
      total += limiterPrice;
      breakdown.push({ label: `Ограничитель: ${limiter.name ?? 'Ограничитель'}`, amount: limiterPrice });
    }
  }

  const optionIds = selection.option_ids ?? [];
  if (optionIds.length > 0) {
    const optionProducts = getOptionProducts(optionIds);
    for (const opt of optionProducts) {
      const props = parseProductProperties(opt.properties_data);
      const price = Number(props['Цена РРЦ']) || Number(opt.base_price) || 0;
      total += price;
      breakdown.push({ label: opt.name ?? 'Опция', amount: price });
    }
  }

  return {
    currency: 'RUB',
    base: doorPrice,
    breakdown,
    total: Math.round(total),
    sku: product.sku ?? null
  };
}
