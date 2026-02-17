import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, UnauthorizedError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';
import { documentService } from '@/lib/services/document.service';
import { createDocumentRequestSchema } from '@/lib/validation/document.schemas';
import type { CreateDocumentRequest } from '@/lib/types/documents';

// POST /api/orders - Создание нового заказа
async function postHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const body = await req.json();
  
  const { 
    invoice_id, 
    client_id, 
    lead_number, 
    complectator_id, 
    executor_id,
    parent_document_id,
    cart_session_id,
    items = [],
    total_amount,
    notes
  } = body;

  if (!client_id) {
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'client_id обязателен',
      400
    );
  }

  // Проверяем существование клиента
  const client = await prisma.client.findUnique({
    where: { id: client_id }
  });

  if (!client) {
    throw new NotFoundError('Клиент', client_id);
  }

  // Проверяем, что items не пустой
  if (!items || !Array.isArray(items) || items.length === 0) {
    logger.error('Empty or invalid items array in orders/POST', 'orders/POST', {
      items,
      client_id
    }, loggingContext);
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Корзина пуста. Добавьте товары в корзину перед созданием заказа.',
      400
    );
  }

  // Вычисляем total_amount из items
  const calculatedTotalAmount = items.reduce((sum: number, item: any) => {
    const qty = item.qty || item.quantity || 1;
    const price = item.unitPrice || item.price || 0;
    return sum + (qty * price);
  }, 0);

  // Комплектатор — тот, кто создал заказ (при создании подставляем текущего пользователя)
  const finalComplectatorId = user.userId && user.userId !== 'system'
    ? user.userId
    : (complectator_id || null);

  // Подготавливаем данные для DocumentService
  const documentRequest: CreateDocumentRequest = {
    type: 'order',
    parent_document_id: null, // Order - основной документ, parent_document_id всегда null
    cart_session_id: cart_session_id || undefined,
    client_id,
    items: items || [],
    total_amount: calculatedTotalAmount,
    subtotal: calculatedTotalAmount,
    tax_amount: 0,
    notes: notes || undefined,
    prevent_duplicates: true,
    created_by: user.userId || 'system'
  };

  // Валидация через Zod
  const validation = createDocumentRequestSchema.safeParse(documentRequest);
  if (!validation.success) {
    const errors = validation.error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
    logger.error('Validation error in orders/POST', 'orders/POST', {
      errors: validation.error.errors,
      documentRequest
    }, loggingContext);
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      `Ошибка валидации данных: ${errors}`,
      400
    );
  }

  // Используем DocumentService для создания заказа
  let result;
  try {
    logger.info('Creating order via documentService', 'orders/POST', {
      client_id,
      itemsCount: items.length,
      total_amount: calculatedTotalAmount
    }, loggingContext);
    result = await documentService.createDocument(validation.data);
  } catch (error) {
    logger.error('Error creating document via documentService', 'orders/POST', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      documentRequest: validation.data
    }, loggingContext);
    throw error;
  }

  // Если заказ был создан, обновляем complectator_id и lead_number
  if (result.isNew && result.id) {
    await prisma.order.update({
      where: { id: result.id },
      data: {
        complectator_id: finalComplectatorId,
        lead_number: lead_number || client.compilationLeadNumber || null,
        executor_id: executor_id || null
      }
    });

    // Отправляем уведомления о создании заказа
    try {
      const { notifyDocumentCreated } = await import('@/lib/notifications');
      const updatedOrder = await prisma.order.findUnique({
        where: { id: result.id },
        select: {
          number: true,
          complectator_id: true,
          executor_id: true
        }
      });
      if (updatedOrder) {
        await notifyDocumentCreated(
          'order',
          result.id,
          updatedOrder.number,
          client_id,
          updatedOrder.complectator_id,
          updatedOrder.executor_id
        );
      }
    } catch (notificationError) {
      logger.warn('Не удалось отправить уведомление о создании заказа', 'orders/POST', {
        error: notificationError,
        orderId: result.id
      }, loggingContext);
      // Не прерываем выполнение при ошибке уведомлений
    }
  }

  // Получаем созданный заказ с полными данными
  const order = await prisma.order.findUnique({
    where: { id: result.id },
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          phone: true,
          address: true
        }
      },
      invoice: {
        select: {
          id: true,
          number: true,
          status: true,
          total_amount: true
        }
      }
    }
  });

  if (!order) {
    throw new NotFoundError('Заказ', result.id);
  }

  // Форматируем данные заказа
  const formattedOrder = {
    id: order.id,
    number: order.number,
    client_id: order.client_id,
    invoice_id: order.invoice_id,
    lead_number: order.lead_number,
    complectator_id: order.complectator_id,
    executor_id: order.executor_id,
    status: order.status,
    project_file_url: order.project_file_url,
    door_dimensions: order.door_dimensions ? (() => {
      try {
        return JSON.parse(order.door_dimensions);
      } catch {
        return null;
      }
    })() : null,
    measurement_done: order.measurement_done,
    project_complexity: order.project_complexity,
    wholesale_invoices: order.wholesale_invoices ? (() => {
      try {
        return JSON.parse(order.wholesale_invoices);
      } catch {
        return [];
      }
    })() : [],
    technical_specs: order.technical_specs ? (() => {
      try {
        return JSON.parse(order.technical_specs);
      } catch {
        return [];
      }
    })() : [],
    verification_status: order.verification_status,
    verification_notes: order.verification_notes,
    notes: order.notes,
    created_at: order.created_at,
    updated_at: order.updated_at,
    client: {
      id: order.client.id,
      firstName: order.client.firstName,
      lastName: order.client.lastName,
      middleName: order.client.middleName,
      phone: order.client.phone,
      address: order.client.address,
      fullName: `${order.client.lastName} ${order.client.firstName}${order.client.middleName ? ' ' + order.client.middleName : ''}`
    },
    invoice: order.invoice
  };

  return apiSuccess(
    {
      order: formattedOrder,
      isNew: result.isNew
    },
    result.isNew ? 'Заказ успешно создан' : 'Использован существующий заказ'
  );
}

