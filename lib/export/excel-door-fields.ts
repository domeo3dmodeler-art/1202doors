/**
 * Единый список колонок Excel для экспорта дверей: все опции + колонка «цена» для каждой опции с наценкой.
 * Используется в supplier-orders Excel и в puppeteer-generator (документы/заказы).
 */

export const EXCEL_DOOR_FIELDS = [
  'Название модели',
  'Цена опт',
  'Цена РРЦ',
  'Поставщик',
  'Материал/Покрытие',
  'Ширина, мм',
  'Высота, мм',
  'Цвет/Отделка',
  'SKU внутреннее',
  'Кромка',
  'Кромка, цена',
  'Цвет кромки',
  'Реверс',
  'Реверс, цена',
  'Зеркало',
  'Зеркало, цена',
  'Цвет стекла',
  'Порог',
  'Порог, цена',
  'Наличники',
  'Наличники, цена',
  'Наполнение',
  'Наполнение, цена',
  'Код модели Domeo (Web)',
  'Толщина, мм',
  'Стекло (тип)',
  'Кромка в базе',
  'Стиль',
  'Комплект фурнитуры',
  'Комплект фурнитуры, цена',
] as const;

export type ExcelDoorFieldName = (typeof EXCEL_DOOR_FIELDS)[number];

/** Маппинг: колонка «X, цена» → префиксы/точные подписи в breakdown (label) */
const BREAKDOWN_LABEL_MAP: Record<string, string[] | ((label: string) => boolean)> = {
  'Кромка, цена': [(l) => l.startsWith('Кромка:')],
  'Реверс, цена': ['Реверс'],
  'Зеркало, цена': ['Зеркало (одна сторона)', 'Зеркало (две стороны)'],
  'Порог, цена': ['Порог'],
  'Наличники, цена': [(l) => l.includes('Наличник') || l === 'Опция'],
  'Наполнение, цена': [], // в breakdown нет отдельной строки
  'Комплект фурнитуры, цена': [(l) => l.startsWith('Комплект:')],
};

/**
 * Возвращает сумму по breakdown для колонки «опция, цена».
 * breakdown приходит из калькулятора при добавлении в корзину (item.breakdown).
 */
export function getOptionPriceFromBreakdown(
  breakdown: Array<{ label: string; amount: number }> | undefined,
  priceColumnName: ExcelDoorFieldName
): number | '' {
  if (!breakdown || breakdown.length === 0) return '';
  const rule = BREAKDOWN_LABEL_MAP[priceColumnName];
  if (!rule) return '';
  let sum = 0;
  const match = (r: string | ((label: string) => boolean), label: string): boolean =>
    typeof r === 'function' ? r(label) : r === label;
  for (const entry of breakdown) {
    if (Array.isArray(rule)) {
      if (rule.some((r) => match(r, entry.label))) sum += entry.amount;
    } else {
      if (rule(entry.label)) sum += entry.amount;
    }
  }
  return sum;
}

/** Формат зеркала для Excel */
function formatMirror(mirror: string | undefined): string {
  if (!mirror || mirror === 'none') return 'Без зеркала';
  if (mirror === 'one' || mirror === 'mirror_one') return 'Одна сторона';
  if (mirror === 'both' || mirror === 'mirror_both') return 'Две стороны';
  return mirror;
}

/** Формат наличников для Excel */
function formatArchitrave(item: { architraveNames?: string[]; optionNames?: string[] }): string {
  const names = item.architraveNames ?? item.optionNames ?? [];
  if (names.length === 0) return '';
  return names.join(', ');
}

export interface DoorExcelRowSource {
  /** Название модели по коду (если товар не найден в БД) */
  fallbackModelName?: string;
  item: {
    model?: string;
    model_name?: string;
    finish?: string;
    width?: number;
    height?: number;
    color?: string;
    sku_1c?: string | number | null;
    edge?: string;
    edgeColorName?: string;
    edge_color_name?: string;
    glassColor?: string;
    glass_color?: string;
    reversible?: boolean;
    mirror?: string;
    threshold?: boolean;
    architraveNames?: string[];
    optionNames?: string[];
    handleName?: string;
    hardwareKitName?: string;
    limiterName?: string;
    price_opt?: number;
    unitPrice?: number;
    breakdown?: Array<{ label: string; amount: number }>;
    [key: string]: unknown;
  };
  /** Поставщик из заказа */
  supplierName?: string;
  /** Свойства товара из БД (если найдено совпадение) */
  props?: Record<string, unknown>;
}

/**
 * Собирает значение для одной колонки Excel по item + опционально props + breakdown.
 * Для колонок «X, цена» использует item.breakdown.
 */
