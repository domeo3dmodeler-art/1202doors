import { NextRequest, NextResponse } from 'next/server';
import { exportDocumentWithPDF } from '@/lib/export/puppeteer-generator';
import { prisma } from '@/lib/prisma';
import { generateCartSessionId } from '@/lib/utils/cart-session';
import { logger } from '@/lib/logging/logger';

interface CartItem {
  id?: string;
  type?: string;
  model?: string;
  qty?: number;
  quantity?: number;
  unitPrice?: number;
  [key: string]: unknown;
}

interface Cart {
  items: CartItem[];
}

// Улучшенный API для экспорта из корзины с интеграцией в документооборот
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { 
      cart, 
      documentType, 
      format = 'pdf',
      clientId,
      sourceDocumentId, // ID исходного документа (если создается на основе существующего)
      sourceDocumentType, // Тип исходного документа
      userId = 'system',
      additionalData = {}
    } = body;

    logger.info('Cart export request', 'cart/export/enhanced', { 
      documentType, 
      format, 
      clientId, 
      sourceDocumentId, 
      sourceDocumentType,
      itemsCount: cart?.items?.length 
    });

    if (!cart || !cart.items || cart.items.length === 0) {
      return NextResponse.json(
        { error: "Корзина пуста" },
        { status: 400 }
      );
    }

    if (!clientId) {
      return NextResponse.json(
        { error: "ID клиента обязателен" },
        { status: 400 }
      );
    }

    // Получаем данные клиента
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true, firstName: true, lastName: true, middleName: true, phone: true, address: true }
    });

    if (!client) {
      return NextResponse.json(
        { error: "Клиент не найден" },
        { status: 404 }
      );
    }

    // Вычисляем общую сумму
    const totalAmount = cart.items.reduce((sum: number, item: CartItem) => 
      sum + (item.unitPrice || 0) * (item.qty || item.quantity || 1), 0
    );

    // Генерируем cart_session_id на основе содержимого корзины
    // Если корзина одинаковая - cart_session_id будет одинаковый
    const cartHash = Buffer.from(JSON.stringify({
      clientId,
      items: cart.items.map((item: CartItem) => ({
        id: item.id,
        type: item.type,
        model: item.model,
        qty: item.qty || item.quantity,
        unitPrice: item.unitPrice
      })),
      totalAmount
    })).toString('base64').substring(0, 20);
    
    const cartSessionId = `cart_${cartHash}`;
    
    logger.debug('Cart session ID', 'cart/export/enhanced', { cartSessionId, clientId });
    
    // Генерируем документ с помощью существующей системы
    const exportResult = await exportDocumentWithPDF(
      documentType as 'quote' | 'invoice' | 'order',
      format as 'pdf' | 'excel' | 'csv',
      clientId,
      cart.items,
      totalAmount,
      cartSessionId
    );

    logger.info('Document generated', 'cart/export/enhanced', {
      documentId: exportResult.documentId,
      documentType: exportResult.documentType,
      documentNumber: exportResult.documentNumber,
      clientId
    });

    // Если есть исходный документ, создаем связь
    if (sourceDocumentId && sourceDocumentType) {
      await createDocumentRelationship(
        sourceDocumentType,
        sourceDocumentId,
        exportResult.documentType!,
        exportResult.documentId!,
        userId
      );
    }

    // Записываем в историю
    await prisma.documentHistory.create({
      data: {
        document_id: exportResult.documentId!,
        user_id: userId,
        action: sourceDocumentId ? 'created_from_cart' : 'created_from_cart',
        new_value: JSON.stringify({
          documentType: exportResult.documentType!,
          sourceDocumentId,
          sourceDocumentType,
          cartItemsCount: cart.items.length,
          totalAmount,
          format
        }),
        details: sourceDocumentId 
          ? `Создан из корзины на основе ${sourceDocumentType} ${sourceDocumentId}`
          : 'Создан из корзины'
      }
    });

    return NextResponse.json({
      success: true,
      document: {
        id: exportResult.documentId,
        type: exportResult.documentType,
        number: exportResult.documentNumber,
        totalAmount,
        clientId,
        sourceDocumentId,
        sourceDocumentType
      },
      file: {
        buffer: exportResult.buffer.toString('base64'),
        filename: exportResult.filename,
        mimeType: exportResult.mimeType
      },
      message: `${documentType} успешно создан из корзины`
    });

  } catch (error) {
    logger.error('Error in cart export', 'cart/export/enhanced', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return NextResponse.json(
      { error: 'Ошибка при создании документа из корзины' },
      { status: 500 }
    );
  }
}

// Создание связи между документами
async function createDocumentRelationship(
  sourceType: string,
  sourceId: string,
  targetType: string,
  targetId: string,
  userId: string
) {
  try {
    // Обновляем связи в зависимости от типов документов
    if (sourceType === 'quote' && targetType === 'order') {
      await prisma.order.update({
        where: { id: targetId },
        data: { parent_document_id: sourceId }
      });
    } else if (sourceType === 'quote' && targetType === 'invoice') {
      await prisma.invoice.update({
        where: { id: targetId },
        data: { parent_document_id: sourceId }
      });
    } else if (sourceType === 'order' && targetType === 'invoice') {
      await prisma.invoice.update({
        where: { id: targetId },
        data: { parent_document_id: sourceId }
      });
    } else if (sourceType === 'order' && targetType === 'supplier_order') {
      await prisma.supplierOrder.update({
        where: { id: targetId },
        data: { parent_document_id: sourceId }
      });
    }

    logger.debug('Document relationship created', 'cart/export/enhanced', { sourceType, sourceId, targetType, targetId });
  } catch (error) {
    logger.error('Error creating document relationship', 'cart/export/enhanced', error instanceof Error ? { error: error.message, stack: error.stack, sourceType, sourceId, targetType, targetId } : { error: String(error), sourceType, sourceId, targetType, targetId });
    // Не прерываем выполнение, если не удалось создать связь
  }
}

// API для получения доступных форматов экспорта
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const documentType = searchParams.get('documentType');

    const availableFormats = {
      quote: ['pdf', 'excel', 'csv'],
      invoice: ['pdf', 'excel', 'csv'],
      order: ['pdf', 'excel', 'csv'],
      supplier_order: ['pdf', 'excel']
    };

    const formats = documentType 
      ? availableFormats[documentType as keyof typeof availableFormats] || []
      : Object.keys(availableFormats);

    return NextResponse.json({
      success: true,
      formats,
      documentTypes: Object.keys(availableFormats)
    });

  } catch (error) {
    logger.error('Error fetching export formats', 'cart/export/enhanced', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return NextResponse.json(
      { error: 'Ошибка при получении форматов экспорта' },
      { status: 500 }
    );
  }
}
