import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// GET /api/clients/[id]/documents - Получить документы клиента
async function getHandler(
  request: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || '';
  const status = searchParams.get('status') || '';

  const where: Record<string, unknown> = { clientId: id };
  if (type) where.type = type;
  if (status) where.status = status;

  const documents = await prisma.document.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      client: {
        select: {
          firstName: true,
          lastName: true,
          middleName: true,
          phone: true,
          address: true
        }
      }
    }
  });

  return apiSuccess({
    documents: documents.map(doc => ({
      ...doc,
      content: JSON.parse(doc.content || '{}'),
      documentData: doc.documentData ? JSON.parse(doc.documentData) : null
    }))
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((req, user) => getHandler(req, user, { params })),
    'clients/[id]/documents/GET'
  )(request);
}

// POST /api/clients/[id]/documents - Создать документ для клиента
async function postHandler(
  request: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { id } = await params;
  const data = await request.json();
  const { type, content, documentData } = data;

  if (!type || !content) {
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Отсутствуют обязательные поля: type, content',
      400
    );
  }

  const document = await prisma.document.create({
    data: {
      clientId: id,
      type,
      content: JSON.stringify(content),
      documentData: documentData ? JSON.stringify(documentData) : null,
      status: 'draft'
    }
  });

  return apiSuccess({
    document: {
      ...document,
      content: JSON.parse(document.content || '{}'),
      documentData: document.documentData ? JSON.parse(document.documentData) : null
    }
  }, 'Документ создан');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((req, user) => postHandler(req, user, { params })),
    'clients/[id]/documents/POST'
  )(request);
}

