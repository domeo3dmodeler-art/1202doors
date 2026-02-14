import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// PUT /api/notifications/[id]/read - Отметить уведомление как прочитанное
async function putHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;

  // Обновляем уведомление
  const notification = await prisma.notification.updateMany({
    where: {
      id: id,
      user_id: user.userId // Убеждаемся, что пользователь может обновлять только свои уведомления
    },
    data: {
      is_read: true
    }
  });

  if (notification.count === 0) {
    throw new NotFoundError('Уведомление', id);
  }

  return apiSuccess({ success: true }, 'Уведомление отмечено как прочитанное');
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((request, user) => putHandler(request, user, { params })),
    'notifications/[id]/read/PUT'
  )(req);
}