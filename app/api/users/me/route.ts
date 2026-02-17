import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRoleDisplayName, getRoleIcon, getRoleColor } from '@/lib/auth/roles';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { UnauthorizedError, NotFoundError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// GET /api/users/me - Получение информации о текущем пользователе
async function getHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);

  // Получаем пользователя из базы данных
  const dbUser = await prisma.user.findUnique({
    where: { id: user.userId },
    select: {
      id: true,
      email: true,
      first_name: true,
      last_name: true,
      middle_name: true,
      role: true,
      is_active: true,
      last_login: true,
      created_at: true
    }
  });

  if (!dbUser) {
    throw new NotFoundError('Пользователь', user.userId);
  }

  if (!dbUser.is_active) {
    throw new UnauthorizedError('Аккаунт заблокирован');
  }

  // Форматируем данные пользователя
  const userData = {
    id: dbUser.id,
    email: dbUser.email,
    firstName: dbUser.first_name,
    lastName: dbUser.last_name,
    middleName: dbUser.middle_name,
    role: dbUser.role.toLowerCase(),
    roleDisplayName: getRoleDisplayName(dbUser.role.toLowerCase()),
    roleIcon: getRoleIcon(dbUser.role.toLowerCase()),
    roleColor: getRoleColor(dbUser.role.toLowerCase()),
    isActive: dbUser.is_active,
    lastLogin: dbUser.last_login,
    createdAt: dbUser.created_at
  };

  return apiSuccess({ user: userData });
}

export const GET = withErrorHandling(
  requireAuth(getHandler),
  'users/me/GET'
);
