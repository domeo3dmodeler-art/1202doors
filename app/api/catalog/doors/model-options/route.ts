/**
 * Каскадные опции по выбранной модели и текущим фильтрам.
 * GET ?model=CODE&style=...&reversible=...&filling=...&width=...&height=...&finish=...&color=...
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDoorsCategoryId } from '@/lib/catalog-categories';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import {
  getProductsByModelAndStyle,
  filterByReversible,
  filterByFilling,
  filterBySize,
  filterByFinish,
  filterByColor,
  heightForFilter,
  collectOptions,
  type ProductLike
} from '@/lib/catalog/doors-model-options';

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
        : ((p.properties_data as Record<string, unknown>) || {})
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
  const heightRaw = heightParam ? parseInt(heightParam, 10) : null;
  const heightNum = heightRaw != null && !isNaN(heightRaw) ? heightRaw : null;
  const height = heightForFilter(heightNum);
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
