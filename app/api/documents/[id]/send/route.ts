import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';

// POST /api/documents/[id]/send - Отправка документа клиенту
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let id: string | undefined;
  try {
    const resolved = await params;
    id = resolved.id;


    // Ищем документ в разных таблицах
    let document = null;
    let documentType = null;

    // Проверяем в таблице счетов
    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { client: true }
    });

    if (invoice) {
      document = invoice;
      documentType = 'invoice';
    } else {
      // Проверяем в таблице КП
      const quote = await prisma.quote.findUnique({
        where: { id },
        include: { client: true }
      });

      if (quote) {
        document = quote;
        documentType = 'quote';
      } else {
        // Проверяем в таблице заказов
        const order = await prisma.order.findUnique({
          where: { id },
          include: { client: true }
        });

        if (order) {
          document = order;
          documentType = 'order';
        }
      }
    }

    if (!document) {
      return NextResponse.json(
        { error: 'Документ не найден' },
        { status: 404 }
      );
    }

    if (!document.client?.phone) {
      return NextResponse.json(
        { error: 'У клиента не указана контактная информация' },
        { status: 400 }
      );
    }

    // Обновляем статус на "Отправлен" в соответствующей таблице
    let updatedDocument;
    if (documentType === 'invoice') {
      updatedDocument = await prisma.invoice.update({
        where: { id },
        data: { 
          status: 'SENT',
          updated_at: new Date()
        }
      });
    } else if (documentType === 'quote') {
      updatedDocument = await prisma.quote.update({
        where: { id },
        data: { 
          status: 'SENT',
          updated_at: new Date()
        }
      });
    } else if (documentType === 'order') {
      updatedDocument = await prisma.order.update({
        where: { id },
        data: { 
          status: 'SENT',
          updated_at: new Date()
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Документ отправлен клиенту',
      document: updatedDocument
    });

  } catch (error) {
    logger.error('Ошибка отправки документа', 'documents/[id]/send', error instanceof Error ? { error: error.message, stack: error.stack, id: id ?? undefined } : { error: String(error), id: id ?? undefined });
    return NextResponse.json(
      { error: 'Ошибка при отправке документа' },
      { status: 500 }
    );
  }
}
