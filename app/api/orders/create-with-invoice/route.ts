import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateCartSessionId } from '@/lib/utils/cart-session';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';

// Генерация номера заказа в формате "Заказ-XXX"
async function generateOrderNumber(): Promise<string> {
  const lastOrder = await prisma.order.findFirst({
    where: {
      number: {
        startsWith: 'Заказ-'
      }
    },
    orderBy: {
      created_at: 'desc'
    }
  });

  let nextNumber = 1;

  if (lastOrder && lastOrder.number.startsWith('Заказ-')) {
    const match = lastOrder.number.match(/^Заказ-(\d+)$/);
    if (match && match[1]) {
      nextNumber = parseInt(match[1], 10) + 1;
    }
  }

  return `Заказ-${nextNumber}`;
}

// POST /api/orders/create-with-invoice - DEPRECATED: Используйте POST /api/orders для создания заказа
// Этот endpoint оставлен для обратной совместимости, но теперь просто создает Order
async function postHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const body = await req.json();
  const {
    client_id,
    items,
    total_amount,
    subtotal = 0,
    tax_amount = 0,
    notes,
    parent_document_id,
    cart_session_id
  } = body;

  if (!client_id || !items || !Array.isArray(items) || items.length === 0) {
    throw new ValidationError('Необходимые поля: client_id, items (непустой массив)');
  }

  // Получаем данные клиента
  const client = await prisma.client.findUnique({
    where: { id: client_id }
  });

  if (!client) {
    throw new NotFoundError('Клиент', client_id);
  }

  // Генерируем cart_session_id для дедубликации
  const finalCartSessionId = cart_session_id || generateCartSessionId();

  // Комплектатор — тот, кто создал заказ
  const complectatorId = user.userId && user.userId !== 'system' ? user.userId : null;

  // Шаг 1: Создаем Order
  logger.debug('Создание заказа из корзины', 'orders/create-with-invoice', { client_id, itemsCount: items.length }, loggingContext);
  
  // Генерируем номер заказа
  let orderNumber = await generateOrderNumber();
  let exists = await prisma.order.findUnique({
    where: { number: orderNumber }
  });

  let counter = 1;
  while (exists) {
    const match = orderNumber.match(/^Заказ-(\d+)$/);
    const baseNumber = match ? parseInt(match[1], 10) : counter;
    orderNumber = `Заказ-${baseNumber + counter}`;
    exists = await prisma.order.findUnique({
      where: { number: orderNumber }
    });
    counter++;
  }

  // Создаем заказ
  const order = await prisma.order.create({
    data: {
      number: orderNumber,
      client_id,
      lead_number: client.compilationLeadNumber || null,
      complectator_id: complectatorId,
      executor_id: null,
      status: 'NEW_PLANNED',
      parent_document_id: parent_document_id || null,
      cart_session_id: finalCartSessionId,
      cart_data: items && items.length > 0 
        ? JSON.stringify({ items, total_amount: total_amount || 0 }) 
        : (items && Array.isArray(items) 
          ? JSON.stringify({ items: [], total_amount: total_amount || 0 })
          : null),
      total_amount: total_amount || 0
    }
  });

  logger.info(`Заказ создан: ${orderNumber}`, 'orders/create-with-invoice', { orderId: order.id, orderNumber }, loggingContext);

  // Возвращаем только созданный Order
  // Invoice создается отдельно через POST /api/invoices или /api/documents/create
  // с parent_document_id = order.id
  return apiSuccess({
    order: order,
    message: `Заказ ${order.number} создан успешно. Для создания счета используйте POST /api/invoices с parent_document_id = ${order.id}`,
    deprecated: true
  }, 'Заказ создан (DEPRECATED endpoint)');
}

export const POST = withErrorHandling(
  requireAuth(postHandler),
  'orders/create-with-invoice/POST'
);

