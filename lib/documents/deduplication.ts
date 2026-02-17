// lib/documents/deduplication.ts
// Единая логика дедубликации документов (только для сервера)

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';

// Реэкспортируем клиентские функции из отдельного файла
import { normalizeItems, compareCartContent } from './deduplication-client';
export { normalizeItems, compareCartContent };

// Поиск существующего Order
export async function findExistingOrder(
  parentDocumentId: string | null,
  cartSessionId: string | null,
  clientId: string,
  items: any[],
  totalAmount: number
) {
  try {
    logger.debug('Поиск существующего заказа', 'DEDUPLICATION', {
      parentDocumentId: parentDocumentId || 'нет',
      cartSessionId: cartSessionId || 'нет',
      clientId,
      totalAmount
    });

    // ВАЖНО: Order - основной документ, parent_document_id всегда должен быть null
    let existingOrder = null;
    
    if (cartSessionId) {
      // Этап 1: Поиск по cart_session_id (если передан)
      existingOrder = await prisma.order.findFirst({
        where: {
          parent_document_id: null, // Order - основной документ
          cart_session_id: cartSessionId,
          client_id: clientId,
          total_amount: {
            gte: totalAmount - 0.01,
            lte: totalAmount + 0.01
          }
        } as any,
        orderBy: { created_at: 'desc' }
      });

      if (existingOrder && existingOrder.cart_data && compareCartContent(items, existingOrder.cart_data)) {
        logger.debug('Найден существующий заказ (по cart_session_id)', 'DEDUPLICATION', {
          orderNumber: existingOrder.number,
          orderId: existingOrder.id,
          cartSessionId
        });
        return existingOrder;
      }
    }

    // Этап 2: Поиск по содержимому корзины (независимо от cart_session_id)
    const candidates = await prisma.order.findMany({
      where: {
        parent_document_id: null, // Только основные Order из корзины
        client_id: clientId,
        total_amount: {
          gte: totalAmount - 0.01,
          lte: totalAmount + 0.01
        }
      } as any,
      orderBy: { created_at: 'desc' },
      take: 20 // Увеличиваем лимит для более тщательного поиска
    });

    logger.debug('Кандидаты для сравнения', 'DEDUPLICATION', {
      candidatesCount: candidates.length,
      clientId,
      totalAmount
    });

    for (const candidate of candidates) {
      if (candidate.cart_data && compareCartContent(items, candidate.cart_data)) {
        logger.debug('Найден существующий заказ (по содержимому корзины)', 'DEDUPLICATION', {
          orderNumber: candidate.number,
          orderId: candidate.id,
          cartSessionId: candidate.cart_session_id
        });
        return candidate;
      }
    }

    logger.debug('Существующий заказ не найден', 'DEDUPLICATION');
    return null;
  } catch (error) {
    logger.error('Ошибка поиска существующего заказа', 'DEDUPLICATION', { error });
    return null;
  }
}

// Поиск существующего документа (Quote, Invoice, SupplierOrder)
export async function findExistingDocument(
  type: 'quote' | 'invoice' | 'supplier_order',
  parentDocumentId: string | null,
  cartSessionId: string | null,
  clientId: string,
  items: any[],
  totalAmount: number
) {
  try {
    logger.debug('Поиск существующего документа', 'DEDUPLICATION', {
      type,
      parentDocumentId: parentDocumentId || 'нет',
      cartSessionId: cartSessionId || 'нет',
      clientId,
      totalAmount
    });

    // Этап 1: Строгий поиск по всем критериям
    let existing = null;
    
    const amountTolerance = { gte: totalAmount - 0.01, lte: totalAmount + 0.01 };

    if (type === 'quote') {
      existing = await prisma.quote.findFirst({
        where: {
          parent_document_id: parentDocumentId,
          cart_session_id: cartSessionId,
          client_id: clientId,
          total_amount: amountTolerance
        } as any,
        orderBy: { created_at: 'desc' }
      });
    } else if (type === 'invoice') {
      existing = await prisma.invoice.findFirst({
        where: {
          parent_document_id: parentDocumentId,
          cart_session_id: cartSessionId,
          client_id: clientId,
          total_amount: amountTolerance
        } as any,
        orderBy: { created_at: 'desc' }
      });
    } else if (type === 'supplier_order') {
      existing = await prisma.supplierOrder.findFirst({
        where: {
          parent_document_id: parentDocumentId,
          cart_session_id: cartSessionId,
          total_amount: amountTolerance
        } as any,
        orderBy: { created_at: 'desc' }
      });
    }
    
    if (existing && existing.cart_data && compareCartContent(items, existing.cart_data)) {
      logger.debug('Найден существующий документ (строгое совпадение)', 'DEDUPLICATION', {
        documentNumber: existing.number || existing.id,
        documentId: existing.id
      });
      return existing;
    }

    // Этап 2: Поиск по содержимому корзины
    // ВАЖНО: Ищем только в документах ТОГО ЖЕ клиента
    let candidates: any[] = [];
    
    if (type === 'quote') {
      candidates = await prisma.quote.findMany({
        where: {
          client_id: clientId,
          parent_document_id: parentDocumentId,
          total_amount: {
            gte: totalAmount - 0.01,
            lte: totalAmount + 0.01
          }
        } as any,
        orderBy: { created_at: 'desc' },
        take: 10
      });
    } else if (type === 'invoice') {
      candidates = await prisma.invoice.findMany({
        where: {
          client_id: clientId,
          parent_document_id: parentDocumentId,
          total_amount: {
            gte: totalAmount - 0.01,
            lte: totalAmount + 0.01
          }
        } as any,
        orderBy: { created_at: 'desc' },
        take: 10
      });
    } else if (type === 'supplier_order') {
      candidates = await prisma.supplierOrder.findMany({
        where: {
          parent_document_id: parentDocumentId,
          total_amount: {
            gte: totalAmount - 0.01,
            lte: totalAmount + 0.01
          }
        } as any,
        orderBy: { created_at: 'desc' },
        take: 10
      });
    }
    
    for (const candidate of candidates) {
      if (candidate.cart_data && compareCartContent(items, candidate.cart_data)) {
        logger.debug('Найден существующий документ (по содержимому)', 'DEDUPLICATION', {
          documentNumber: candidate.number || candidate.id,
          documentId: candidate.id
        });
        return candidate;
      }
    }
    
    logger.debug('Существующий документ не найден', 'DEDUPLICATION');
    return null;
  } catch (error) {
    logger.error('Ошибка поиска существующего документа', 'DEDUPLICATION', { error });
    return null;
  }
}

