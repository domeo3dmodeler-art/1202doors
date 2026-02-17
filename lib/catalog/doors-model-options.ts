/**
 * Каскадная фильтрация и сбор опций для model-options (без Prisma).
 * Используется API route и юнит-тестами.
 */

export type ProductLike = { properties: Record<string, unknown> };

export function getProductsByModelAndStyle(
  products: ProductLike[],
  modelCode: string,
  style?: string | null
): ProductLike[] {
  return products.filter((p) => {
    const code = String(p.properties['Код модели Domeo (Web)'] ?? '').trim();
    if (code !== modelCode) return false;
    if (style) {
      const s = String(p.properties['Domeo_Стиль Web'] ?? '').trim();
      if (s !== style) return false;
    }
    return true;
  });
}

export function filterByReversible(products: ProductLike[], reversible: boolean): ProductLike[] {
  if (!reversible) return products;
  return products.filter((p) => {
    const v = String(p.properties['Domeo_Опции_Реверс_доступен'] ?? '').toLowerCase();
    return v.includes('да');
  });
}

export function filterByFilling(products: ProductLike[], filling: string): ProductLike[] {
  if (!filling.trim()) return products;
  return products.filter((p) => {
    const v = String(p.properties['Domeo_Опции_Название_наполнения'] ?? '').trim();
    return v === filling;
  });
}

export function filterBySize(
  products: ProductLike[],
  width?: number | null,
  height?: number | null
): ProductLike[] {
  let out = products;
  if (width != null && width > 0) {
    out = out.filter((p) => Number(p.properties['Ширина/мм']) === width);
  }
  if (height != null && height > 0) {
    out = out.filter((p) => Number(p.properties['Высота/мм']) === height);
  }
  return out;
}

export function filterByFinish(products: ProductLike[], finish: string): ProductLike[] {
  if (!finish.trim()) return products;
  const norm = finish.trim().toLowerCase();
  return products.filter((p) => String(p.properties['Тип покрытия'] ?? '').trim().toLowerCase() === norm);
}

/** Цвет товара — только Цвет/Отделка (Domeo_Цвет устарел). */
function getCanonicalColor(properties: Record<string, unknown>): string {
  const v = properties['Цвет/Отделка'];
  return String(v ?? '').trim();
}

export function filterByColor(products: ProductLike[], color: string): ProductLike[] {
  if (!color.trim()) return products;
  return products.filter((p) => getCanonicalColor(p.properties || {}) === color);
}

export const HEIGHT_BAND_2301_2500 = 2350;
export const HEIGHT_BAND_2501_3000 = 2750;

export function heightForFilter(heightParam: number | null): number | null {
  if (heightParam == null || heightParam <= 0) return null;
  if (heightParam === HEIGHT_BAND_2301_2500 || heightParam === HEIGHT_BAND_2501_3000) return 2000;
  return heightParam;
}

export interface CollectedOptions {
  revers_available: boolean;
  fillings: string[];
  widths: number[];
  heights: number[];
  finishes: string[];
  colorsByFinish: Record<string, string[]>;
  edges: string[];
  mirror_available: boolean;
  threshold_available: boolean;
}

export function collectOptions(products: ProductLike[]): CollectedOptions {
  const revers_available = products.some((p) =>
    String(p.properties['Domeo_Опции_Реверс_доступен'] ?? '').toLowerCase().includes('да')
  );
  const fillings = new Set<string>();
  const widths = new Set<number>();
  const heights = new Set<number>();
  const finishes = new Set<string>();
  const colorsByFinish: Record<string, Set<string>> = {};
  const edges = new Set<string>();
  const mirror_available = products.some((p) =>
    String(p.properties['Domeo_Опции_Зеркало_доступно'] ?? '').toLowerCase().includes('да')
  );
  const threshold_available = products.some((p) =>
    String(p.properties['Domeo_Опции_Порог_доступен'] ?? '').toLowerCase().includes('да')
  );

  for (const p of products) {
    const filling = String(p.properties['Domeo_Опции_Название_наполнения'] ?? '').trim();
    if (filling) fillings.add(filling);

    const w = Number(p.properties['Ширина/мм']);
    const h = Number(p.properties['Высота/мм']);
    if (w > 0) widths.add(w);
    if (h > 0) heights.add(h);

    const finish = String(p.properties['Тип покрытия'] ?? '').trim();
    const color = getCanonicalColor(p.properties || {});
    if (finish) {
      finishes.add(finish);
      if (!colorsByFinish[finish]) colorsByFinish[finish] = new Set<string>();
      if (color) colorsByFinish[finish].add(color);
    }

    const edge = String(p.properties['Кромка'] ?? '').trim();
    if (edge && edge !== '-' && edge !== '') edges.add(edge);
    // Варианты кромки из листа «Наценка за кромку» (Domeo_Кромка_*), т.к. поле «Кромка» при импорте не заполняется
    const edgeInBase = String(p.properties['Domeo_Кромка_в_базе_включена'] ?? '').trim().toLowerCase() === 'да';
    if (edgeInBase) {
      const baseColor = String(p.properties['Domeo_Кромка_базовая_цвет'] ?? '').trim();
      if (baseColor) edges.add(baseColor);
      for (const i of [2, 3, 4] as const) {
        const colorVal = String(p.properties[`Domeo_Кромка_Цвет_${i}`] ?? '').trim();
        if (colorVal) edges.add(colorVal);
      }
    }
  }

  return {
    revers_available,
    fillings: Array.from(fillings).sort(),
    widths: Array.from(widths).sort((a, b) => a - b),
    heights: Array.from(heights).sort((a, b) => a - b),
    finishes: Array.from(finishes).sort(),
    colorsByFinish: Object.fromEntries(
      Object.entries(colorsByFinish).map(([k, v]) => [k, Array.from(v).sort()])
    ),
    edges: Array.from(edges).sort(),
    mirror_available,
    threshold_available
  };
}
