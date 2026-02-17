// lib/repositories/document.repository.ts
// Репозиторий для работы с документами (Order, Invoice, Quote, SupplierOrder)

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { simpleCache } from './cache';
import type { DocumentType, DocumentItem } from '@/lib/types/documents';
import type {
  QuoteWithRelations,
  InvoiceWithRelations,
  OrderWithRelations,
  SupplierOrderWithRelations,
  OrderWithInvoiceCheck
} from '@/lib/types/prisma-documents';

export interface DocumentRecord {
  id: string;
  number: string;
  type: DocumentType;
  parent_document_id?: string | null;
  cart_session_id?: string | null;
  client_id: string;
  total_amount: number;
  cart_data?: string | null;
  created_at: Date;
  updated_at?: Date;
}

export interface CreateDocumentRecordInput {
  number: string;
  parent_document_id?: string | null;
  cart_session_id?: string | null;
  client_id: string;
  items: DocumentItem[];
  total_amount: number;
  subtotal: number;
  tax_amount: number;
  notes?: string;
  created_by: string;
}

export class DocumentRepository {
  /**
   * Создает Quote в БД
   */
  async createQuote(data: CreateDocumentRecordInput): Promise<QuoteWithRelations> {
    const cartData = JSON.stringify(data.items);
    
    const quote = await prisma.quote.create({
      data: {
        number: data.number,
        parent_document_id: data.parent_document_id,
        cart_session_id: data.cart_session_id,
        client_id: data.client_id,
        created_by: data.created_by,
        subtotal: data.subtotal,
        tax_amount: data.tax_amount,
        total_amount: data.total_amount,
        notes: data.notes,
        cart_data: cartData
      } as any
    });

    // Создаем элементы КП
    const quoteItems = data.items.map((item, i) => ({
      quote_id: quote.id,
      product_id: item.productId || item.product_id || `temp_${i}`,
      quantity: item.qty || item.quantity || 1,
      unit_price: item.unitPrice || item.price || item.unit_price || 0,
      total_price: (item.qty || item.quantity || 1) * (item.unitPrice || item.price || item.unit_price || 0),
      notes: item.name || item.model || 'Товар'
    }));

    await prisma.quoteItem.createMany({
      data: quoteItems
    });

    // Получаем созданный Quote с связями
    const quoteWithRelations = await prisma.quote.findUnique({
      where: { id: quote.id },
      include: {
        client: true,
        quote_items: true
      }
    });

    if (!quoteWithRelations) {
      throw new Error('Не удалось получить созданный Quote');
    }

    logger.info('Quote created', 'DOCUMENT_REPOSITORY', {
      quoteId: quote.id,
      quoteNumber: quote.number
    });

    // Инвалидируем кеш
    simpleCache.deleteByPrefix('quote:');
    simpleCache.deleteByPrefix('order:');

    return quoteWithRelations;
  }

