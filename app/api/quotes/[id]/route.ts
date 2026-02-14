import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, BusinessRuleError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// GET /api/quotes/[id] - Получить КП по ID
async function getHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  
  const quote = await prisma.quote.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      client_id: true,
      created_by: true,
      status: true,
      valid_until: true,
      subtotal: true,
      tax_amount: true,
      total_amount: true,
      currency: true,
      notes: true,
      terms: true,
      cart_data: true,
      created_at: true,
      updated_at: true,
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          phone: true,
          address: true
        }
      },
      quote_items: {
        select: {
          id: true,
          product_id: true,
          quantity: true,
          unit_price: true,
          total_price: true,
          notes: true
        }
      }
    }
  });

  if (!quote) {
    throw new NotFoundError('КП', id);
  }

  return apiSuccess({
    quote: {
      id: quote.id,
      number: quote.number,
      client_id: quote.client_id,
      created_by: quote.created_by,
      status: quote.status,
      valid_until: quote.valid_until,
      subtotal: quote.subtotal,
      tax_amount: quote.tax_amount,
      total_amount: quote.total_amount,
      currency: quote.currency,
      notes: quote.notes,
      terms: quote.terms,
      cart_data: quote.cart_data,
      created_at: quote.created_at,
      updated_at: quote.updated_at,
      client: quote.client,
      quote_items: quote.quote_items
    }
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth(async (request: NextRequest, user: AuthenticatedUser) => {
      return await getHandler(request, user, { params });
    }),
    'quotes/[id]/GET'
  )(req);
}

// PUT /api/quotes/[id] - Обновить КП
async function putHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  const body = await req.json();
  
  // Проверяем существование КП
  const existingQuote = await prisma.quote.findUnique({
    where: { id },
    select: { id: true, status: true }
  });

  if (!existingQuote) {
    throw new NotFoundError('КП', id);
  }

  // Подготавливаем данные для обновления
  const updateData: Record<string, unknown> = {};
  
  if (body.status !== undefined) updateData.status = body.status;
  if (body.notes !== undefined) updateData.notes = body.notes;
  if (body.terms !== undefined) updateData.terms = body.terms;
  if (body.cart_data !== undefined) updateData.cart_data = body.cart_data;

  const updatedQuote = await prisma.quote.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      number: true,
      client_id: true,
      created_by: true,
      status: true,
      valid_until: true,
      subtotal: true,
      tax_amount: true,
      total_amount: true,
      currency: true,
      notes: true,
      terms: true,
      cart_data: true,
      created_at: true,
      updated_at: true
    }
  });

  return apiSuccess({ quote: updatedQuote }, 'КП успешно обновлен');
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth(async (request: NextRequest, user: AuthenticatedUser) => {
      return await putHandler(request, user, { params });
    }),
    'quotes/[id]/PUT'
  )(req);
}

// DELETE /api/quotes/[id] - Удалить КП
async function deleteHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  
  // Проверяем существование КП
  const existingQuote = await prisma.quote.findUnique({
    where: { id },
    select: { id: true, status: true }
  });

  if (!existingQuote) {
    throw new NotFoundError('КП', id);
  }

  // Нельзя удалять принятые КП
  if (existingQuote.status === 'ACCEPTED') {
    throw new BusinessRuleError('Нельзя удалить принятый КП');
  }

  await prisma.quote.delete({
    where: { id }
  });

  return apiSuccess(null, 'КП успешно удален');
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth(async (request: NextRequest, user: AuthenticatedUser) => {
      return await deleteHandler(request, user, { params });
    }),
    'quotes/[id]/DELETE'
  )(req);
}
