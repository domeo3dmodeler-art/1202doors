import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isValidInternationalPhone, normalizePhoneForStorage } from '@/lib/utils/phone';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError, BusinessRuleError, UnauthorizedError } from '@/lib/api/errors';
import { createClientSchema, findClientsSchema } from '@/lib/validation/client.schemas';
import { validateRequest } from '@/lib/validation/middleware';
import { clientRepository } from '@/lib/repositories/client.repository';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// GET /api/clients - получить список клиентов
async function getHandler(
  request: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  
  // Проверяем, что user и userId определены
  if (!user || !user.userId) {
    logger.error('User or userId is undefined', 'clients/GET', { user }, loggingContext);
    return apiError(
      ApiErrorCode.UNAUTHORIZED,
      'Пользователь не авторизован',
      401
    );
  }
  
  const { searchParams } = new URL(request.url);
  const queryParams: Record<string, unknown> = {};
  
  if (searchParams.get('page')) {
    queryParams.page = parseInt(searchParams.get('page') || '1');
  }
  if (searchParams.get('limit')) {
    queryParams.limit = parseInt(searchParams.get('limit') || '20');
  }
  if (searchParams.get('search')) {
    queryParams.search = searchParams.get('search');
  }
  if (searchParams.get('isActive')) {
    queryParams.isActive = searchParams.get('isActive') === 'true';
  }

  // Валидация query параметров
  const validation = validateRequest(findClientsSchema, queryParams);
  if (!validation.success) {
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Ошибка валидации параметров запроса',
      400,
      validation.errors
    );
  }

  try {
    // Проверяем подключение к БД
    try {
      await prisma.$connect();
    } catch (connectError) {
      logger.error('Database connection error', 'clients/GET', { 
        error: connectError instanceof Error ? connectError.message : String(connectError)
      }, loggingContext);
      throw connectError;
    }

    // Проверяем существование таблицы clients перед запросом
    let clients: any[] = [];
    let total = 0;
    try {
      // Попытка выполнить простой запрос, чтобы проверить существование таблицы
      total = await prisma.client.count();
      const result = await clientRepository.findMany(validation.data);
      clients = result.clients;
      total = result.total;
    } catch (queryError) {
      const errorMessage = queryError instanceof Error ? queryError.message : String(queryError);
      const errorCode = queryError && typeof queryError === 'object' && 'code' in queryError ? String(queryError.code) : undefined;
      
      logger.warn('Client table might not exist or query failed', 'clients/GET', { 
        error: errorMessage,
        code: errorCode,
        userId: user?.userId,
        hint: "Возможно, таблица 'clients' не существует. Выполните 'npx prisma migrate dev' или 'npx prisma db push'."
      }, loggingContext);
      
      // Если таблица не существует, возвращаем пустой массив вместо ошибки
      return apiSuccess({
        clients: [],
        pagination: {
          page: validation.data.page || 1,
          limit: validation.data.limit || 20,
          total: 0,
          totalPages: 0
        }
      });
    }
    
    return apiSuccess({
      clients,
      pagination: {
        page: validation.data.page || 1,
        limit: validation.data.limit || 20,
        total,
        totalPages: Math.ceil(total / (validation.data.limit || 20))
      }
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;
    
    logger.error('Error fetching clients', 'clients/GET', { 
      error: errorMessage,
      code: errorCode,
      stack: error instanceof Error ? error.stack : undefined
    }, loggingContext);
    
    // Более детальная обработка ошибок
    if (errorCode === 'P1001') {
      throw new BusinessRuleError('Не удается подключиться к базе данных. Проверьте SSH туннель.');
    }
    
    // В development возвращаем детали ошибки
    if (process.env.NODE_ENV === 'development') {
      const errorDetails: any = {
        message: errorMessage,
        code: errorCode
      };
      
      // Добавляем stack trace в development
      if (error instanceof Error && error.stack) {
        errorDetails.stack = error.stack.split('\n').slice(0, 10).join('\n'); // Первые 10 строк
      }
      
      // Добавляем информацию о Prisma ошибках
      if (error && typeof error === 'object') {
        if ('meta' in error) {
          errorDetails.meta = error.meta;
        }
        if ('clientVersion' in error) {
          errorDetails.clientVersion = error.clientVersion;
        }
      }
      
      return apiError(
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        'Ошибка при получении клиентов',
        500,
        errorDetails
      );
    }
    
    throw error;
  }
}

// Обертка для обработки ошибок авторизации
async function getHandlerWithAuth(req: NextRequest): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  
  try {
    const user = await getAuthenticatedUser(req);
    return await getHandler(req, user);
  } catch (authError) {
    const errorMessage = authError instanceof Error ? authError.message : String(authError);
    const errorName = authError instanceof Error ? authError.name : undefined;
    
    logger.error('Auth error in getHandlerWithAuth', 'clients/GET', {
      error: errorMessage,
      name: errorName,
      stack: authError instanceof Error ? authError.stack : undefined
    }, loggingContext);
    
    // Если ошибка авторизации, возвращаем 401
    if (authError instanceof UnauthorizedError || 
        (authError instanceof Error && authError.name === 'UnauthorizedError') ||
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('не авторизован') ||
        errorMessage.includes('токен')) {
      return apiError(
        ApiErrorCode.UNAUTHORIZED,
        'Пользователь не авторизован',
        401,
        process.env.NODE_ENV === 'development' ? { 
          message: errorMessage,
          name: errorName 
        } : undefined
      );
    }
    
    // Для всех остальных ошибок возвращаем детали в development
    if (process.env.NODE_ENV === 'development') {
      return apiError(
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        'Ошибка при получении клиентов',
        500,
        {
          message: errorMessage,
          name: errorName,
          stack: authError instanceof Error ? authError.stack : undefined
        }
      );
    }
    
    // Иначе пробрасываем дальше
    throw authError;
  }
}

export const GET = withErrorHandling(
  getHandlerWithAuth,
  'clients/GET'
);

// POST /api/clients - создать нового клиента
async function postHandler(
  request: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const body = await request.json();

  // Валидация через Zod
  const validation = validateRequest(createClientSchema, body);
  if (!validation.success) {
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Ошибка валидации данных',
      400,
      validation.errors
    );
  }

  const validatedData = validation.data;

  // Валидация телефона
  if (!isValidInternationalPhone(validatedData.phone)) {
    throw new ValidationError('Неверный формат телефона. Используйте международный формат (например: +7 999 123-45-67)');
  }

  // Нормализуем телефон для хранения
  const normalizedPhone = normalizePhoneForStorage(validatedData.phone);

  try {
    const client = await clientRepository.create({
      ...validatedData,
      phone: normalizedPhone
    });

    return apiSuccess(
      {
        id: client.id,
        firstName: client.firstName,
        lastName: client.lastName,
        middleName: client.middleName,
        phone: client.phone,
        address: client.address,
        objectId: client.objectId,
        compilationLeadNumber: client.compilationLeadNumber,
        createdAt: client.createdAt
      },
      'Клиент успешно создан'
    );
  } catch (error: unknown) {
    logger.error('Error creating client', 'clients/POST', { error }, loggingContext);
    throw error;
  }
}

export const POST = withErrorHandling(
  requireAuth(postHandler),
  'clients/POST'
);