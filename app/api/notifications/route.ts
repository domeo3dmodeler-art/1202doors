import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';
import { UnauthorizedError } from '@/lib/api/errors';

// GET /api/notifications - Получить уведомления пользователя
async function getHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);

  try {
    // Проверяем, что user и userId определены
    if (!user || !user.userId) {
      logger.error('User or userId is undefined', 'notifications/GET', { user }, loggingContext);
      return apiError(
        ApiErrorCode.UNAUTHORIZED,
        'Пользователь не авторизован',
        401
      );
    }

    // Проверяем подключение к БД
    try {
      await prisma.$connect();
    } catch (connectError) {
      logger.error('Database connection error', 'notifications/GET', { 
        error: connectError instanceof Error ? connectError.message : String(connectError)
      }, loggingContext);
      throw connectError;
    }

    // Получаем уведомления пользователя
    // Упрощаем запрос для SQLite - убираем include, так как это может вызывать проблемы
    let notifications;
    try {
      // Сначала проверяем, что таблица существует, выполняя простой запрос
      const count = await prisma.notification.count({
        where: { user_id: user.userId }
      });
      
      logger.debug('Notifications count', 'notifications/GET', { count, userId: user.userId }, loggingContext);
      
      // Затем получаем уведомления
      notifications = await prisma.notification.findMany({
        where: { user_id: user.userId },
        orderBy: { created_at: 'desc' },
        take: 50 // Ограничиваем количество
      });
    } catch (queryError) {
      const errorMessage = queryError instanceof Error ? queryError.message : String(queryError);
      const errorCode = queryError && typeof queryError === 'object' && 'code' in queryError ? String(queryError.code) : undefined;
      
      logger.error('Database query error', 'notifications/GET', { 
        error: errorMessage,
        userId: user.userId,
        code: errorCode,
        stack: queryError instanceof Error ? queryError.stack : undefined,
        prismaMeta: queryError && typeof queryError === 'object' && 'meta' in queryError ? queryError.meta : undefined
      }, loggingContext);
      
      // Если таблица не существует, возвращаем пустой массив
      if (errorCode === 'P2021' || errorMessage.includes('does not exist') || errorMessage.includes('no such table')) {
        logger.warn('Table notifications does not exist, returning empty array', 'notifications/GET', {}, loggingContext);
        return apiSuccess({ notifications: [] });
      }
      
      throw queryError;
    }
    
    // Если нужно, загружаем данные клиентов отдельно
    // Упрощаем - просто возвращаем уведомления без клиентов для начала
    // Это поможет избежать проблем с запросами к клиентам
    const notificationsWithClients = notifications.map(notification => ({
      ...notification,
      client: null // Пока не загружаем клиентов, чтобы избежать ошибок
    }));

    return apiSuccess({ notifications: notificationsWithClients });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;
    
    logger.error('Error fetching notifications', 'notifications/GET', { 
      error: errorMessage,
      code: errorCode,
      stack: error instanceof Error ? error.stack : undefined
    }, loggingContext);
    
    // В development возвращаем детали ошибки
    if (process.env.NODE_ENV === 'development') {
      return apiError(
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        'Ошибка при получении уведомлений',
        500,
        {
          message: errorMessage,
          code: errorCode,
          stack: error instanceof Error ? error.stack : undefined,
          prismaMeta: error && typeof error === 'object' && 'meta' in error ? error.meta : undefined,
          userId: user?.userId,
        }
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
    
    logger.error('Auth error in getHandlerWithAuth', 'notifications/GET', {
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
        'Ошибка при получении уведомлений',
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
  'notifications/GET'
);

// POST /api/notifications - Создать уведомление
async function postHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const body = await req.json();
  const { userId, clientId, documentId, type, title, message } = body;

  if (!userId || !type || !title || !message) {
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Отсутствуют обязательные поля: userId, type, title, message',
      400
    );
  }

  const notification = await prisma.notification.create({
    data: {
      user_id: userId,
      client_id: clientId || null,
      document_id: documentId || null,
      type,
      title,
      message,
      is_read: false,
      created_at: new Date()
    }
  });

  return apiSuccess({ notification }, 'Уведомление создано', 201);
}

export const POST = withErrorHandling(
  requireAuth(postHandler),
  'notifications/POST'
);