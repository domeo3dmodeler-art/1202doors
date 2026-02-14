import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canTransitionTo } from '@/lib/validation/status-transitions';
import { validateStatusTransitionRequirements } from '@/lib/validation/status-requirements';
import { canUserChangeStatus } from '@/lib/auth/permissions';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, InvalidStateError, BusinessRuleError } from '@/lib/api/errors';
import { changeStatusSchema } from '@/lib/validation/status.schemas';
import { validateRequest } from '@/lib/validation/middleware';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// PUT /api/supplier-orders/[id]/status - Изменение статуса заказа поставщика
async function handler(req: NextRequest, user: AuthenticatedUser, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  const body = await req.json();
  
  logger.debug('Updating supplier order status', 'supplier-orders/[id]/status', { id, status: body.status, body, userId: user.userId }, loggingContext);

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

  const { status, notes } = validation.data;

  const existingSupplierOrder = await prisma.supplierOrder.findUnique({
    where: { id },
    select: { id: true, status: true }
  });
  
  logger.debug('Found supplier order', 'supplier-orders/[id]/status', { supplierOrder: existingSupplierOrder }, loggingContext);

  if (!existingSupplierOrder) {
    throw new NotFoundError('Заказ у поставщика', id);
  }

  // Проверяем права на изменение статуса
  if (!canUserChangeStatus(user.role, 'supplier_order', existingSupplierOrder.status, status)) {
    throw new InvalidStateError('Недостаточно прав для изменения статуса');
  }

  // Валидация переходов статусов через общую функцию
  if (!canTransitionTo('supplier_order', existingSupplierOrder.status, status)) {
    throw new InvalidStateError('Недопустимый переход статуса', {
      currentStatus: existingSupplierOrder.status,
      newStatus: status,
      documentType: 'supplier_order'
    });
  }

  // Проверяем обязательные поля для перехода в новый статус
  const supplierOrderForValidation = await prisma.supplierOrder.findUnique({
    where: { id },
    select: {
      supplier_name: true,
      supplier_email: true,
      supplier_phone: true,
      cart_data: true
    }
  });

  if (supplierOrderForValidation) {
    const validationResult = validateStatusTransitionRequirements(
      'supplier_order',
      existingSupplierOrder.status,
      status,
      supplierOrderForValidation
    );

    if (!validationResult.valid) {
      throw new BusinessRuleError(validationResult.error || 'Не выполнены требования для перехода в новый статус');
    }
  }

  const updateData: { status: string; notes?: string } = { status };
  if (notes !== undefined) {
    updateData.notes = notes;
  }
  
  logger.debug('Updating supplier order with data', 'supplier-orders/[id]/status', { updateData }, loggingContext);

  const updatedSupplierOrder = await prisma.supplierOrder.update({
    where: { id },
    data: updateData
  });
  
  logger.info('Supplier order updated successfully', 'supplier-orders/[id]/status', { supplierOrder: updatedSupplierOrder, userId: user.userId }, loggingContext);

  // Сохраняем старый статус для уведомлений
  const oldStatus = existingSupplierOrder.status;

  // Отправляем уведомления через универсальную функцию
  try {
    const supplierOrderForNotification = await prisma.supplierOrder.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        status: true,
        parent_document_id: true
      }
    });

    if (supplierOrderForNotification && supplierOrderForNotification.parent_document_id) {
      const relatedOrder = await prisma.order.findUnique({
        where: { id: supplierOrderForNotification.parent_document_id },
        select: { id: true, invoice_id: true, client_id: true }
      });

      let clientId = relatedOrder?.client_id || '';

      if (relatedOrder && relatedOrder.invoice_id) {
        const invoice = await prisma.invoice.findUnique({
          where: { id: relatedOrder.invoice_id },
          select: {
            id: true,
            number: true,
            client_id: true
          }
        });
        clientId = invoice?.client_id || clientId;
      } else if (relatedOrder) {
        clientId = relatedOrder.client_id;
      }

      logger.debug('Отправка уведомления о смене статуса SupplierOrder', 'supplier-orders/[id]/status', {
        documentId: id,
        documentType: 'supplier_order',
        documentNumber: supplierOrderForNotification.number,
        oldStatus,
        newStatus: status,
        clientId: clientId
      }, loggingContext);
      
      const { sendStatusNotification } = await import('@/lib/notifications/status-notifications');
      // Для supplier-orders получаем complectator_id и executor_id из связанного order
      const relatedOrderForNotification = await prisma.order.findUnique({
        where: { id: supplierOrderForNotification.parent_document_id },
        select: { complectator_id: true, executor_id: true }
      });
      await sendStatusNotification(
        id,
        'supplier_order',
        supplierOrderForNotification.number || supplierOrderForNotification.id,
        oldStatus,
        status,
        clientId,
        relatedOrderForNotification?.complectator_id || null,
        relatedOrderForNotification?.executor_id || null,
        undefined
      );
      
      logger.info('Уведомление SupplierOrder отправлено успешно', 'supplier-orders/[id]/status', {}, loggingContext);
    } else {
      logger.warn('Could not find supplier order or parent document for notification', 'supplier-orders/[id]/status', { id }, loggingContext);
    }
  } catch (notificationError) {
    logger.error('Не удалось отправить уведомление SupplierOrder', 'supplier-orders/[id]/status', { 
      error: notificationError instanceof Error ? notificationError.message : String(notificationError),
      stack: notificationError instanceof Error ? notificationError.stack : undefined
    }, loggingContext);
    // Не прерываем выполнение, если не удалось отправить уведомление
  }

  return apiSuccess(
    {
      supplierOrder: {
        id: updatedSupplierOrder.id,
        status: updatedSupplierOrder.status
      }
    },
    `Статус заказа у поставщика изменен на "${status}"`
  );
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth(async (request: NextRequest, user: AuthenticatedUser) => {
      return await handler(request, user, { params });
    }),
    'supplier-orders/[id]/status'
  )(req);
}

// GET /api/supplier-orders/[id]/status - Получение статуса заказа поставщика
async function getHandler(req: NextRequest, user: AuthenticatedUser, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  
  const supplierOrder = await prisma.supplierOrder.findUnique({
    where: { id },
    select: { 
      id: true, 
      status: true, 
      supplier_name: true, 
      updated_at: true 
    }
  });
  
  if (!supplierOrder) {
    throw new NotFoundError('Заказ у поставщика', id);
  }
  
  return apiSuccess({
    id: supplierOrder.id,
    supplier_name: supplierOrder.supplier_name,
    status: supplierOrder.status,
    updated_at: supplierOrder.updated_at
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth(async (request: NextRequest, user: AuthenticatedUser) => {
      return await getHandler(request, user, { params });
    }),
    'supplier-orders/[id]/status'
  )(req);
}
