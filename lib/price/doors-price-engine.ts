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
  /** Название модели из БД (подмодель по фильтрам) — для корзины и экспорта в Excel */
  model_name: string | null;
  /** Все подходящие по фильтру товары (подмодели) — для корзины/заказа/экспорта без повторного поиска в БД */
  matchingProducts?: ProductWithProps[];
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
  const rrc =
    Number(props['Цена РРЦ']) ||
    Number(props['Цена РРЦ (руб)']) ||
    Number(props['Цена розница']);
  if (Number.isFinite(rrc) && rrc > 0) return rrc;
  return Number(product.base_price || 0);
}

export function pickMaxPriceProduct<T extends ProductWithProps>(products: T[]): T {
  return products.reduce((maxProduct, currentProduct) => {
    return getProductRrc(currentProduct) > getProductRrc(maxProduct) ? currentProduct : maxProduct;
  }, products[0]);
}

/**
 * Выбор одной подмодели из подходящих: предпочитаем ту, чьё «Название модели» соответствует
 * выбранному типу покрытия (Эмаль/ПВХ/ПЭТ/Шпон) и по возможности «гладкую» подмодель, а не Флекс/Порта.
 * Иначе в экспорт попадала бы подмодель с макс. РРЦ (например ДПГ Флекс Эмаль Порта) вместо нужной (Дверь Гладкое эмаль ДГ).
 */
export function pickProductBySelection<T extends ProductWithProps>(
  products: T[],
  selection: { finish?: string | null }
): T {
  if (products.length === 0) throw new Error('pickProductBySelection: пустой массив');
  if (products.length === 1) return products[0];

  const selFinish = selection.finish != null ? String(selection.finish).trim().toLowerCase() : '';

  function getModelName(p: ProductWithProps): string {
    const props = parseProductProperties(p.properties_data);
    return String(props['Название модели'] ?? '').trim().toLowerCase();
  }

  // Сначала оставляем товары, у которых Название модели содержит выбранный тип покрытия
  let preferred = products;
  if (selFinish) {
    const byFinish = products.filter((p) => getModelName(p).includes(selFinish));
    if (byFinish.length > 0) preferred = byFinish;
  }

  // Предпочитаем подмодели без «Флекс» и «Порта» (гладкие), чтобы не подставлять ДПГ Флекс Эмаль Порта для Эмаль
  const noFlexPorta = preferred.filter(
    (p) => !getModelName(p).includes('флекс') && !getModelName(p).includes('порта')
  );
  if (noFlexPorta.length > 0) preferred = noFlexPorta;

  return pickMaxPriceProduct(preferred);
}

export const HEIGHT_BAND_2301_2500 = 2350;
export const HEIGHT_BAND_2501_3000 = 2750;

export function heightForMatching(selectionHeight: number | undefined): number | undefined {
  if (selectionHeight == null) return undefined;
  if (selectionHeight === HEIGHT_BAND_2301_2500 || selectionHeight === HEIGHT_BAND_2501_3000) return 2000;
  return selectionHeight;
}

/** Округление итоговой цены вверх до 100 руб. */
export function roundUpTo100(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.ceil(n / 100) * 100;
}

/** Нормализация строки для сравнения (trim); пустая строка после trim → null. */
function normStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * Подбор товаров дверей по выбору пользователя.
 * Совпадение по: Код модели Domeo (Web), Стиль (Domeo_Стиль Web), Тип покрытия, Цвет/Отделка, размеры, наполнение, поставщик.
 * Название модели в фильтр не входит (оно привязано к коду и стилю в БД; цвета в каталоге привязаны к Название модели через PropertyPhoto).
 * @param allowEmptyColor — если true, при выбранном цвете подходят и товары без Цвет/Отделка (импорт из «Цены базовые» не заполняет цвет; одна цена на покрытие).
 */
export function filterProducts(
  products: ProductWithProps[],
  selection: PriceSelection,
  requireStyle: boolean,
  requireFinish: boolean,
  allowEmptyColor: boolean = false
): ProductWithProps[] {
  const selStyle = normStr(selection.style);
  const selModel = normStr(selection.model);
  const selFinish = normStr(selection.finish);
  const selColor = normStr(selection.color);
  const selFilling = normStr(selection.filling);
  const selSupplier = normStr(selection.supplier);

  return products.filter((p) => {
    const properties = parseProductProperties(p.properties_data);
    const dbStyle = normStr(properties['Domeo_Стиль Web']);
    const modelCode = normStr(properties['Код модели Domeo (Web)']);
    const dbFinish = normStr(properties['Тип покрытия']);
    const dbColor = normStr(properties['Цвет/Отделка']);

    const styleMatch =
      !requireStyle ||
      !selStyle ||
      dbStyle === selStyle ||
      (dbStyle != null && selStyle != null && dbStyle.startsWith(selStyle.slice(0, 8)));

    const modelMatch =
      !selModel ||
      modelCode === selModel ||
      (modelCode != null && selModel != null && modelCode.includes(selModel));

    if (!styleMatch || !modelMatch) return false;

    const finishMatch =
      !requireFinish ||
      !selFinish ||
      dbFinish === selFinish ||
      (dbFinish != null && selFinish != null && dbFinish.trim().toLowerCase() === selFinish.trim().toLowerCase());
    const colorMatch =
      !selColor ||
      (dbColor != null && dbColor !== '' && dbColor === selColor) ||
      (allowEmptyColor && selColor != null && (dbColor == null || dbColor === ''));
    const widthMatch = !selection.width || properties['Ширина/мм'] == selection.width;
    const heightToMatch = heightForMatching(selection.height ?? undefined);
    const heightMatch = !heightToMatch || properties['Высота/мм'] == heightToMatch;
    const fillingMatch =
      !selFilling ||
      (normStr(properties['Domeo_Опции_Название_наполнения']) ?? '') === selFilling;
    const supplierMatch =
      !selSupplier || (normStr(properties['Поставщик']) ?? '') === selSupplier;

    return finishMatch && colorMatch && widthMatch && heightMatch && fillingMatch && supplierMatch;
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

  let matching = filterProducts(products, selection, true, true, false);
  if (matching.length === 0) matching = filterProducts(products, selection, true, true, true);
  if (matching.length === 0) matching = filterProducts(products, selection, true, false, true);
  if (matching.length === 0) matching = filterProducts(products, selection, false, false, true);

  if (matching.length === 0) {
    throw new Error(`Товар с указанными параметрами не найден: ${JSON.stringify(selection)}`);
  }

  const product = pickProductBySelection(matching, selection);
  const properties = parseProductProperties(product.properties_data);

  const rrcPrice =
    Number(properties['Цена РРЦ']) ||
    Number(properties['Цена РРЦ (руб)']) ||
    Number(properties['Цена розница']) ||
    0;
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

  const modelName = String(properties['Название модели'] ?? '').trim() || null;
  return {
    currency: 'RUB',
    base: doorPrice,
    breakdown,
    total: roundUpTo100(total),
    sku: product.sku ?? null,
    model_name: modelName,
    matchingProducts: matching
  };
}
