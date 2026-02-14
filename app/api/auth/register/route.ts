import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { getRolePermissions } from '@/lib/auth/roles';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api/response';
import { ValidationError, ConflictError } from '@/lib/api/errors';

async function postHandler(req: NextRequest): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { email, password, firstName, lastName, middleName, role } = await req.json();

  if (!email || !password || !firstName || !lastName || !role) {
    throw new ValidationError('Все обязательные поля должны быть заполнены');
  }

  // Проверяем, что пользователь с таким email не существует
  const existingUser = await prisma.user.findUnique({
    where: { email }
  });
  
  if (existingUser) {
    throw new ConflictError('Пользователь с таким email уже существует');
  }

  // Валидация пароля
  if (password.length < 6) {
    throw new ValidationError('Пароль должен быть не короче 6 символов');
  }

  // Валидация роли
  const validRoles = ['admin', 'complectator', 'executor'];
  if (!validRoles.includes(role)) {
    throw new ValidationError('Недопустимая роль пользователя');
  }

  // Хешируем пароль
  const passwordHash = await bcrypt.hash(password, 12);

  // Создаем нового пользователя в базе данных
  const newUser = await prisma.user.create({
    data: {
      email,
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
      middle_name: middleName || null,
      role: role.toUpperCase(),
      is_active: true
    },
    select: {
      id: true,
      email: true,
      first_name: true,
      last_name: true,
      middle_name: true,
      role: true,
      is_active: true,
      created_at: true
    }
  });

  // Возвращаем данные пользователя (без пароля)
  const userData = {
    id: newUser.id,
    email: newUser.email,
    firstName: newUser.first_name,
    lastName: newUser.last_name,
    middleName: newUser.middle_name,
    role: newUser.role.toLowerCase(),
    isActive: newUser.is_active,
    createdAt: newUser.created_at
  };

  logger.info('Пользователь успешно создан', 'auth/register/POST', { userId: newUser.id, email }, loggingContext);

  return apiSuccess({
    message: 'Пользователь успешно создан',
    user: userData
  });
}

export const POST = withErrorHandling(postHandler, 'auth/register/POST');