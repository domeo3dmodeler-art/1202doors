import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import type { AuthenticatedUser } from '@/lib/auth/request-helpers';
import { apiValidator } from '@/lib/api-validator';
import { fixFieldEncoding } from '@/lib/encoding-utils';

// Временная реализация функции fixAllEncoding
function fixAllEncoding(data: any): any {
  if (typeof data === 'string') {
    return fixFieldEncoding(data);
  }
  
  if (Array.isArray(data)) {
    return data.map(fixAllEncoding);
  }
  
  if (typeof data === 'object' && data !== null) {
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      result[fixFieldEncoding(key)] = fixAllEncoding(value);
    }
    return result;
  }
  
  return data;
}

// Получить товар по ID
async function getHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  apiValidator.validateId(id, 'productId');

  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      catalog_category: true,
    },
  });

  if (!product) {
    throw new NotFoundError('Товар не найден');
  }

  // Исправляем кодировку
  const fixedProduct = fixAllEncoding(product);

  logger.debug('Товар получен', 'admin/products/[id]/GET', { productId: id }, loggingContext);

  return apiSuccess({ product: fixedProduct });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(
    requireAuthAndPermission(
      async (request: NextRequest, user: AuthenticatedUser) => {
        return await getHandler(request, user, { params });
      },
      'ADMIN'
    ),
    'admin/products/[id]/GET'
  )(req);
}

// Обновить товар
async function putHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  apiValidator.validateId(id, 'productId');

  const body = await req.json();
  const fixedBody = fixAllEncoding(body);

  const {
    name,
    sku,
    base_price,
    stock_quantity,
    properties_data,
    specifications,
    is_active,
    sort_order,
  } = fixedBody;

  // Проверяем существование товара
  const existingProduct = await prisma.product.findUnique({
    where: { id },
  });

  if (!existingProduct) {
    throw new NotFoundError('Товар не найден');
  }

  // Обновляем товар
  const updatedProduct = await prisma.product.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(sku && { sku }),
      ...(base_price !== undefined && { base_price: parseFloat(base_price) || 0 }),
      ...(stock_quantity !== undefined && { stock_quantity: parseInt(stock_quantity) || 0 }),
      ...(properties_data && { properties_data: JSON.stringify(properties_data) }),
      ...(specifications && { specifications: JSON.stringify(specifications) }),
      ...(is_active !== undefined && { is_active: Boolean(is_active) }),
      // sort_order удален из схемы Prisma, поэтому не обновляем его
      updated_at: new Date(),
    },
    include: {
      catalog_category: true,
    },
  });

  const fixedProduct = fixAllEncoding(updatedProduct);

  logger.info('Товар обновлен', 'admin/products/[id]/PUT', { productId: id }, loggingContext);

  return apiSuccess({ 
    message: 'Товар успешно обновлен',
    product: fixedProduct 
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(
    requireAuthAndPermission(
      async (request: NextRequest, user: AuthenticatedUser) => {
        return await putHandler(request, user, { params });
      },
      'ADMIN'
    ),
    'admin/products/[id]/PUT'
  )(req);
}

// Удалить товар
async function deleteHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  apiValidator.validateId(id, 'productId');

  // Проверяем существование товара
  const existingProduct = await prisma.product.findUnique({
    where: { id },
    include: {
      catalog_category: true,
    },
  });

  if (!existingProduct) {
    throw new NotFoundError('Товар не найден');
  }

  // Удаляем товар
  await prisma.product.delete({
    where: { id },
  });

  logger.info('Товар удален', 'admin/products/[id]/DELETE', { productId: id }, loggingContext);

  return apiSuccess({ 
    message: 'Товар успешно удален',
    deletedProduct: fixAllEncoding(existingProduct)
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(
    requireAuthAndPermission(
      async (request: NextRequest, user: AuthenticatedUser) => {
        return await deleteHandler(request, user, { params });
      },
      'ADMIN'
    ),
    'admin/products/[id]/DELETE'
  )(req);
}
