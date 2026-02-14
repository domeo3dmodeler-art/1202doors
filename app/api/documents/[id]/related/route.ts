import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';

// GET /api/documents/[id]/related - Получение связанных документов
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let id: string | undefined;
  try {
    const resolved = await params;
    id = resolved.id;
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'all';

    logger.debug('Получаем связанные документы', 'documents/[id]/related', { id, type });

    // Сначала определяем тип текущего документа
    let currentDoc = null;
    let currentType = null;

    // Проверяем в разных таблицах
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      select: { id: true, parent_document_id: true, client_id: true }
    });

    if (invoice) {
      currentDoc = invoice;
      currentType = 'invoice';
    } else {
      const quote = await prisma.quote.findUnique({
        where: { id },
        select: { id: true, parent_document_id: true, client_id: true }
      });

      if (quote) {
        currentDoc = quote;
        currentType = 'quote';
      } else {
        const order = await prisma.order.findUnique({
          where: { id },
          select: { id: true, parent_document_id: true, client_id: true }
        });

        if (order) {
          currentDoc = order;
          currentType = 'order';
        } else {
          const supplierOrder = await prisma.supplierOrder.findUnique({
            where: { id },
            select: { id: true, parent_document_id: true }
          });

          if (supplierOrder) {
            currentDoc = supplierOrder;
            currentType = 'supplier_order';
          }
        }
      }
    }

    if (!currentDoc) {
      logger.warn('Документ не найден', 'documents/[id]/related', { id });
      return NextResponse.json(
        { error: 'Документ не найден' },
        { status: 404 }
      );
    }

    logger.debug('Найден документ', 'documents/[id]/related', { id, currentType });

    const relatedDocs = [];

    // Ищем связанные документы в зависимости от типа текущего документа
    if (currentType === 'quote') {
      // Для КП ищем счета и заказы
      const [invoices, orders] = await Promise.all([
        prisma.invoice.findMany({
          where: { parent_document_id: id },
          include: { client: { select: { firstName: true, lastName: true } } },
          orderBy: { created_at: 'desc' }
        }),
        prisma.order.findMany({
          where: { parent_document_id: id },
          include: { client: { select: { firstName: true, lastName: true } } },
          orderBy: { created_at: 'desc' }
        })
      ]);

      relatedDocs.push(
        ...invoices.map(inv => ({ ...inv, documentType: 'invoice', relation: 'child' })),
        ...orders.map(ord => ({ ...ord, documentType: 'order', relation: 'child' }))
      );
    }

    if (currentType === 'invoice') {
      // Для счета ищем КП (родитель) и заказы (дети)
      const [quotes, orders] = await Promise.all([
        currentDoc.parent_document_id ? prisma.quote.findMany({
          where: { id: currentDoc.parent_document_id },
          include: { client: { select: { firstName: true, lastName: true } } }
        }) : [],
        prisma.order.findMany({
          where: { parent_document_id: id },
          include: { client: { select: { firstName: true, lastName: true } } },
          orderBy: { created_at: 'desc' }
        })
      ]);

      relatedDocs.push(
        ...quotes.map(q => ({ ...q, documentType: 'quote', relation: 'parent' })),
        ...orders.map(ord => ({ ...ord, documentType: 'order', relation: 'child' }))
      );
    }

    if (currentType === 'order') {
      // Для заказа ищем КП/счет (родители) и заказы у поставщика (дети)
      const [quotes, invoices, supplierOrders] = await Promise.all([
        currentDoc.parent_document_id ? prisma.quote.findMany({
          where: { id: currentDoc.parent_document_id },
          include: { client: { select: { firstName: true, lastName: true } } }
        }) : [],
        currentDoc.parent_document_id ? prisma.invoice.findMany({
          where: { id: currentDoc.parent_document_id },
          include: { client: { select: { firstName: true, lastName: true } } }
        }) : [],
        prisma.supplierOrder.findMany({
          where: { parent_document_id: id },
          orderBy: { created_at: 'desc' }
        })
      ]);

      relatedDocs.push(
        ...quotes.map(q => ({ ...q, documentType: 'quote', relation: 'parent' })),
        ...invoices.map(inv => ({ ...inv, documentType: 'invoice', relation: 'parent' })),
        ...supplierOrders.map(so => ({ ...so, documentType: 'supplier_order', relation: 'child' }))
      );
    }

    if (currentType === 'supplier_order') {
      // Для заказа у поставщика ищем заказ/счет (родители)
      const [orders, invoices] = await Promise.all([
        currentDoc.parent_document_id ? prisma.order.findMany({
          where: { id: currentDoc.parent_document_id },
          include: { client: { select: { firstName: true, lastName: true } } }
        }) : [],
        currentDoc.parent_document_id ? prisma.invoice.findMany({
          where: { id: currentDoc.parent_document_id },
          include: { client: { select: { firstName: true, lastName: true } } }
        }) : []
      ]);

      relatedDocs.push(
        ...orders.map(ord => ({ ...ord, documentType: 'order', relation: 'parent' })),
        ...invoices.map(inv => ({ ...inv, documentType: 'invoice', relation: 'parent' }))
      );
    }

    logger.debug('Найдено связанных документов', 'documents/[id]/related', { id, currentType, relatedDocsCount: relatedDocs.length });

    return NextResponse.json({
      success: true,
      currentType,
      documents: relatedDocs,
      counts: {
        quotes: relatedDocs.filter(d => d.documentType === 'quote').length,
        invoices: relatedDocs.filter(d => d.documentType === 'invoice').length,
        orders: relatedDocs.filter(d => d.documentType === 'order').length,
        supplier_orders: relatedDocs.filter(d => d.documentType === 'supplier_order').length
      }
    });

  } catch (error) {
    logger.error('Ошибка получения связанных документов', 'documents/[id]/related', error instanceof Error ? { error: error.message, stack: error.stack, id: id ?? undefined } : { error: String(error), id: id ?? undefined });
    return NextResponse.json(
      { error: 'Ошибка при получении связанных документов' },
      { status: 500 }
    );
  }
}
