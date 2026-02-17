import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { canTransitionTo } from '@/lib/validation/status-transitions';
import { validateStatusTransitionRequirements } from '@/lib/validation/status-requirements';
import { canUserChangeStatus } from '@/lib/auth/permissions';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, InvalidStateError, BusinessRuleError, ForbiddenError } from '@/lib/api/errors';
import { changeStatusSchema } from '@/lib/validation/status.schemas';
import { validateRequest } from '@/lib/validation/middleware';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// PUT /api/orders/[id]/status - Изменение статуса заказа
async function handler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params;
  const loggingContext = getLoggingContextFromRequest(req);
  const body = await req.json();

  // Валидация через Zod
  const validation = validateRequest(changeStatusSchema, body);
  if (!validation.success) {
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Ошибка валидации данных',
      400,
      validation.errors
    );
  }

  const { status, notes, require_measurement } = validation.data;

  // Получаем текущий заказ
  const order = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      number: true,
      status: true,
      client_id: true,
      complectator_id: true,
      executor_id: true,
      notes: true,
      project_file_url: true,
      door_dimensions: true,
      measurement_done: true,
      project_complexity: true
    }
  });

  if (!order) {
    throw new NotFoundError('Заказ', id);
  }

  // Проверяем права на изменение статуса (передаем текущий и новый статус)
  if (!canUserChangeStatus(user.role, 'order', order.status, status)) {
    // Специальное сообщение для Комплектатора при попытке изменить статус исполнителя
    if (user.role === 'complectator' && ['NEW_PLANNED', 'UNDER_REVIEW', 'AWAITING_MEASUREMENT', 'AWAITING_INVOICE', 'COMPLETED'].includes(order.status)) {
      throw new ForbiddenError('Этот статус может изменять только Исполнитель');
    }
    
    throw new ForbiddenError('Недостаточно прав для изменения статуса');
  }

  // Валидация переходов статусов через общую функцию
  if (!canTransitionTo('order', order.status, status)) {
    throw new InvalidStateError('Недопустимый переход статуса', {
      currentStatus: order.status,
      newStatus: status,
      documentType: 'order'
    });
  }

  // Проверяем обязательные поля для перехода в новый статус
  const orderForValidation = await prisma.order.findUnique({
    where: { id },
    select: {
      project_file_url: true,
      door_dimensions: true,
      measurement_done: true,
      project_complexity: true
    }
  });

  if (orderForValidation) {
    // Парсим door_dimensions если это строка
    let doorDimensions = orderForValidation.door_dimensions;
    if (typeof doorDimensions === 'string') {
      try {
        doorDimensions = JSON.parse(doorDimensions);
      } catch (e) {
        doorDimensions = null;
      }
    }

    const docForValidation = {
      project_file_url: order.project_file_url,
      door_dimensions: doorDimensions,
      measurement_done: order.measurement_done,
      project_complexity: order.project_complexity
    };
    const validationResult = validateStatusTransitionRequirements(
      'order',
      order.status,
      status,
      docForValidation
    );

    if (!validationResult.valid) {
      logger.warn('Требования для перехода статуса не выполнены', 'orders/[id]/status', {
        orderId: id,
        currentStatus: order.status,
        newStatus: status,
        error: validationResult.error,
        hasProjectFile: !!order.project_file_url,
        projectFileUrlLength: order.project_file_url?.length ?? 0,
        hasDoorDimensions: Array.isArray(doorDimensions) ? doorDimensions.length > 0 : !!doorDimensions
      }, loggingContext);
      throw new BusinessRuleError(validationResult.error || 'Не выполнены требования для перехода в новый статус');
    }
  }

  // Если текущий статус UNDER_REVIEW и переходим в UNDER_REVIEW с require_measurement,
  // определяем следующий статус на основе require_measurement
  let targetStatus = status;
  if (order.status === 'UNDER_REVIEW' && status === 'UNDER_REVIEW' && require_measurement !== undefined) {
    targetStatus = require_measurement ? 'AWAITING_MEASUREMENT' : 'AWAITING_INVOICE';
  }

  // Формируем данные для обновления
  const updateData: { status: string; notes?: string } = {
    status: targetStatus
  };

  if (notes) {
    updateData.notes = notes;
  }

  // Сохраняем старый статус
  const oldStatus = order.status;

  // Обновляем заказ
  const updatedOrder = await prisma.order.update({
    where: { id },
    data: updateData,
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
    }
  });

  // Отправляем уведомления о смене статуса
  try {
    const { sendStatusNotification } = await import('@/lib/notifications/status-notifications');
    await sendStatusNotification(
      id,
      'order',
      order.number,
      oldStatus,
      targetStatus,
      order.client_id,
      order.complectator_id,
      order.executor_id,
      notes || undefined
    );
    logger.info('Уведомление о смене статуса заказа отправлено', 'orders/[id]/status', {
      orderId: id,
      oldStatus,
      newStatus: targetStatus,
      userId: user.userId,
      complectatorId: order.complectator_id,
      executorId: order.executor_id
    }, loggingContext);
  } catch (notificationError) {
    logger.warn('Не удалось отправить уведомление о смене статуса заказа', 'orders/[id]/status', {
      error: notificationError,
      orderId: id
    }, loggingContext);
    // Не прерываем выполнение, если не удалось отправить уведомление
  }

  logger.info('Статус заказа успешно изменен', 'orders/[id]/status', {
    orderId: id,
    oldStatus,
    newStatus: targetStatus,
    userId: user.userId
  }, loggingContext);

  return apiSuccess(
    { order: updatedOrder },
    'Статус заказа успешно изменен'
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth(async (request: NextRequest, user: AuthenticatedUser) => {
      return await handler(request, user, { params });
    }),
    'orders/[id]/status'
  )(req);
}