  /**
   * Создает Invoice в БД
   */
  async createInvoice(data: CreateDocumentRecordInput): Promise<InvoiceWithRelations> {
    const cartData = JSON.stringify(data.items);
    
    const invoice = await prisma.invoice.create({
      data: {
        number: data.number,
        parent_document_id: data.parent_document_id,
        cart_session_id: data.cart_session_id,
        client_id: data.client_id,
        created_by: data.created_by,
        subtotal: data.subtotal,
        tax_amount: data.tax_amount,
        total_amount: data.total_amount,
        notes: data.notes,
        cart_data: cartData
      } as any
    });

    // Обновляем Order, связывая с Invoice
    if (data.parent_document_id) {
      await prisma.order.update({
        where: { id: data.parent_document_id },
        data: { invoice_id: invoice.id }
      });
    }

    // Создаем элементы счета
    const invoiceItems = data.items.map((item, i) => ({
      invoice_id: invoice.id,
      product_id: item.productId || item.product_id || `temp_${i}`,
      quantity: item.qty || item.quantity || 1,
      unit_price: item.unitPrice || item.price || item.unit_price || 0,
      total_price: (item.qty || item.quantity || 1) * (item.unitPrice || item.price || item.unit_price || 0),
      notes: item.name || item.model || 'Товар'
    }));

    await prisma.invoiceItem.createMany({
      data: invoiceItems
    });

    // Получаем созданный Invoice с связями
    const invoiceWithRelations = await prisma.invoice.findUnique({
      where: { id: invoice.id },
      include: {
        client: true,
        invoice_items: true,
        order: true
      }
    });

    if (!invoiceWithRelations) {
      throw new Error('Не удалось получить созданный Invoice');
    }

      logger.info('Invoice created', 'DOCUMENT_REPOSITORY', {
        invoiceId: invoice.id,
        invoiceNumber: invoice.number
      });

      // Отправляем уведомления о создании счета
      try {
        const { notifyDocumentCreated } = await import('@/lib/notifications');
        // Получаем данные заказа для уведомлений
        let complectatorId = null;
        let executorId = null;
        if (data.parent_document_id) {
          const relatedOrder = await prisma.order.findUnique({
            where: { id: data.parent_document_id },
            select: {
              complectator_id: true,
              executor_id: true
            }
          });
          complectatorId = relatedOrder?.complectator_id || null;
          executorId = relatedOrder?.executor_id || null;
        }
        await notifyDocumentCreated(
          'invoice',
          invoice.id,
          invoice.number,
          data.client_id,
          complectatorId,
          executorId
        );
      } catch (notificationError) {
        logger.warn('Не удалось отправить уведомление о создании счета', 'DOCUMENT_REPOSITORY', {
          error: notificationError instanceof Error ? notificationError.message : String(notificationError),
          invoiceId: invoice.id
        });
        // Не прерываем выполнение при ошибке уведомлений
      }

      // Инвалидируем кеш
      simpleCache.deleteByPrefix('invoice:');
      simpleCache.delete(`order:${data.parent_document_id}`);
      simpleCache.delete(`order:invoice-check:${data.parent_document_id}`);

      return invoiceWithRelations;
  }