export function getDoorFieldValue(
  fieldName: ExcelDoorFieldName,
  source: DoorExcelRowSource
): string | number {
  const { item, supplierName = '', props = {}, fallbackModelName = '' } = source;
  const isDoor = !!(item.model || item.width != null || (item.finish != null && item.finish !== ''));

  if (fieldName.endsWith(', цена')) {
    const price = getOptionPriceFromBreakdown(item.breakdown, fieldName as ExcelDoorFieldName);
    return price === '' ? '' : price;
  }

  switch (fieldName) {
    case 'Название модели':
      return (props['Название модели'] ?? item.model_name ?? fallbackModelName ?? '').toString().trim();
    case 'Цена опт':
      return props['Цена опт'] ?? item.price_opt ?? '';
    case 'Цена РРЦ':
      return props['Цена РРЦ'] ?? props['Цена розница'] ?? item.unitPrice ?? '';
    case 'Поставщик':
      return (props['Поставщик'] ?? supplierName).toString().trim();
    case 'Материал/Покрытие':
      return (props['Материал/Покрытие'] ?? props['Тип покрытия'] ?? item.finish ?? '').toString().trim();
    case 'Ширина, мм':
      return props['Ширина/мм'] ?? item.width ?? '';
    case 'Высота, мм':
      return props['Высота/мм'] ?? item.height ?? '';
    case 'Цвет/Отделка':
      return (props['Цвет/Отделка'] ?? props['Domeo_Цвет'] ?? props['Цвет'] ?? item.color ?? '').toString().trim();
    case 'SKU внутреннее':
      return (item.sku_1c ?? props['Domeo Артикул 1С'] ?? '').toString().trim();
    case 'Кромка':
      const hasEdgeFromItem = isDoor && (item.edge === 'да' || (item.edgeId && String(item.edgeId).trim() && item.edgeId !== 'none') || (item.edgeColorName ?? item.edge_color_name));
      const hasEdgeInBase = (props['Domeo_Кромка_в_базе_включена'] ?? '').toString().trim();
      const edgeInBaseYes = /^(да|yes|1)$/i.test(hasEdgeInBase);
      return hasEdgeFromItem || (isDoor && edgeInBaseYes) ? 'да' : '';
    case 'Цвет кромки':
      const edgeFromItem = isDoor && (item.edge === 'да' || (item.edgeId && String(item.edgeId).trim() && item.edgeId !== 'none') || (item.edgeColorName ?? item.edge_color_name));
      const edgeInBaseForColor = (props['Domeo_Кромка_в_базе_включена'] ?? '').toString().trim();
      const edgeInBaseYesColor = /^(да|yes|1)$/i.test(edgeInBaseForColor);
      if (edgeFromItem) return (item.edgeColorName ?? item.edge_color_name ?? item.edgeId ?? '—').toString();
      if (isDoor && edgeInBaseYesColor) return (props['Domeo_Кромка_базовая_цвет'] ?? props['Кромка'] ?? '—').toString().trim() || '—';
      return '';
    case 'Реверс':
      return isDoor && item.reversible ? 'да' : '';
    case 'Зеркало':
      return isDoor ? formatMirror(item.mirror) : '';
    case 'Цвет стекла':
      return isDoor ? (item.glassColor ?? item.glass_color ?? '').toString() : '';
    case 'Порог':
      return isDoor && item.threshold ? 'да' : '';
    case 'Наличники':
      return isDoor ? formatArchitrave(item) : '';
    case 'Наполнение':
      return (props['Domeo_Опции_Название_наполнения'] ?? props['Наполнение'] ?? (item as any).filling ?? (item as any).fillingName ?? '').toString().trim();
    case 'Код модели Domeo (Web)':
      return (props['Код модели Domeo (Web)'] ?? item.model ?? '').toString().trim();
    case 'Толщина, мм':
      return (props['Толщина, мм'] ?? props['Толщина/мм'] ?? '').toString().trim();
    case 'Стекло (тип)':
      return (props['Стекло'] ?? (item as any).glassType ?? '').toString().trim();
    case 'Кромка в базе':
      return (props['Domeo_Кромка_в_базе_включена'] ?? (item as any).edgeInBase ?? '').toString().trim();
    case 'Стиль':
      return (props['Domeo_Стиль Web'] ?? item.style ?? '').toString().trim();
    case 'Комплект фурнитуры':
      return (item.hardwareKitName ?? item.hardware ?? '').toString().trim();
    default:
      return (props[fieldName] ?? '').toString().trim();
  }
}
