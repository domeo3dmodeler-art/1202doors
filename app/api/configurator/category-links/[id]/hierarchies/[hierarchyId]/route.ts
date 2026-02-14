import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// PUT /api/configurator/category-links/[id]/hierarchies/[hierarchyId] - Обновить иерархию
async function putHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; hierarchyId: string }> },
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { id, hierarchyId } = await params;
  const body = await request.json();
  const { display_order } = body;

  logger.debug('Обновление иерархии', 'configurator/category-links/[id]/hierarchies/[hierarchyId]/PUT', {
    hierarchyId,
    displayOrder: display_order
  }, loggingContext);

  const hierarchy = await prisma.additionalCategoryHierarchy.update({
    where: { id: hierarchyId },
    data: {
      display_order
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

  logger.info('Иерархия обновлена', 'configurator/category-links/[id]/hierarchies/[hierarchyId]/PUT', {
    hierarchyId
  }, loggingContext);

  return apiSuccess({ hierarchy });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; hierarchyId: string }> }
) {
  return withErrorHandling(
    requireAuth(async (req: NextRequest, user: AuthenticatedUser) => {
      return await putHandler(req, { params }, user);
    }),
    'configurator/category-links/[id]/hierarchies/[hierarchyId]/PUT'
  )(request);
}

// DELETE /api/configurator/category-links/[id]/hierarchies/[hierarchyId] - Удалить иерархию
async function deleteHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; hierarchyId: string }> },
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { id, hierarchyId } = await params;

  logger.debug('Удаление иерархии', 'configurator/category-links/[id]/hierarchies/[hierarchyId]/DELETE', {
    hierarchyId
  }, loggingContext);

  await prisma.additionalCategoryHierarchy.delete({
    where: { id: hierarchyId }
  });

  logger.info('Иерархия удалена', 'configurator/category-links/[id]/hierarchies/[hierarchyId]/DELETE', {
    hierarchyId
  }, loggingContext);

  return apiSuccess({ message: 'Иерархия удалена' });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; hierarchyId: string }> }
) {
  return withErrorHandling(
    requireAuth(async (req: NextRequest, user: AuthenticatedUser) => {
      return await deleteHandler(req, { params }, user);
    }),
    'configurator/category-links/[id]/hierarchies/[hierarchyId]/DELETE'
  )(request);
}
