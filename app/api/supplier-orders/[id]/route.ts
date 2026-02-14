import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, withErrorHandling } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// GET /api/supplier-orders/[id] - Получить заказ у поставщика по ID
async function getHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  
  const supplierOrder = await prisma.supplierOrder.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      parent_document_id: true,
      client_id: true,
      created_by: true,
      status: true,
      order_date: true,
      delivery_date: true,
      subtotal: true,
      tax_amount: true,
      total_amount: true,
      currency: true,
      notes: true,
      cart_data: true,
      created_at: true,
      updated_at: true,
      client: true,
      order: true
    }
  });

  if (!supplierOrder) {
    throw new NotFoundError('Заказ поставщика', id);
  }

  return apiSuccess({ supplierOrder });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((req, user) => getHandler(req, user, { params })),
    'supplier-orders/[id]/GET'
  )(req);
}

// PATCH /api/supplier-orders/[id] - Обновить заказ у поставщика
async function patchHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  const body = await req.json();
  
  // Проверяем, существует ли заказ у поставщика
  const existingSupplierOrder = await prisma.supplierOrder.findUnique({
    where: { id }
  });

  if (!existingSupplierOrder) {
    throw new NotFoundError('Заказ поставщика', id);
  }

  // Обновляем заказ у поставщика
  const updatedSupplierOrder = await prisma.supplierOrder.update({
    where: { id },
    data: body,
    include: {
      client: true,
      order: true
    }
  });

  return apiSuccess(
    { supplierOrder: updatedSupplierOrder },
    'Заказ поставщика успешно обновлен'
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((req, user) => patchHandler(req, user, { params })),
    'supplier-orders/[id]/PATCH'
  )(req);
}

// DELETE /api/supplier-orders/[id] - Удалить заказ у поставщика
async function deleteHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  
  // Проверяем, существует ли заказ у поставщика
  const existingSupplierOrder = await prisma.supplierOrder.findUnique({
    where: { id }
  });

  if (!existingSupplierOrder) {
    throw new NotFoundError('Заказ поставщика', id);
  }

  // Удаляем заказ у поставщика (cascade удалит связанные записи)
  await prisma.supplierOrder.delete({
    where: { id }
  });

  return apiSuccess(null, 'Заказ поставщика успешно удален');
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((req, user) => deleteHandler(req, user, { params })),
    'supplier-orders/[id]/DELETE'
  )(req);
}
