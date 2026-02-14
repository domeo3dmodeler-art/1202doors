import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

const DOORS_CATEGORY_NAME = 'Межкомнатные двери';

/**
 * Строит selection для конфигуратора дверей из properties_data товара.
 * Формат совпадает с ожиданием POST /api/price/doors и формы на /doors.
 */
function buildDoorsSelection(properties: Record<string, unknown>): Record<string, unknown> {
  const style = properties['Domeo_Стиль Web'] ?? properties['Стиль Domeo (Web)'];
  const model = properties['Код модели Domeo (Web)'] ?? properties['Артикул поставщика'] ?? properties['Domeo_Название модели для Web'];
  const finish = properties['Тип покрытия'];
  const color = properties['Domeo_Цвет'];
  const width = properties['Ширина/мм'];
  const height = properties['Высота/мм'];

  const selection: Record<string, unknown> = {
    style: style != null ? String(style).trim() : 'Классика',
    model: model != null ? String(model).trim() : '',
    finish: finish != null ? String(finish).trim() : 'Эмаль',
    color: color != null ? String(color).trim() : '',
    width: typeof width === 'number' ? width : (typeof width === 'string' ? parseInt(String(width), 10) : 800) || 800,
    height: typeof height === 'number' ? height : (typeof height === 'string' ? parseInt(String(height), 10) : 2000) || 2000
  };
  // Опции, если нужны для предзаполнения
  if (properties['Domeo_Кромка_базовая_цвет'] != null) {
    selection.edge_id = String(properties['Domeo_Кромка_базовая_цвет']).trim();
  }
  return selection;
}

/**
 * Универсальный fallback для не-дверей (ручки, наличники и т.д.).
 */
function buildGenericSelection(
  product: { model: string | null; series: string | null },
  properties: Record<string, unknown>
): Record<string, unknown> {
  return {
    style: (properties.style as string) || product.series || 'Классика',
    model: product.model || product.series || 'Стандарт',
    finish: (properties.finish as string) || 'Эмаль',
    color: (properties.color as string) || 'Белый',
    type: (properties.type as string) || 'Глухая',
    width: (properties.width as number) ?? 800,
    height: (properties.height as number) ?? 2000
  };
}

// GET /api/catalog/doors/sku-to-selection - Получить информацию о продукте по SKU
async function getHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { searchParams } = new URL(req.url);
  const sku = searchParams.get('sku');
  
  if (!sku) {
    return apiSuccess({
      message: "API для получения информации о продукте по SKU",
      usage: "Используйте GET запрос с параметром sku или POST запрос с телом { sku: 'SKU_CODE' }",
      example: {
        method: "GET",
        url: "/api/catalog/doors/sku-to-selection?sku=SKU_CODE"
      }
    });
  }

  const product = await prisma.product.findUnique({
    where: { sku },
    select: {
      id: true,
      sku: true,
      name: true,
      model: true,
      series: true,
      brand: true,
      base_price: true,
      properties_data: true,
      catalog_category: { select: { name: true } }
    }
  });

  if (!product) {
    return apiError(
      ApiErrorCode.NOT_FOUND,
      'Продукт не найден',
      404
    );
  }

  const properties: Record<string, unknown> = product.properties_data
    ? (typeof product.properties_data === 'string'
        ? JSON.parse(product.properties_data) as Record<string, unknown>
        : product.properties_data as Record<string, unknown>)
    : {};

  const isDoors = product.catalog_category?.name === DOORS_CATEGORY_NAME;
  const selection = isDoors
    ? buildDoorsSelection(properties)
    : buildGenericSelection(product, properties);

  logger.debug('sku-to-selection: выборка по SKU', 'catalog/doors/sku-to-selection/GET', {
    sku,
    isDoors,
    selectionModel: selection.model
  }, loggingContext);

  return apiSuccess({
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      model: product.model,
      series: product.series,
      brand: product.brand,
      base_price: product.base_price
    },
    selection
  });
}

export const GET = withErrorHandling(
  requireAuth(getHandler),
  'catalog/doors/sku-to-selection/GET'
);

export async function POST(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth(async (request, user) => {
      const loggingContext = getLoggingContextFromRequest(request);
      const body = await request.json();
      const { sku } = body;

      if (!sku) {
        throw new ValidationError('SKU не предоставлен');
      }

      const product = await prisma.product.findUnique({
        where: { sku },
        select: {
          id: true,
          sku: true,
          name: true,
          model: true,
          series: true,
          brand: true,
          base_price: true,
          properties_data: true,
          catalog_category: { select: { name: true } }
        }
      });

      if (!product) {
        throw new NotFoundError('Продукт', sku);
      }

      const properties: Record<string, unknown> = product.properties_data
        ? (typeof product.properties_data === 'string'
            ? JSON.parse(product.properties_data) as Record<string, unknown>
            : product.properties_data as Record<string, unknown>)
        : {};

      const isDoors = product.catalog_category?.name === DOORS_CATEGORY_NAME;
      const selection = isDoors
        ? buildDoorsSelection(properties)
        : buildGenericSelection(product, properties);

      return apiSuccess({ selection });
    }),
    'catalog/doors/sku-to-selection/POST'
  )(req);
}