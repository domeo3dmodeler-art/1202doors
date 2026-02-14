import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';

// GET /api/quotes - Получить все КП (упрощенная версия)
async function getHandler(
  request: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const parent_document_id = searchParams.get('parent_document_id');
  const limit = parseInt(searchParams.get('limit') || '100');
  const offset = parseInt(searchParams.get('offset') || '0');

  const where: Record<string, unknown> = {};
  
  if (status && status !== 'all') {
    where.status = status;
  }

  if (parent_document_id) {
    where.parent_document_id = parent_document_id;
  }

  const [quotes, total] = await Promise.all([
    prisma.quote.findMany({
      where,
      select: {
        id: true,
        number: true,
        client_id: true,
        status: true,
        total_amount: true,
        currency: true,
        valid_until: true,
        notes: true,
        created_at: true,
        updated_at: true,
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            phone: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      },
      take: limit,
      skip: offset
    }),
    prisma.quote.count({ where })
  ]);

  // Форматируем данные КП (без items пока)
  const processedQuotes = quotes.map(quote => ({
    id: quote.id,
    number: quote.number,
    clientId: quote.client_id,
    clientName: `${quote.client.lastName} ${quote.client.firstName} ${quote.client.middleName || ''}`.trim(),
    status: quote.status,
    total: quote.total_amount,
    currency: quote.currency,
    discount: 0, // Поле discount_percent отсутствует в схеме
    validUntil: quote.valid_until,
    notes: quote.notes,
    createdAt: quote.created_at,
    updatedAt: quote.updated_at,
    acceptedAt: null, // Поле accepted_at отсутствует в схеме
    items: [] // Пока пустой массив
  }));

  return apiSuccess({
    quotes: processedQuotes,
    pagination: {
      total,
      limit,
      offset
    }
  });
}

export const GET = withErrorHandling(
  requireAuth(getHandler),
  'quotes/GET'
);

// POST /api/quotes - Создать новое КП (упрощенная версия)
// ⚠️ DEPRECATED: Используйте POST /api/documents/create с parent_document_id = orderId
// Этот endpoint создает Quote напрямую без Order, что не соответствует текущей логике Order-first
// Для правильной работы создайте Order через POST /api/orders, затем Quote через POST /api/documents/create
async function postHandler(
  request: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const body = await request.json();
  const { 
    client_id, 
    status, 
    total_amount, 
    currency, 
    valid_until, 
    notes 
  } = body;

  if (!client_id || !status || !total_amount) {
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Не указаны обязательные поля: client_id, status, total_amount',
      400
    );
  }

  // Генерируем номер КП
  const quoteCount = await prisma.quote.count();
  const quoteNumber = `KP-${String(quoteCount + 1).padStart(3, '0')}`;

  const quote = await prisma.quote.create({
    data: {
      number: quoteNumber,
      client_id,
      created_by: user.userId || 'system',
      status: status || 'DRAFT',
      total_amount: parseFloat(total_amount),
      currency: currency || 'RUB',
      valid_until: valid_until ? new Date(valid_until) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 дней по умолчанию
      notes
    },
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true
        }
      }
    }
  });

  return apiSuccess({
    quote: {
      id: quote.id,
      number: quote.number,
      clientId: quote.client_id,
      clientName: `${quote.client.lastName} ${quote.client.firstName} ${quote.client.middleName || ''}`.trim(),
      status: quote.status,
      total: quote.total_amount,
      currency: quote.currency,
      discount: 0, // Поле discount_percent отсутствует в схеме
      validUntil: quote.valid_until,
      notes: quote.notes,
      createdAt: quote.created_at,
      items: [] // Пока пустой массив
    }
  });
}

export const POST = withErrorHandling(
  requireAuth(postHandler),
  'quotes/POST'
);