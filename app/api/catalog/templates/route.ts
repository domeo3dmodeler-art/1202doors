import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import type { AuthenticatedUser } from '@/lib/auth/request-helpers';

// GET /api/catalog/templates - Получить все шаблоны
async function getHandler(
  request: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get('categoryId');

  const where = categoryId ? { catalog_category_id: categoryId } : {};

  const templates = await prisma.importTemplate.findMany({
    where,
    include: {
      catalog_category: {
        select: {
          id: true,
          name: true,
          level: true,
          path: true
        }
      }
    },
    orderBy: {
      created_at: 'desc'
    }
  });

  return apiSuccess({ templates });
}

export const GET = withErrorHandling(
  requireAuth(getHandler),
  'catalog/templates/GET'
);

// POST /api/catalog/templates - Создать новый шаблон
async function postHandler(
  request: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const body = await request.json();
  const { catalog_category_id, name, required_fields, calculator_fields, export_fields } = body;

  if (!catalog_category_id || !name) {
    throw new ValidationError('Не указаны обязательные поля: catalog_category_id, name');
  }

  const template = await prisma.importTemplate.create({
    data: {
      catalog_category_id,
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

  return apiSuccess({ template }, 'Шаблон создан', 201);
}

export const POST = withErrorHandling(
  requireAuth(postHandler),
  'catalog/templates/POST'
);