  /**
   * Создает Order в БД
   */
  async createOrder(data: CreateDocumentRecordInput): Promise<OrderWithRelations> {
    try {
      // Безопасная сериализация items
      let cartData: string;
      try {
        cartData = JSON.stringify(data.items);
      } catch (jsonError) {
        logger.error('Error stringifying items in createOrder', 'DOCUMENT_REPOSITORY', {
          error: jsonError instanceof Error ? jsonError.message : String(jsonError),
          itemsCount: data.items.length
        });
        // Сохраняем все поля, нужные для экспорта (без циклических ссылок)
        const keysForExport = [
          'id', 'productId', 'product_id', 'type', 'itemType', 'name', 'model', 'model_name',
          'qty', 'quantity', 'unitPrice', 'price', 'unit_price', 'width', 'height', 'color', 'finish', 'style',
          'sku_1c', 'handleId', 'handleName', 'hardwareKitId', 'hardwareKitName', 'hardware',
          'limiterId', 'limiterName', 'edge', 'edgeId', 'edgeColorName', 'edge_color_name',
          'glassColor', 'glass_color', 'reversible', 'mirror', 'threshold',
          'optionIds', 'option_ids', 'architraveNames', 'architrave_names', 'optionNames',
          'price_opt', 'breakdown', 'matchingVariants', 'specRows', 'coatingId', 'filling', 'fillingName'
        ];
        cartData = JSON.stringify(data.items.map((item: any) => {
          const out: Record<string, unknown> = {};
          for (const k of keysForExport) {
            if (item[k] !== undefined) out[k] = item[k];
          }
          out.type = item.type ?? item.itemType;
          out.qty = item.qty ?? item.quantity ?? 1;
          out.unitPrice = item.unitPrice ?? item.price ?? item.unit_price ?? 0;
          out.name = item.name ?? item.model;
          return out;
        }));
      }
      
      const order = await prisma.order.create({
        data: {
          number: data.number,
          parent_document_id: null, // Order - основной документ
          cart_session_id: data.cart_session_id,
          client_id: data.client_id,
          status: 'DRAFT', // Статус "Новый заказ" по умолчанию для Order
          total_amount: data.total_amount,
          notes: data.notes,
          cart_data: cartData
        }
      });

      // Элементы заказа хранятся в cart_data как JSON, не создаем отдельные записи
      // Получаем созданный Order с связями
      const orderWithRelations = await prisma.order.findUnique({
        where: { id: order.id },
        include: {
          client: true,
          invoice: true
        }
      });

      if (!orderWithRelations) {
        throw new Error('Не удалось получить созданный Order');
      }

      logger.info('Order created', 'DOCUMENT_REPOSITORY', {
        orderId: order.id,
        orderNumber: order.number
      });

      // Инвалидируем кеш
      simpleCache.deleteByPrefix('order:');

      return orderWithRelations;
    } catch (error) {
      logger.error('Error creating order in documentRepository', 'DOCUMENT_REPOSITORY', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        data: {
          number: data.number,
          client_id: data.client_id,
          itemsCount: data.items.length,
          total_amount: data.total_amount
        }
      });
      throw error;
    }
  }

  /**
   * Создает SupplierOrder в БД.
   * Схема: executor_id, supplier_name обязательны; статусы: PENDING → ORDERED → RECEIVED_FROM_SUPPLIER → COMPLETED.
   * Элементы заказа хранятся в cart_data (JSON); отдельной таблицы SupplierOrderItem в схеме нет.
   */
  async createSupplierOrder(data: CreateDocumentRecordInput): Promise<SupplierOrderWithRelations> {
    const cartData = JSON.stringify(data.items);

    const supplierOrder = await prisma.supplierOrder.create({
      data: {
        number: data.number,
        parent_document_id: data.parent_document_id ?? null,
        cart_session_id: data.cart_session_id ?? null,
        executor_id: data.created_by,
        supplier_name: 'Поставщик не указан',
        status: 'PENDING',
        total_amount: data.total_amount,
        notes: data.notes ?? null,
        cart_data: cartData
      }
    });

    const supplierOrderWithRelations = await prisma.supplierOrder.findUnique({
      where: { id: supplierOrder.id }
    });

    if (!supplierOrderWithRelations) {
      throw new Error('Не удалось получить созданный SupplierOrder');
    }

    logger.info('SupplierOrder created', 'DOCUMENT_REPOSITORY', {
      supplierOrderId: supplierOrder.id,
      supplierOrderNumber: supplierOrder.number
    });

    return supplierOrderWithRelations as SupplierOrderWithRelations;
  }

  /**
   * Находит Order по ID
   */
  async findOrderById(id: string): Promise<OrderWithRelations | null> {
    const cacheKey = `order:${id}`;
    const cached = simpleCache.get<OrderWithRelations>(cacheKey);
    if (cached) {
      return cached;
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: {
        client: true,
        invoice: true,
        orderItems: true
      }
    });

    if (order) {
      simpleCache.set(cacheKey, order, 300); // Кеш на 5 минут
    }

    return order;
  }

  /**
   * Находит Order с проверкой invoice_id
   */
  async findOrderWithInvoiceCheck(id: string): Promise<OrderWithInvoiceCheck | null> {
    const cacheKey = `order:invoice-check:${id}`;
    const cached = simpleCache.get<OrderWithInvoiceCheck>(cacheKey);
    if (cached) {
      return cached;
    }

    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, invoice_id: true }
    });

    if (order) {
      simpleCache.set(cacheKey, order, 60); // Короткий кеш на 1 минуту
    }

    return order;
  }

  /**
   * Находит Quote по ID
   */
  async findQuoteById(id: string): Promise<QuoteWithRelations | null> {
    return await prisma.quote.findUnique({
      where: { id },
      include: {
        client: true,
        quote_items: true
      }
    });
  }

  /**
   * Находит Invoice по ID
   */
  async findInvoiceById(id: string): Promise<InvoiceWithRelations | null> {
    return await prisma.invoice.findUnique({
      where: { id },
      include: {
        client: true,
        invoice_items: true
      }
    });
  }
}

// Экспортируем singleton instance
export const documentRepository = new DocumentRepository();

