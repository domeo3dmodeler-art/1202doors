import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canTransitionTo } from '@/lib/validation/status-transitions';
import { canUserChangeStatus } from '@/lib/auth/permissions';
import { sendStatusNotification } from '@/lib/notifications/status-notifications';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, InvalidStateError, ForbiddenError } from '@/lib/api/errors';
import { changeStatusSchema } from '@/lib/validation/status.schemas';
import { validateRequest } from '@/lib/validation/middleware';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// PATCH /api/documents/[id]/status - Изменение статуса документа
async function handler(
  req: NextRequest, 
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
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

  const { status } = validation.data;

  logger.debug('Изменение статуса документа', 'documents/[id]/status', { id, status, userId: user.userId }, loggingContext);

  // ВАЖНО: Invoice и Quote не имеют статусов, ищем только Order и SupplierOrder
  let document = null;
  let documentType: 'order' | 'supplier_order' | null = null;

  // Проверяем в таблице заказов
  const order = await prisma.order.findUnique({
    where: { id }
  });

  if (order) {
    document = order;
    documentType = 'order';
  } else {
    // Проверяем в таблице заказов поставщиков
    const supplierOrder = await prisma.supplierOrder.findUnique({
      where: { id }
    });

    if (supplierOrder) {
      document = supplierOrder;
      documentType = 'supplier_order';
    }
  }

  if (!document || !documentType) {
    throw new NotFoundError('Документ', id);
  }

  // Проверяем права на изменение статуса
  if (!canUserChangeStatus(user.role, documentType, document.status, status)) {
    throw new ForbiddenError('Недостаточно прав для изменения статуса');
  }

  // Проверяем возможность перехода статуса
  if (!canTransitionTo(documentType, document.status, status)) {
    throw new InvalidStateError('Недопустимый переход статуса', {
      currentStatus: document.status,
      newStatus: status,
      documentType: documentType
    });
  }

  // Сохраняем старый статус для уведомлений
  const oldStatus = document.status;

  // Обновляем документ (только Order и SupplierOrder имеют статусы)
  let updatedDocument;
  if (documentType === 'order') {
    updatedDocument = await prisma.order.update({
      where: { id },
      data: { 
        status,
        updated_at: new Date()
      }
    });
  } else if (documentType === 'supplier_order') {
    updatedDocument = await prisma.supplierOrder.update({
      where: { id },
      data: { 
        status,
        updated_at: new Date()
      }
    });
  }

  logger.info('Статус документа изменен', 'documents/[id]/status', { id, oldStatus, newStatus: status, documentType, userId: user.userId }, loggingContext);

  // Отправляем уведомления
  try {
    // Для документов получаем complectator_id и executor_id, если они есть
    const complectatorId = (document as any).complectator_id || null;
    const executorId = (document as any).executor_id || null;
    await sendStatusNotification(
      id,
      documentType,
      document.number || document.id,
      oldStatus,
      status,
      (document as any).client_id || '',
      complectatorId,
      executorId,
      undefined
    );
  } catch (notificationError) {
    logger.warn('Не удалось отправить уведомления', 'documents/[id]/status', { error: notificationError }, loggingContext);
    // Не прерываем выполнение, если не удалось отправить уведомления
  }

  return apiSuccess(
    { document: updatedDocument },
    'Статус документа успешно изменен'
  );
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth(async (request: NextRequest, user: AuthenticatedUser) => {
      return await handler(request, user, { params });
    }),
    'documents/[id]/status'
  )(req);
}