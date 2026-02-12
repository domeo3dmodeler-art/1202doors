/**
 * Каскадные опции по выбранной модели и текущим фильтрам.
 * Опция доступна, если она есть хотя бы у одного товара в отфильтрованном наборе.
 * После выбора (реверс, наполнение, размер, покрытие, цвет и т.д.) последующие опции
 * считаются только по суженному набору товаров.
 *
 * GET ?model=CODE&style=...&reversible=true|false&filling=...&width=...&height=...&finish=...&color=...
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDoorsCategoryId } from '@/lib/catalog-categories';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';

type ProductLike = { properties: Record<string, unknown> };

function getProductsByModelAndStyle(
  products: ProductLike[],
  modelCode: string,
  style?: string | null
): ProductLike[] {
  return products.filter((p) => {
    const code = String(p.properties['Код модели Domeo (Web)'] ?? '').trim();
    const modelMatch = code === modelCode || p.properties['Domeo_Название модели для Web'] === modelCode;
    if (!modelMatch) return false;
    if (style) {
      const s = String(p.properties['Domeo_Стиль Web'] ?? '').trim();
      if (s !== style) return false;
    }
    return true;
  });
}

function filterByReversible(products: ProductLike[], reversible: boolean): ProductLike[] {
  if (!reversible) return products;
  return products.filter((p) => {
    const v = String(p.properties['Domeo_Опции_Реверс_доступен'] ?? '').toLowerCase();
    return v.includes('да');
  });
}

function filterByFilling(products: ProductLike[], filling: string): ProductLike[] {
  if (!filling.trim()) return products;
  return products.filter((p) => {
    const v = String(p.properties['Domeo_Опции_Название_наполнения'] ?? '').trim();
    return v === filling;
  });
}

function filterBySize(products: ProductLike[], width?: number | null, height?: number | null): ProductLike[] {
  let out = products;
  if (width != null && width > 0) {
    out = out.filter((p) => Number(p.properties['Ширина/мм']) === width);
  }
  if (height != null && height > 0) {
    out = out.filter((p) => Number(p.properties['Высота/мм']) === height);
  }
  return out;
}

function filterByFinish(products: ProductLike[], finish: string): ProductLike[] {
  if (!finish.trim()) return products;
  return products.filter((p) => String(p.properties['Тип покрытия'] ?? '').trim() === finish);
}

function filterByColor(products: ProductLike[], color: string): ProductLike[] {
  if (!color.trim()) return products;
  return products.filter((p) => String(p.properties['Domeo_Цвет'] ?? '').trim() === color);
}

function collectOptions(products: ProductLike[]) {
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
    const color = String(p.properties['Domeo_Цвет'] ?? '').trim();
    if (finish) {
      finishes.add(finish);
      if (!colorsByFinish[finish]) colorsByFinish[finish] = new Set<string>();
      if (color) colorsByFinish[finish].add(color);
    }

    const edge = String(p.properties['Кромка'] ?? '').trim();
    if (edge && edge !== '-' && edge !== '') edges.add(edge);
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
    threshold_available,
  };
}

async function getHandler(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const model = searchParams.get('model');
  const style = searchParams.get('style');
  const reversibleParam = searchParams.get('reversible');
  const filling = searchParams.get('filling');
  const widthParam = searchParams.get('width');
  const heightParam = searchParams.get('height');
  const finish = searchParams.get('finish');
  const color = searchParams.get('color');

  if (!model || !model.trim()) {
    return apiError(ApiErrorCode.VALIDATION_ERROR, 'Параметр model обязателен', 400);
  }

  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    return apiSuccess({
      revers_available: false,
      fillings: [],
      widths: [],
      heights: [],
      finishes: [],
      colorsByFinish: {},
      edges: [],
      mirror_available: false,
      threshold_available: false,
      filteredCount: 0,
    });
  }

  const products = await prisma.product.findMany({
    where: {
      catalog_category_id: doorsCategoryId,
      is_active: true,
    },
    select: { properties_data: true },
  });

  const withProps: ProductLike[] = products.map((p) => ({
    properties:
      typeof p.properties_data === 'string'
        ? (JSON.parse(p.properties_data) as Record<string, unknown>)
        : (p.properties_data as Record<string, unknown>) || {},
  }));

  let filtered = getProductsByModelAndStyle(withProps, model.trim(), style || undefined);
  if (filtered.length === 0) {
    return apiSuccess({
      ...collectOptions([]),
      filteredCount: 0,
    });
  }

  if (reversibleParam === 'true') {
    filtered = filterByReversible(filtered, true);
  }
  if (filling) {
    filtered = filterByFilling(filtered, filling);
  }
  const width = widthParam ? parseInt(widthParam, 10) : null;
  const height = heightParam ? parseInt(heightParam, 10) : null;
  if (width != null && !isNaN(width)) {
    filtered = filterBySize(filtered, width, null);
  }
  if (height != null && !isNaN(height)) {
    filtered = filterBySize(filtered, width ?? undefined, height);
  }
  if (finish) {
    filtered = filterByFinish(filtered, finish);
  }
  if (color) {
    filtered = filterByColor(filtered, color);
  }

  const options = collectOptions(filtered);

  return apiSuccess({
    ...options,
    filteredCount: filtered.length,
  });
}

export const GET = withErrorHandling(getHandler, 'catalog/doors/model-options/GET');
