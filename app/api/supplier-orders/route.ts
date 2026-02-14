import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateCartSessionId } from '@/lib/utils/cart-session';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';

// POST /api/supplier-orders - Создание заказа поставщика
async function postHandler(
  request: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const body = await request.json();
  const { invoiceId, orderId, supplierName, supplierEmail, supplierPhone, expectedDate, notes, cartData } = body;
  
  // SupplierOrder теперь создается на основе Order (не Invoice)
  // Поддержка orderId как основного параметра, invoiceId для обратной совместимости
  let finalOrderId = orderId;
  
  // Если передан invoiceId, находим связанный Order
  if (!finalOrderId && invoiceId) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { order_id: true }
    });
    if (invoice && invoice.order_id) {
      finalOrderId = invoice.order_id;
      logger.debug(`Найден Order для Invoice`, 'supplier-orders/POST', { orderId: finalOrderId, invoiceId }, loggingContext);
    }
  }
  
  logger.debug('Creating supplier order', 'supplier-orders/POST', { invoiceId, orderId: finalOrderId, supplierName, supplierEmail, supplierPhone, expectedDate, notes }, loggingContext);
  logger.debug('Received cartData', 'supplier-orders/POST', { cartData }, loggingContext);

  if (!finalOrderId) {
    logger.error('Missing orderId in request body', 'supplier-orders/POST', { body }, loggingContext);
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'orderId обязателен. SupplierOrder должен создаваться на основе Order.',
      400
    );
  }

  // Проверяем, что Order существует
  const order = await prisma.order.findUnique({
    where: { id: finalOrderId },
    select: { 
      id: true, 
      client_id: true, 
      cart_session_id: true,
      number: true,
      total_amount: true,
      cart_data: true,
      invoice: {
        select: {
          id: true,
          number: true,
          total_amount: true
        }
      }
    }
  });

  if (!order) {
    throw new NotFoundError('Заказ', finalOrderId);
  }

  // Генерируем cart_session_id для группировки документов
  const cartSessionId = order.cart_session_id || generateCartSessionId();
  
  // Проверяем, есть ли уже заказ у поставщика для этого Order
  const existingSupplierOrder = await prisma.supplierOrder.findFirst({
    where: {
      parent_document_id: finalOrderId, // Теперь используем orderId
      cart_session_id: cartSessionId
    },
    orderBy: { created_at: 'desc' }
  });

  let supplierOrder;
  
  if (existingSupplierOrder) {
    // Используем существующий заказ у поставщика
    logger.debug(`Используем существующий заказ у поставщика`, 'supplier-orders/POST', { supplierOrderId: existingSupplierOrder.id }, loggingContext);
    supplierOrder = existingSupplierOrder;
  } else {
    // Создаем новый заказ у поставщика
    logger.debug(`Создаем новый заказ у поставщика для Order`, 'supplier-orders/POST', { orderId: finalOrderId }, loggingContext);
    // Генерируем номер заказа у поставщика на основе номера Order или Invoice
    const sourceNumber = order.invoice?.number || order.number;
    const supplierOrderNumber = `SUPPLIER-${sourceNumber}`;
    
    // Вычисляем общую сумму из данных корзины или используем сумму Order/Invoice
    let totalAmount = 0;
    if (cartData && cartData.items && cartData.items.length > 0) {
      totalAmount = cartData.items.reduce((sum: number, item: any) => {
        const quantity = item.quantity || item.qty || 1;
        const price = item.unitPrice || item.price || 0;
        return sum + (quantity * price);
      }, 0);
    }
    
    // Если сумма из корзины равна 0 или корзина пустая, используем сумму Order или Invoice
    if (totalAmount === 0) {
      if (order.total_amount && order.total_amount > 0) {
        totalAmount = order.total_amount;
        logger.debug(`Используем сумму Order`, 'supplier-orders/POST', { totalAmount }, loggingContext);
      } else if (order.invoice?.total_amount && order.invoice.total_amount > 0) {
        totalAmount = order.invoice.total_amount;
        logger.debug(`Используем сумму Invoice`, 'supplier-orders/POST', { totalAmount }, loggingContext);
      }
    } else {
      logger.debug(`Используем сумму из корзины`, 'supplier-orders/POST', { totalAmount }, loggingContext);
    }

    supplierOrder = await prisma.supplierOrder.create({
      data: {
        number: supplierOrderNumber,
        parent_document_id: finalOrderId, // Теперь используем orderId
        cart_session_id: cartSessionId,
        executor_id: order.client_id,
        supplier_name: supplierName || 'Поставщик не указан',
        supplier_email: supplierEmail || '',
        supplier_phone: supplierPhone || '',
        status: 'PENDING',
        order_date: new Date(),
        expected_date: expectedDate ? new Date(expectedDate) : null,
        notes: notes || '',
        cart_data: cartData ? JSON.stringify(cartData) : (order.cart_data || null),
        total_amount: totalAmount,
        created_by: user.userId || 'system'
      }
    });
    
    logger.debug('Saved supplier order with cart_data', 'supplier-orders/POST', { cartData: supplierOrder.cart_data }, loggingContext);

    // Отправляем уведомления о создании заказа у поставщика
    try {
      const { notifyDocumentCreated } = await import('@/lib/notifications');
      const orderForNotification = await prisma.order.findUnique({
        where: { id: finalOrderId },
        select: {
          complectator_id: true,
          executor_id: true,
          client_id: true
        }
      });
      if (orderForNotification) {
        await notifyDocumentCreated(
          'supplier_order',
          supplierOrder.id,
          supplierOrder.number,
          orderForNotification.client_id,
          orderForNotification.complectator_id,
          orderForNotification.executor_id
        );
      }
    } catch (notificationError) {
      logger.warn('Не удалось отправить уведомление о создании заказа у поставщика', 'supplier-orders/POST', {
        error: notificationError instanceof Error ? notificationError.message : String(notificationError),
        supplierOrderId: supplierOrder.id
      }, loggingContext);
      // Не прерываем выполнение при ошибке уведомлений
    }
  }

  logger.info('Supplier order created', 'supplier-orders/POST', { supplierOrder }, loggingContext);

  return apiSuccess({ supplierOrder });
}

export const POST = withErrorHandling(
  requireAuth(postHandler),
  'supplier-orders/POST'
);

// GET /api/supplier-orders - Получение списка заказов поставщика
async function getHandler(
  request: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { searchParams } = new URL(request.url);
  const invoiceId = searchParams.get('invoiceId');
  const orderId = searchParams.get('orderId');
  
  // Поддержка как orderId, так и invoiceId для обратной совместимости
  let finalOrderId = orderId;
  
  if (!finalOrderId && invoiceId) {
    // Если передан invoiceId, находим связанный Order
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { order_id: true }
    });
    if (invoice && invoice.order_id) {
      finalOrderId = invoice.order_id;
    }
  }
  
  if (!finalOrderId) {
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'orderId или invoiceId обязателен',
      400
    );
  }

  const supplierOrders = await prisma.supplierOrder.findMany({
    where: { parent_document_id: finalOrderId }, // Ищем по orderId
    orderBy: { created_at: 'desc' }
  });

  return apiSuccess({ supplierOrders });
}

export const GET = withErrorHandling(
  requireAuth(getHandler),
  'supplier-orders/GET'
);
