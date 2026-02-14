import { NextRequest, NextResponse } from 'next/server';
import { catalogService } from '@/lib/services/catalog.service';
import { CreateCatalogCategoryDto } from '@/lib/types/catalog';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import type { AuthenticatedUser } from '@/lib/auth/request-helpers';

// GET /api/catalog/categories - Получить дерево каталога
async function getHandler(
  request: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { searchParams } = new URL(request.url);
  const level = searchParams.get('level');
  const search = searchParams.get('search');

  if (level) {
    const categories = await catalogService.getCategoriesByLevel(parseInt(level));
    return apiSuccess(categories);
  }

  if (search) {
    const categories = await catalogService.searchCategories(search);
    return apiSuccess(categories);
  }

  const result = await catalogService.getCatalogTree();
  return apiSuccess(result);
}

export const GET = withErrorHandling(
  requireAuth(getHandler),
  'catalog/categories/GET'
);

// POST /api/catalog/categories - Создать новую категорию
async function postHandler(
  request: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const data: CreateCatalogCategoryDto = await request.json();

  // Валидация
  if (!data.name || data.name.trim().length === 0) {
    throw new ValidationError('Name is required');
  }

  const category = await catalogService.createCategory(data);
  return apiSuccess(category, 'Категория создана', 201);
}

export const POST = withErrorHandling(
  requireAuth(postHandler),
  'catalog/categories/POST'
);
