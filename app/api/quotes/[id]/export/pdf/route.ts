// api/quotes/[id]/export/pdf/route.ts
// API роут для экспорта КП в PDF

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateQuotePDF, getQuotePDFFilename } from '@/lib/pdf/quote-pdf';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// GET /api/quotes/[id]/export/pdf - Экспортировать КП в PDF
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
      title: true,
      status: true,
      items: true,
      total_amount: true,
      currency: true,
      clientInfo: true,
      notes: true,
      created_at: true,
      updated_at: true,
      accepted_at: true
    }
  });

  if (!quote) {
    throw new NotFoundError('КП', id);
  }

  // Преобразуем данные в формат для PDF
  const quoteData = {
    ...quote,
    total: Number(quote.total_amount),
    items: JSON.parse(JSON.stringify(quote.items)),
    clientInfo: quote.clientInfo ? JSON.parse(JSON.stringify(quote.clientInfo)) : undefined,
    title: quote.title || undefined,
    notes: quote.notes || undefined,
    acceptedAt: quote.accepted_at?.toISOString() || undefined,
    createdAt: quote.created_at.toISOString(),
    updatedAt: quote.updated_at.toISOString(),
    status: quote.status as 'draft' | 'sent' | 'accepted' | 'rejected'
  };

  // Генерируем PDF
  const pdfBuffer = await generateQuotePDF(quoteData);
  const filename = getQuotePDFFilename(quoteData);

  // Возвращаем PDF файл
  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': pdfBuffer.length.toString(),
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((request, user) => getHandler(request, user, { params })),
    'quotes/[id]/export/pdf/GET'
  )(req);
}
