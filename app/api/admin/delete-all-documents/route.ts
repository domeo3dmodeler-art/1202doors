import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { deleteDocumentCommentsAndHistoryForMany } from '@/lib/documents/delete-document-relations';

/**
 * API endpoint для удаления всех документов из БД
 * DELETE /api/admin/delete-all-documents
 * 
 * ВНИМАНИЕ: Это необратимая операция!
 * Удаляет: Order, Invoice, Quote, SupplierOrder; перед удалением — комментарии и историю по document_id.
 */
export async function DELETE(req: NextRequest) {
  try {
    logger.warn('Начинаем удаление всех документов из БД', 'admin/delete-all-documents');
    
    const ordersCount = await prisma.order.count();
    const invoicesCount = await prisma.invoice.count();
    const quotesCount = await prisma.quote.count();
    const supplierOrdersCount = await prisma.supplierOrder.count();
    
    logger.info('Найдено документов', 'admin/delete-all-documents', {
      ordersCount,
      invoicesCount,
      quotesCount,
      supplierOrdersCount
    });

    const supplierOrderIds = (await prisma.supplierOrder.findMany({ select: { id: true } })).map((r) => r.id);
    const quoteIds = (await prisma.quote.findMany({ select: { id: true } })).map((r) => r.id);
    const invoiceIds = (await prisma.invoice.findMany({ select: { id: true } })).map((r) => r.id);
    const orderIds = (await prisma.order.findMany({ select: { id: true } })).map((r) => r.id);
    const allDocumentIds = [...supplierOrderIds, ...quoteIds, ...invoiceIds, ...orderIds];
    await deleteDocumentCommentsAndHistoryForMany(allDocumentIds);
    logger.info('Удалены комментарии и история по документам', 'admin/delete-all-documents', { count: allDocumentIds.length });
    
    logger.info('Удаляем заказы у поставщика', 'admin/delete-all-documents');
    const deletedSupplierOrders = await prisma.supplierOrder.deleteMany({});
    logger.info('Удалено заказов у поставщика', 'admin/delete-all-documents', { count: deletedSupplierOrders.count });
    
    // 2. Quote (зависит от Order)
    logger.info('Удаляем КП', 'admin/delete-all-documents');
    const deletedQuotes = await prisma.quote.deleteMany({});
    logger.info('Удалено КП', 'admin/delete-all-documents', { count: deletedQuotes.count });
    
    // 3. Invoice (зависит от Order)
    logger.info('Удаляем счета', 'admin/delete-all-documents');
    const deletedInvoices = await prisma.invoice.deleteMany({});
    logger.info('Удалено счетов', 'admin/delete-all-documents', { count: deletedInvoices.count });
    
    // 4. Order (основная сущность)
    logger.info('Удаляем заказы', 'admin/delete-all-documents');
    const deletedOrders = await prisma.order.deleteMany({});
    logger.info('Удалено заказов', 'admin/delete-all-documents', { count: deletedOrders.count });
    
    logger.info('Все документы успешно удалены из БД', 'admin/delete-all-documents');
    
    // Проверяем что все удалено
    const finalOrdersCount = await prisma.order.count();
    const finalInvoicesCount = await prisma.invoice.count();
    const finalQuotesCount = await prisma.quote.count();
    const finalSupplierOrdersCount = await prisma.supplierOrder.count();
    
    return NextResponse.json({
      success: true,
      deleted: {
        orders: deletedOrders.count,
        invoices: deletedInvoices.count,
        quotes: deletedQuotes.count,
        supplierOrders: deletedSupplierOrders.count
      },
      before: {
        orders: ordersCount,
        invoices: invoicesCount,
        quotes: quotesCount,
        supplierOrders: supplierOrdersCount
      },
      after: {
        orders: finalOrdersCount,
        invoices: finalInvoicesCount,
        quotes: finalQuotesCount,
        supplierOrders: finalSupplierOrdersCount
      }
    });
  } catch (error) {
    logger.error('Ошибка при удалении документов', 'admin/delete-all-documents', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return NextResponse.json(
      { error: 'Ошибка при удалении документов', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

