import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';

// GET /api/documents/[id]/children - Получение дочерних документов
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let id: string | undefined;
  try {
    const resolved = await params;
    id = resolved.id;

    logger.debug('Получаем дочерние документы', 'documents/[id]/children', { id });

    const children = [];

    // Ищем дочерние документы во всех таблицах
    const [quotes, invoices, orders, supplierOrders] = await Promise.all([
      prisma.quote.findMany({
        where: { parent_document_id: id },
        include: { client: { select: { firstName: true, lastName: true } } },
        orderBy: { created_at: 'desc' }
      }),
      prisma.invoice.findMany({
        where: { parent_document_id: id },
        include: { client: { select: { firstName: true, lastName: true } } },
        orderBy: { created_at: 'desc' }
      }),
      prisma.order.findMany({
        where: { parent_document_id: id },
        include: { client: { select: { firstName: true, lastName: true } } },
        orderBy: { created_at: 'desc' }
      }),
      prisma.supplierOrder.findMany({
        where: { parent_document_id: id },
        orderBy: { created_at: 'desc' }
      })
    ]);

    // Объединяем все дочерние документы
    children.push(
      ...quotes.map(doc => ({ ...doc, documentType: 'quote' })),
      ...invoices.map(doc => ({ ...doc, documentType: 'invoice' })),
      ...orders.map(doc => ({ ...doc, documentType: 'order' })),
      ...supplierOrders.map(doc => ({ ...doc, documentType: 'supplier_order' }))
    );

    logger.debug('Найдено дочерних документов', 'documents/[id]/children', { id, childrenCount: children.length });

    return NextResponse.json({
      success: true,
      documents: children,
      counts: {
        quotes: quotes.length,
        invoices: invoices.length,
        orders: orders.length,
        supplier_orders: supplierOrders.length
      }
    });

  } catch (error) {
    logger.error('Ошибка получения дочерних документов', 'documents/[id]/children', error instanceof Error ? { error: error.message, stack: error.stack, id: id ?? undefined } : { error: String(error), id: id ?? undefined });
    return NextResponse.json(
      { error: 'Ошибка при получении дочерних документов' },
      { status: 500 }
    );
  }
}
