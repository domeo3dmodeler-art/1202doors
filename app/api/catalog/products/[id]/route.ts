import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, ConflictError, ValidationError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// GET /api/catalog/products/[id] - Получить товар по ID
async function getHandler(
  request: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { id } = await params;
  
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      catalog_category: {
        select: {
          id: true,
          name: true,
          level: true,
          path: true
        }
      }
    }
  });

  if (!product) {
    throw new NotFoundError('Товар', id);
  }

  return apiSuccess({ product });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((req, user) => getHandler(req, user, { params })),
    'catalog/products/[id]/GET'
  )(request);
}

// PUT /api/catalog/products/[id] - Обновить товар
async function putHandler(
  request: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { id } = await params;
  const body = await request.json();
  const { 
    catalog_category_id, 
    sku, 
    name, 
    description, 
    brand, 
    model, 
    series, 
    price, 
    properties_data 
  } = body;

  // Проверяем существование товара
  const existingProduct = await prisma.product.findUnique({
    where: { id }
  });

  if (!existingProduct) {
    throw new NotFoundError('Товар', id);
  }

  // Проверяем уникальность SKU (кроме текущего товара)
  if (sku && sku !== existingProduct.sku) {
    const duplicateProduct = await prisma.product.findFirst({
      where: { 
        sku,
        id: { not: id }
      }
    });

    if (duplicateProduct) {
      throw new ConflictError('Товар с таким SKU уже существует');
    }
  }

  const product = await prisma.product.update({
    where: { id },
    data: {
      catalog_category_id,
      sku,
      name,
      description: description ?? undefined,
      brand: brand ?? undefined,
      model: model ?? undefined,
      series: series ?? undefined,
      base_price: price ? parseFloat(price) : undefined,
      properties_data: properties_data ? JSON.stringify(properties_data) : undefined
    },
    include: {
      catalog_category: {
        select: {
          id: true,
          name: true,
          level: true,
          path: true
        }
      }
    }
  });

  return apiSuccess({ product }, 'Товар обновлен');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((req, user) => putHandler(req, user, { params })),
    'catalog/products/[id]/PUT'
  )(request);
}

// DELETE /api/catalog/products/[id] - Удалить товар
async function deleteHandler(
  request: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { id } = await params;

  // Проверяем существование товара
  const existingProduct = await prisma.product.findUnique({
    where: { id }
  });

  if (!existingProduct) {
    throw new NotFoundError('Товар', id);
  }

  await prisma.product.delete({
    where: { id }
  });

  return apiSuccess({ message: 'Товар удален' }, 'Товар удален');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((req, user) => deleteHandler(req, user, { params })),
    'catalog/products/[id]/DELETE'
  )(request);
}