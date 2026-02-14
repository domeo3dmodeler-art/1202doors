import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';

interface Document {
  id: string;
  documentType: 'quote' | 'invoice' | 'order' | 'supplier_order';
  parent_document_id?: string | null;
  [key: string]: unknown;
}

interface ChainDocument extends Document {
  position: number;
  level: number;
  parentId?: string;
  childId?: string;
}

// GET /api/documents/[id]/chain - Получение полной цепочки документов
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let id: string | undefined;
  try {
    const resolved = await params;
    id = resolved.id;

    logger.debug('Получаем полную цепочку документов', 'documents/[id]/chain', { id });

    // Получаем все документы клиента для построения цепочки
    const allDocuments = await getAllClientDocuments(id);
    
    // Строим цепочку связей (приводим к Document[])
    const chain = buildDocumentChain(allDocuments as Document[], id);

    logger.debug('Построена цепочка документов', 'documents/[id]/chain', { id, chainLength: chain.length });

    return NextResponse.json({
      success: true,
      chain,
      total: chain.length
    });

  } catch (error) {
    logger.error('Ошибка построения цепочки документов', 'documents/[id]/chain', error instanceof Error ? { error: error.message, stack: error.stack, id: id ?? undefined } : { error: String(error), id: id ?? undefined });
    return NextResponse.json(
      { error: 'Ошибка при построении цепочки документов' },
      { status: 500 }
    );
  }
}

// Получение всех документов клиента
async function getAllClientDocuments(documentId: string) {
  // Сначала определяем клиента по документу
  let clientId = null;

  // Проверяем в разных таблицах
  const invoice = await prisma.invoice.findUnique({
    where: { id: documentId },
    select: { client_id: true }
  });

  if (invoice) {
    clientId = invoice.client_id;
  } else {
    const quote = await prisma.quote.findUnique({
      where: { id: documentId },
      select: { client_id: true }
    });

    if (quote) {
      clientId = quote.client_id;
    } else {
      const order = await prisma.order.findUnique({
        where: { id: documentId },
        select: { client_id: true }
      });

      if (order) {
        clientId = order.client_id;
      } else {
        const supplierOrder = await prisma.supplierOrder.findUnique({
          where: { id: documentId },
          select: { parent_document_id: true }
        });

        if (supplierOrder && supplierOrder.parent_document_id) {
          // Получаем клиента через родительский документ
          const parentOrder = await prisma.order.findUnique({
            where: { id: supplierOrder.parent_document_id },
            select: { client_id: true }
          });
          
          if (parentOrder) {
            clientId = parentOrder.client_id;
          }
        }
      }
    }
  }

  if (!clientId) {
    return [];
  }

  const [quotes, invoices, orders, supplierOrdersRaw] = await Promise.all([
    prisma.quote.findMany({
      where: { client_id: clientId },
      include: { client: { select: { firstName: true, lastName: true } } },
      orderBy: { created_at: 'asc' }
    }),
    prisma.invoice.findMany({
      where: { client_id: clientId },
      include: { client: { select: { firstName: true, lastName: true } } },
      orderBy: { created_at: 'asc' }
    }),
    prisma.order.findMany({
      where: { client_id: clientId },
      include: { client: { select: { firstName: true, lastName: true } } },
      orderBy: { created_at: 'asc' }
    }),
    prisma.order.findMany({ where: { client_id: clientId }, select: { id: true } }).then((clientOrders) => {
      const orderIds = clientOrders.map((o) => o.id);
      if (orderIds.length === 0) return [];
      return prisma.supplierOrder.findMany({
        where: { parent_document_id: { in: orderIds } },
        orderBy: { created_at: 'asc' }
      });
    })
  ]);
  const supplierOrders = supplierOrdersRaw;

  return [
    ...quotes.map(q => ({ ...q, documentType: 'quote' })),
    ...invoices.map(inv => ({ ...inv, documentType: 'invoice' })),
    ...orders.map(ord => ({ ...ord, documentType: 'order' })),
    ...supplierOrders.map(so => ({ ...so, documentType: 'supplier_order' }))
  ];
}

// Построение цепочки документов
function buildDocumentChain(allDocuments: Document[], startDocumentId: string): ChainDocument[] {
  const chain: ChainDocument[] = [];
  const visited = new Set<string>();

  // Находим стартовый документ
  const startDoc = allDocuments.find(doc => doc.id === startDocumentId);
  if (!startDoc) {
    return chain;
  }

  // Добавляем стартовый документ
  chain.push({ ...startDoc, position: 0, level: 0 });
  visited.add(startDocumentId);

  // Строим цепочку вперед (производные документы)
  let currentDoc = startDoc;
  let position = 1;
  let level = 0;

  while (currentDoc) {
    let nextDoc = null;

    if (currentDoc.documentType === 'quote') {
      // КП → Счет (через parent_document_id)
      nextDoc = allDocuments.find(doc => 
        doc.documentType === 'invoice' && 
        doc.parent_document_id === currentDoc.id &&
        !visited.has(doc.id)
      );
    } else if (currentDoc.documentType === 'invoice') {
      // Счет → Заказ (через parent_document_id)
      nextDoc = allDocuments.find(doc => 
        doc.documentType === 'order' && 
        doc.parent_document_id === currentDoc.id &&
        !visited.has(doc.id)
      );
    } else if (currentDoc.documentType === 'order') {
      // Заказ → Заказ у поставщика (через parent_document_id)
      nextDoc = allDocuments.find(doc => 
        doc.documentType === 'supplier_order' && 
        doc.parent_document_id === currentDoc.id &&
        !visited.has(doc.id)
      );
    }

    if (nextDoc) {
      chain.push({ ...nextDoc, position, level, parentId: currentDoc.id });
      visited.add(nextDoc.id);
      currentDoc = nextDoc;
      position++;
    } else {
      break;
    }
  }

  // Строим цепочку назад (исходные документы)
  currentDoc = startDoc;
  position = -1;
  level = 0;

  while (currentDoc) {
    let prevDoc = null;

    if (currentDoc.documentType === 'invoice' && currentDoc.parent_document_id) {
      // Счет ← КП (через parent_document_id)
      prevDoc = allDocuments.find(doc => 
        doc.documentType === 'quote' && 
        doc.id === currentDoc.parent_document_id &&
        !visited.has(doc.id)
      );
    } else if (currentDoc.documentType === 'order' && currentDoc.parent_document_id) {
      // Заказ ← КП или Счет (через parent_document_id)
      prevDoc = allDocuments.find(doc => 
        (doc.documentType === 'quote' || doc.documentType === 'invoice') && 
        doc.id === currentDoc.parent_document_id &&
        !visited.has(doc.id)
      );
    } else if (currentDoc.documentType === 'supplier_order' && currentDoc.parent_document_id) {
      // Заказ у поставщика ← Заказ (через parent_document_id)
      prevDoc = allDocuments.find(doc => 
        doc.documentType === 'order' && 
        doc.id === currentDoc.parent_document_id &&
        !visited.has(doc.id)
      );
    }

    if (prevDoc) {
      chain.unshift({ ...prevDoc, position, level, childId: currentDoc.id });
      visited.add(prevDoc.id);
      currentDoc = prevDoc;
      position--;
    } else {
      break;
    }
  }

  // Сортируем по позиции
  return chain.sort((a, b) => a.position - b.position);
}