export const POST = withErrorHandling(
  requireAuth(postHandler),
  'orders/POST'
);

// GET /api/orders - Получение списка заказов
async function getHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  
  // Проверяем, что user и userId определены
  if (!user || !user.userId) {
    logger.error('User or userId is undefined', 'orders/GET', { user }, loggingContext);
    return apiError(
      ApiErrorCode.UNAUTHORIZED,
      'Пользователь не авторизован',
      401
    );
  }
  
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const executor_id = searchParams.get('executor_id');
  const client_id = searchParams.get('client_id');
  const complectator_id = searchParams.get('complectator_id'); // Для фильтра Руководителя
  const manager_id = searchParams.get('manager_id'); // Для определения, что запрос от Руководителя
  const date_from = searchParams.get('date_from'); // Фильтр по дате от
  const date_to = searchParams.get('date_to'); // Фильтр по дате до

  // Строим фильтр
  const where: Record<string, unknown> = {};

  if (status) {
    where.status = status;
  }

  if (client_id) {
    where.client_id = client_id;
  }

  // Фильтр по complectator_id (для Руководителя)
  if (complectator_id) {
    where.complectator_id = complectator_id;
  }

  // Фильтр по датам
  if (date_from || date_to) {
    where.created_at = {};
    if (date_from) {
      (where.created_at as Record<string, unknown>).gte = new Date(date_from);
    }
    if (date_to) {
      // Добавляем 23:59:59 к дате "до", чтобы включить весь день
      const dateToEnd = new Date(date_to);
      dateToEnd.setHours(23, 59, 59, 999);
      (where.created_at as Record<string, unknown>).lte = dateToEnd;
    }
  }

  // Фильтр по executor_id: для Исполнителя показываем только заказы со статусом PAID и выше
  // Для Руководителя показываем все заказы
  if (executor_id && !manager_id) {
    // Для Исполнителя: только заказы со статусом PAID и статусами исполнителя
    const executorStatuses = ['PAID', 'NEW_PLANNED', 'UNDER_REVIEW', 'AWAITING_MEASUREMENT', 'AWAITING_INVOICE', 'COMPLETED'];
    where.OR = [
      { 
        executor_id: executor_id,
        status: { in: executorStatuses }
      },
      { 
        executor_id: null,
        status: { in: executorStatuses }
      }
    ];
  }
  // Для Руководителя: все заказы (фильтр не применяется, если manager_id присутствует)

  try {
    // Проверяем подключение к БД
    try {
      await prisma.$connect();
    } catch (connectError) {
      logger.error('Database connection error', 'orders/GET', { 
        error: connectError instanceof Error ? connectError.message : String(connectError)
      }, loggingContext);
      throw connectError;
    }

    // Проверяем существование таблицы orders перед запросом
    try {
      // Попытка выполнить простой запрос, чтобы проверить существование таблицы
      await prisma.order.count();
    } catch (queryError) {
      const errorMessage = queryError instanceof Error ? queryError.message : String(queryError);
      const errorCode = queryError && typeof queryError === 'object' && 'code' in queryError ? String(queryError.code) : undefined;
      
      logger.warn('Order table might not exist or query failed', 'orders/GET', { 
        error: errorMessage,
        code: errorCode,
        userId: user?.userId,
        hint: "Возможно, таблица 'orders' не существует. Выполните 'npx prisma migrate dev' или 'npx prisma db push'."
      }, loggingContext);
      
      // Если таблица не существует, возвращаем пустой массив вместо ошибки
      return apiSuccess({ orders: [] });
    }

    // Получаем заказы
    let orders: any[] = [];
    try {
      orders = await prisma.order.findMany({
        where: where as any,
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              phone: true,
              address: true
            }
          },
          invoice: {
            select: {
              id: true,
              number: true,
              status: true,
              total_amount: true
            }
          }
        },
      orderBy: {
        created_at: 'desc'
      }
      });
    } catch (queryError) {
      const errorMessage = queryError instanceof Error ? queryError.message : String(queryError);
      const errorCode = queryError && typeof queryError === 'object' && 'code' in queryError ? String(queryError.code) : undefined;
      
      logger.error('Error fetching orders', 'orders/GET', { 
        error: errorMessage,
        code: errorCode,
        where: JSON.stringify(where),
        stack: queryError instanceof Error ? queryError.stack : undefined
      }, loggingContext);
      
      // В development возвращаем детали ошибки
      if (process.env.NODE_ENV === 'development') {
        return apiError(
          ApiErrorCode.INTERNAL_SERVER_ERROR,
          'Ошибка при получении заказов',
          500,
          {
            message: errorMessage,
            code: errorCode,
            where: where,
            hint: "Проверьте структуру фильтра where и убедитесь, что все поля существуют в схеме"
          }
        );
      }
      
      throw queryError;
    }

    // Получаем информацию о комплектаторах если есть complectator_id
    const complectatorIds = orders
      .map(order => order.complectator_id)
      .filter((id): id is string => id !== null);

    // Комплектатор — кто создал заказ; подставляем ФИО любого пользователя по id
    const complectators = complectatorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: complectatorIds } },
          select: {
            id: true,
            first_name: true,
            last_name: true,
            middle_name: true
          }
        })
      : [];

    const complectatorMap = new Map(
      complectators.map(c => [c.id, `${c.last_name} ${c.first_name.charAt(0)}.${c.middle_name ? c.middle_name.charAt(0) + '.' : ''}`])
    );

    // Получаем информацию об исполнителях если есть executor_id
    const executorIds = orders
      .map(order => order.executor_id)
      .filter((id): id is string => id !== null);

    const executors = executorIds.length > 0
      ? await prisma.user.findMany({
          where: {
            id: { in: executorIds }
            // Убираем фильтр по role, так как роль может быть другой или не задана
          },
          select: {
            id: true,
            first_name: true,
            last_name: true,
            middle_name: true,
            role: true
          }
        }).catch((error) => {
          logger.warn('Error fetching executors', 'orders/GET', { 
            error: error instanceof Error ? error.message : String(error),
            executorIds 
          }, loggingContext);
          return [];
        })
      : [];

    const executorMap = new Map(
      executors.map(e => [e.id, `${e.last_name} ${e.first_name.charAt(0)}.${e.middle_name ? e.middle_name.charAt(0) + '.' : ''}`])
    );

    // Форматируем данные заказов
    const formattedOrders = orders.map(order => ({
      id: order.id,
      number: order.number,
      client_id: order.client_id,
      invoice_id: order.invoice_id,
      lead_number: order.lead_number,
      complectator_id: order.complectator_id,
      complectator_name: order.complectator_id ? complectatorMap.get(order.complectator_id) || 'Не указан' : null,
      executor_id: order.executor_id,
      executor_name: order.executor_id ? executorMap.get(order.executor_id) || 'Не указан' : null,
      status: order.status,
      project_file_url: order.project_file_url,
      door_dimensions: order.door_dimensions ? (() => {
        try {
          return JSON.parse(order.door_dimensions);
        } catch {
          return null;
        }
      })() : null,
      measurement_done: order.measurement_done,
      project_complexity: order.project_complexity,
      wholesale_invoices: order.wholesale_invoices ? (() => {
        try {
          return JSON.parse(order.wholesale_invoices);
        } catch {
          return [];
        }
      })() : [],
      technical_specs: order.technical_specs ? (() => {
        try {
          return JSON.parse(order.technical_specs);
        } catch {
          return [];
        }
      })() : [],
      verification_status: order.verification_status,
      verification_notes: order.verification_notes,
      notes: order.notes,
      cart_data: order.cart_data, // Добавляем cart_data для дедубликации
      total_amount: order.total_amount, // Добавляем total_amount для дедубликации
      created_at: order.created_at,
      updated_at: order.updated_at,
      client: {
        id: order.client.id,
        firstName: order.client.firstName,
        lastName: order.client.lastName,
        middleName: order.client.middleName,
        phone: order.client.phone,
        address: order.client.address,
        fullName: `${order.client.lastName} ${order.client.firstName}${order.client.middleName ? ' ' + order.client.middleName : ''}`
      },
      invoice: order.invoice
    }));

    return apiSuccess({ orders: formattedOrders });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;
    
    logger.error('Error fetching orders', 'orders/GET', { 
      error: errorMessage,
      code: errorCode,
      stack: error instanceof Error ? error.stack : undefined
    }, loggingContext);
    
    // В development возвращаем детали ошибки
    if (process.env.NODE_ENV === 'development') {
      return apiError(
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        'Ошибка при получении заказов',
        500,
        {
          message: errorMessage,
          code: errorCode
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
    
    logger.error('Auth error in getHandlerWithAuth', 'orders/GET', {
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
        'Ошибка при получении заказов',
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
  'orders/GET'
);
