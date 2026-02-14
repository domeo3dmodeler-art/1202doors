import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// POST /api/documents/[id]/export - Экспорт документа в разных форматах
async function postHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') || 'pdf';

  logger.debug('Exporting document', 'documents/[id]/export', { documentId: id, format }, loggingContext);

  // Ищем документ в разных таблицах
  let document: any = null;
  let documentType: string | null = null;

  // Проверяем в таблице счетов
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: true,
      invoice_items: true
    }
  });

  if (invoice) {
    document = invoice;
    documentType = 'invoice';
  } else {
    // Проверяем в таблице КП
    const quote = await prisma.quote.findUnique({
      where: { id },
      include: {
        client: true,
        quote_items: true
      }
    });

    if (quote) {
      document = quote;
      documentType = 'quote';
    } else {
      // Проверяем в таблице заказов
      const order = await prisma.order.findUnique({
        where: { id },
        include: {
          client: true,
          invoice: {
            select: {
              id: true,
              number: true,
              status: true,
              cart_data: true
            }
          }
        }
      });

      if (order) {
        document = order;
        documentType = 'order';
      }
    }
  }

  if (!document) {
    throw new NotFoundError('Документ', id);
  }

  logger.debug('Document found', 'documents/[id]/export', { documentType, documentNumber: document.number }, loggingContext);

  // Получаем данные корзины из соответствующих полей
  let cartData: any[] = [];
  
  if (documentType === 'quote') {
    // Для Quote используем quote_items или cart_data
    if (document.quote_items && document.quote_items.length > 0) {
      cartData = document.quote_items.map((item: any) => ({
        id: item.product_id,
        name: item.notes || `Товар ${item.product_id}`,
        quantity: item.quantity,
        qty: item.quantity,
        unitPrice: item.unit_price,
        price: item.unit_price,
        total: item.total_price
      }));
    } else if (document.cart_data) {
      try {
        const parsed = typeof document.cart_data === 'string' 
          ? JSON.parse(document.cart_data) 
          : document.cart_data;
        cartData = Array.isArray(parsed) ? parsed : (parsed.items || []);
      } catch (e) {
        logger.warn('Error parsing quote cart_data', 'documents/[id]/export', { error: e }, loggingContext);
      }
    }
  } else if (documentType === 'invoice') {
    // Для Invoice используем invoice_items или cart_data
    if (document.invoice_items && document.invoice_items.length > 0) {
      cartData = document.invoice_items.map((item: any) => ({
        id: item.product_id,
        name: item.notes || `Товар ${item.product_id}`,
        quantity: item.quantity,
        qty: item.quantity,
        unitPrice: item.unit_price,
        price: item.unit_price,
        total: item.total_price
      }));
    } else if (document.cart_data) {
      try {
        const parsed = typeof document.cart_data === 'string' 
          ? JSON.parse(document.cart_data) 
          : document.cart_data;
        cartData = Array.isArray(parsed) ? parsed : (parsed.items || []);
      } catch (e) {
        logger.warn('Error parsing invoice cart_data', 'documents/[id]/export', { error: e }, loggingContext);
      }
    }
  } else if (documentType === 'order') {
    // Для Order используем cart_data или cart_data из связанного Invoice
    if (document.cart_data) {
      try {
        const parsed = typeof document.cart_data === 'string' 
          ? JSON.parse(document.cart_data) 
          : document.cart_data;
        cartData = Array.isArray(parsed) ? parsed : (parsed.items || []);
      } catch (e) {
        logger.warn('Error parsing order cart_data', 'documents/[id]/export', { error: e }, loggingContext);
      }
    } else if (document.invoice?.cart_data) {
      try {
        const parsed = typeof document.invoice.cart_data === 'string' 
          ? JSON.parse(document.invoice.cart_data) 
          : document.invoice.cart_data;
        cartData = Array.isArray(parsed) ? parsed : (parsed.items || []);
      } catch (e) {
        logger.warn('Error parsing invoice cart_data from order', 'documents/[id]/export', { error: e }, loggingContext);
      }
    }
  }
  
  // Валидация данных перед экспортом
  if (cartData.length === 0) {
    throw new ValidationError('Нет данных корзины для экспорта');
  }

  // Проверяем наличие клиента
  if (!document.client) {
    throw new ValidationError('Нет данных клиента для экспорта');
  }

  // Проверяем наличие общей суммы
  if (!document.total_amount && document.total_amount !== 0) {
    logger.warn('No total amount for export', 'documents/[id]/export', { documentId: id }, loggingContext);
  }

  // Формируем данные для экспорта
  const exportData = {
    documentId: document.id,
    documentNumber: document.number,
    documentType: documentType,
    client: document.client,
    items: cartData,
    totalAmount: document.total_amount,
    subtotal: document.subtotal,
    createdAt: document.created_at,
    status: document.status,
    notes: document.notes
  };

  // В зависимости от формата возвращаем соответствующий файл
  if (format === 'pdf' || format === 'excel' || format === 'csv') {
    // Используем существующий генератор
    const { exportDocumentWithPDF } = await import('@/lib/export/puppeteer-generator');
    
    // Преобразуем cartData в формат для экспорта
    const itemsForExport = cartData.map((item: any) => ({
      id: item.id || item.product_id,
      productId: item.product_id || item.id,
      name: item.name || item.model || `Товар ${item.id || item.product_id}`,
      model: item.model || item.name,
      qty: item.qty || item.quantity || 1,
      quantity: item.qty || item.quantity || 1,
      unitPrice: item.unitPrice || item.price || item.unit_price || 0,
      price: item.unitPrice || item.price || item.unit_price || 0,
      width: item.width,
      height: item.height,
      color: item.color,
      finish: item.finish,
      type: item.type || 'door',
      sku_1c: item.sku_1c,
      handleId: item.handleId,
      handleName: item.handleName,
      hardwareKitId: item.hardwareKitId,
      hardwareKitName: item.hardwareKitName || item.hardware
    }));
    
    const result = await exportDocumentWithPDF(
      documentType as 'quote' | 'invoice' | 'order',
      format as 'pdf' | 'excel' | 'csv',
      document.client_id,
      itemsForExport,
      document.total_amount || 0,
      document.cart_session_id || null,
      document.parent_document_id || null
    );

    if (!result.buffer) {
      throw new Error('Ошибка при генерации файла');
    }

    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      excel: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      csv: 'text/csv'
    };

    const extensions: Record<string, string> = {
      pdf: 'pdf',
      excel: 'xlsx',
      csv: 'csv'
    };

    return new NextResponse(result.buffer, {
      headers: {
        'Content-Type': mimeTypes[format] || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${result.filename || document.number}.${extensions[format] || 'bin'}"`,
      },
    });
  } else {
    throw new ValidationError(`Неподдерживаемый формат: ${format}`);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((request, user) => postHandler(request, user, { params })),
    'documents/[id]/export/POST'
  )(req);
}

// GET /api/documents/[id]/preview - Предпросмотр документа
async function getHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  
  // Перенаправляем на страницу предпросмотра
  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/documents/${id}/preview`);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((request, user) => getHandler(request, user, { params })),
    'documents/[id]/export/GET'
  )(req);
}
