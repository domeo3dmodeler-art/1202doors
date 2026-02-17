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
      edge_in_base: false,
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

  const debug = searchParams.get('debug') === '1';
  const debugSteps: { step: string; count: number; finishes: string[] }[] = [];

  function step(name: string, list: ProductLike[]) {
    const finishes = [...new Set(list.map((p) => String((p.properties || {})['Тип покрытия'] ?? '').trim()).filter(Boolean))].sort();
    if (debug) debugSteps.push({ step: name, count: list.length, finishes });
    return list;
  }

  let filtered = getProductsByModelAndStyle(withProps, model.trim(), style || undefined);
  step('1. Код модели Domeo (Web) + Domeo_Стиль Web', filtered);

  if (filtered.length === 0) {
    return apiSuccess({
      ...collectOptions([]),
      filteredCount: 0,
      ...(debug ? { debugSteps } : {}),
    });
  }

  if (reversibleParam === 'true') {
    filtered = filterByReversible(filtered, true);
    step('2. Реверс (да)', filtered);
  }

  if (filling) {
    filtered = filterByFilling(filtered, filling);
    step('3. Наполнение (Domeo_Опции_Название_наполнения)', filtered);
  }

  const width = widthParam ? parseInt(widthParam, 10) : null;
  const heightRaw = heightParam ? parseInt(heightParam, 10) : null;
  const heightNum = heightRaw != null && !isNaN(heightRaw) ? heightRaw : null;
  const height = heightForFilter(heightNum);

  if (width != null && !isNaN(width)) {
    filtered = filterBySize(filtered, width, null);
    step('4. Ширина/мм', filtered);
  }
  if (height != null && !isNaN(height)) {
    filtered = filterBySize(filtered, width ?? undefined, height);
    step('5. Высота/мм', filtered);
  }

  // Списки опций для селекторов (покрытие, наполнение, размеры) собираем ДО фильтра по покрытию/цвету,
  // иначе при выбранном покрытии в ответе будет только оно — и в UI отображается одно.
  const optionsAfterSize = collectOptions(filtered);

  if (finish) {
    filtered = filterByFinish(filtered, finish);
    step('6. Тип покрытия', filtered);
  }
  if (color) {
    filtered = filterByColor(filtered, color);
    step('7. Цвет', filtered);
  }

  const optionsAfterFinishColor = collectOptions(filtered);
  // Кромка в базе и список кромок — только по отфильтрованному набору (текущее покрытие/подмодель).
  // Base 1 объединяет 4 подмодели; при выборе ПЭТ остаётся одна (ДПГ Флекс Эмаль Порта ПТА-50 B) без кромки в базе — не подставляем edges с других покрытий.
  const edge_in_base = filtered.some(
    (p) => String((p.properties || {})['Domeo_Кромка_в_базе_включена'] ?? '').trim().toLowerCase() === 'да'
  );
  const edges = optionsAfterFinishColor.edges;

  return apiSuccess({
    revers_available: optionsAfterSize.revers_available,
    fillings: optionsAfterSize.fillings,
    widths: optionsAfterSize.widths,
    heights: optionsAfterSize.heights,
    finishes: optionsAfterSize.finishes,
    colorsByFinish: optionsAfterSize.colorsByFinish,
    edges,
    edge_in_base,
    mirror_available: optionsAfterSize.mirror_available,
    threshold_available: optionsAfterSize.threshold_available,
    filteredCount: filtered.length,
    ...(debug ? { debugSteps } : {}),
  });
}

export const GET = withErrorHandling(getHandler, 'catalog/doors/model-options/GET');
