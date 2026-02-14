import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import type { AuthenticatedUser } from '@/lib/auth/request-helpers';

async function postHandler(
  request: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { clientId, cartItems, documentType = 'quote' } = await request.json();

  if (!clientId || !cartItems || cartItems.length === 0) {
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Отсутствуют обязательные поля: clientId, cartItems',
      400
    );
  }

  // Проверяем существование клиента
  const client = await prisma.client.findUnique({
    where: { id: clientId }
  });

  if (!client) {
    throw new NotFoundError('Клиент', clientId);
  }

  // Вычисляем общую стоимость
  const totalAmount = cartItems.reduce((sum: number, item: any) => {
    return sum + (item.price * item.quantity);
  }, 0);

  // Создаем документ в зависимости от типа
  // Для Invoice и Quote: сначала создаем Order, затем создаем документ на основе Order
  let document;
  
  switch (documentType) {
    case 'quote':
    case 'invoice':
      // Шаг 1: Создаем Order из корзины
      const items = cartItems.map((item: any) => ({
        id: item.id || item.productId,
        productId: item.productId || item.id,
        name: item.name || item.productName,
        model: item.model || item.productName,
        qty: item.quantity || 1,
        quantity: item.quantity || 1,
        unitPrice: item.price || 0,
        price: item.price || 0,
        width: item.width,
        height: item.height,
        color: item.color,
        finish: item.finish,
        sku_1c: item.sku_1c
      }));

      // Создаем Order через /api/orders (используем внутренний вызов)
      const orderResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/orders`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${request.headers.get('authorization')?.replace('Bearer ', '') || ''}`
        },
        body: JSON.stringify({
          client_id: clientId,
          items,
          total_amount: totalAmount,
          subtotal: totalAmount,
          tax_amount: totalAmount * 0.2,
          notes: `Создан для ${documentType === 'invoice' ? 'счета' : 'КП'} через save-to-client`
        })
      });

      if (!orderResponse.ok) {
        const orderError = await orderResponse.json();
        logger.error('Ошибка при создании заказа', 'cart/save-to-client', { error: orderError }, loggingContext);
        return apiError(
          ApiErrorCode.INTERNAL_SERVER_ERROR,
          `Ошибка при создании заказа: ${orderError.error || orderError.message || 'Неизвестная ошибка'}`,
          500
        );
      }

      const orderResult = await orderResponse.json();
      const orderId = orderResult.data?.order?.id || orderResult.order?.id;

      if (!orderId) {
        logger.error('Не удалось получить ID созданного заказа', 'cart/save-to-client', { orderResult }, loggingContext);
        return apiError(
          ApiErrorCode.INTERNAL_SERVER_ERROR,
          'Не удалось получить ID созданного заказа',
          500
        );
      }

      // Шаг 2: Создаем Invoice или Quote на основе Order через /api/documents/create
      const documentResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/documents/create`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${request.headers.get('authorization')?.replace('Bearer ', '') || ''}`
        },
        body: JSON.stringify({
          type: documentType,
          parent_document_id: orderId,
          client_id: clientId,
          items,
          total_amount: totalAmount,
          subtotal: totalAmount,
          tax_amount: totalAmount * 0.2,
          notes: `Создан из корзины на основе заказа`
        })
      });

      if (!documentResponse.ok) {
        const documentError = await documentResponse.json();
        logger.error('Ошибка при создании документа', 'cart/save-to-client', { error: documentError }, loggingContext);
        return apiError(
          ApiErrorCode.INTERNAL_SERVER_ERROR,
          `Ошибка при создании ${documentType}: ${documentError.error || documentError.message || 'Неизвестная ошибка'}`,
          500
        );
      }

      const documentResult = await documentResponse.json();
      const documentId = documentResult.data?.document?.id || documentResult.documentId;
      
      // Получаем полные данные созданного документа
      if (documentType === 'invoice') {
        document = await prisma.invoice.findUnique({
          where: { id: documentId },
          include: { invoice_items: true }
        });
      } else {
        document = await prisma.quote.findUnique({
          where: { id: documentId },
          include: { quote_items: true }
        });
      }
      break;

    case 'order':
      // Создаем заказ (данные корзины сохраняем в cart_data)
      const orderNumber = `ORD-${Date.now()}`;
      document = await prisma.order.create({
        data: {
          number: orderNumber,
          client_id: clientId,
          status: 'NEW_PLANNED',
          total_amount: totalAmount,
          notes: `Создан через save-to-client. Корзина: ${cartItems.length} позиций`,
          cart_data: JSON.stringify(cartItems)
        }
      });
      break;

    default:
      return apiError(
        ApiErrorCode.VALIDATION_ERROR,
        `Неподдерживаемый тип документа: ${documentType}`,
        400
      );
  }

  return apiSuccess({
    document,
    message: `Документ ${documentType} создан успешно`
  });
}

export const POST = withErrorHandling(
  requireAuth(postHandler),
  'cart/save-to-client/POST'
);

