import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api/response';
import { ValidationError, ConflictError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// GET /api/configurator/category-links/[id]/hierarchies - Получить иерархии для связи
async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { id } = await params;

  logger.debug('Получение иерархий для связи', 'configurator/category-links/[id]/hierarchies/GET', {
    configuratorLinkId: id
  }, loggingContext);

  const hierarchies = await prisma.additionalCategoryHierarchy.findMany({
    where: { configurator_link_id: id },
    include: {
      parent_category: {
        select: {
          id: true,
          name: true
        }
      },
      child_category: {
        select: {
          id: true,
          name: true
        }
      }
    },
    orderBy: {
      display_order: 'asc'
    }
  });

  logger.debug('Иерархии получены', 'configurator/category-links/[id]/hierarchies/GET', {
    hierarchiesCount: hierarchies.length
  }, loggingContext);

  return apiSuccess({ hierarchies });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(
    requireAuth(async (req: NextRequest, user: AuthenticatedUser) => {
      return await getHandler(req, { params }, user);
    }),
    'configurator/category-links/[id]/hierarchies/GET'
  )(request);
}

// POST /api/configurator/category-links/[id]/hierarchies - Создать иерархию
async function postHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { id } = await params;
  const body = await request.json();
  const { parent_category_id, child_category_id, display_order } = body;

  if (!parent_category_id || !child_category_id) {
    throw new ValidationError('Не указаны обязательные поля: parent_category_id и child_category_id');
  }

  logger.debug('Создание иерархии', 'configurator/category-links/[id]/hierarchies/POST', {
    configuratorLinkId: id,
    parentCategoryId: parent_category_id,
    childCategoryId: child_category_id,
    displayOrder: display_order
  }, loggingContext);

  // Проверяем, что иерархия не существует
  const existingHierarchy = await prisma.additionalCategoryHierarchy.findUnique({
    where: {
      configurator_link_id_parent_category_id_child_category_id: {
        configurator_link_id: id,
        parent_category_id,
        child_category_id
      }
    }
  });

  if (existingHierarchy) {
    throw new ConflictError('Иерархия уже существует');
  }

  const hierarchy = await prisma.additionalCategoryHierarchy.create({
    data: {
      configurator_link_id: id,
      parent_category_id,
      child_category_id,
      display_order: display_order || 0
    },
    include: {
      parent_category: {
        select: {
          id: true,
          name: true
        }
      },
      child_category: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });

  logger.info('Иерархия создана', 'configurator/category-links/[id]/hierarchies/POST', {
    hierarchyId: hierarchy.id
  }, loggingContext);

  return apiSuccess({ hierarchy });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return withErrorHandling(
    requireAuth(async (req: NextRequest, user: AuthenticatedUser) => {
      return await postHandler(req, { params }, user);
    }),
    'configurator/category-links/[id]/hierarchies/POST'
  )(request);
}
