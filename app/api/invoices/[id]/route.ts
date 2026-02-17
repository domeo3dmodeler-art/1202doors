import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, withErrorHandling } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';
import { deleteDocumentCommentsAndHistory } from '@/lib/documents/delete-document-relations';

// GET /api/invoices/[id] - Получить счет по ID
async function getHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      parent_document_id: true,
      cart_session_id: true,
      client_id: true,
      created_by: true,
      status: true,
      invoice_date: true,
      due_date: true,
      subtotal: true,
      tax_amount: true,
      total_amount: true,
      currency: true,
      notes: true,
      cart_data: true,
      created_at: true,
      updated_at: true,
      client: true,
      invoice_items: true
    }
  });

  if (!invoice) {
    throw new NotFoundError('Счет', id);
  }

  return apiSuccess({ invoice });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth(async (request: NextRequest, user: AuthenticatedUser) => {
      return await getHandler(request, user, { params });
    }),
    'invoices/[id]/GET'
  )(req);
}

// PATCH /api/invoices/[id] - Обновить счет
async function patchHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  const body = await req.json();
  
  // Проверяем, существует ли счет
  const existingInvoice = await prisma.invoice.findUnique({
    where: { id }
  });

  if (!existingInvoice) {
    throw new NotFoundError('Счет', id);
  }

  // Обновляем счет
  const updatedInvoice = await prisma.invoice.update({
    where: { id },
    data: {
      ...body,
      // Заменяем order_id на parent_document_id если оно есть
      ...(body.order_id && { parent_document_id: body.order_id }),
      // Удаляем order_id из данных
      order_id: undefined
    },
    include: {
      client: true,
      invoice_items: true
    }
  });

  return apiSuccess({ invoice: updatedInvoice }, 'Счет успешно обновлен');
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth(async (request: NextRequest, user: AuthenticatedUser) => {
      return await patchHandler(request, user, { params });
    }),
    'invoices/[id]/PATCH'
  )(req);
}

// DELETE /api/invoices/[id] - Удалить счет
async function deleteHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  
  // Проверяем, существует ли счет
  const existingInvoice = await prisma.invoice.findUnique({
    where: { id }
  });

  if (!existingInvoice) {
    throw new NotFoundError('Счет', id);
  }

  await deleteDocumentCommentsAndHistory(id);
  await prisma.invoice.delete({
    where: { id }
  });

  return apiSuccess(null, 'Счет успешно удален');
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth(async (request: NextRequest, user: AuthenticatedUser) => {
      return await deleteHandler(request, user, { params });
    }),
    'invoices/[id]/DELETE'
  )(req);
}
