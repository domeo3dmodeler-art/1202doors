import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// GET /api/catalog/templates/[id] - Получить шаблон по ID
async function getHandler(
  request: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { id } = await params;
  
  const template = await prisma.importTemplate.findUnique({
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

  if (!template) {
    throw new NotFoundError('Шаблон', id);
  }

  return apiSuccess({ template });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((req, user) => getHandler(req, user, { params })),
    'catalog/templates/[id]/GET'
  )(request);
}

// PUT /api/catalog/templates/[id] - Обновить шаблон
async function putHandler(
  request: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { id } = await params;
  const body = await request.json();
  const { name, required_fields, calculator_fields, export_fields } = body;

  // Проверяем существование шаблона
  const existingTemplate = await prisma.importTemplate.findUnique({
    where: { id }
  });

  if (!existingTemplate) {
    throw new NotFoundError('Шаблон', id);
  }

  const template = await prisma.importTemplate.update({
    where: { id },
    data: {
      name,
      required_fields: JSON.stringify(required_fields || []),
      calculator_fields: JSON.stringify(calculator_fields || []),
      export_fields: JSON.stringify(export_fields || [])
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

  return apiSuccess({ template }, 'Шаблон обновлен');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((req, user) => putHandler(req, user, { params })),
    'catalog/templates/[id]/PUT'
  )(request);
}

// DELETE /api/catalog/templates/[id] - Удалить шаблон
async function deleteHandler(
  request: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { id } = await params;

  // Проверяем существование шаблона
  const existingTemplate = await prisma.importTemplate.findUnique({
    where: { id }
  });

  if (!existingTemplate) {
    throw new NotFoundError('Шаблон', id);
  }

  await prisma.importTemplate.delete({
    where: { id }
  });

  return apiSuccess({ message: 'Шаблон удален' }, 'Шаблон удален');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((req, user) => deleteHandler(req, user, { params })),
    'catalog/templates/[id]/DELETE'
  )(request);
}
