import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';

// GET /api/documents/[id]/history - Получить историю изменений документа
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let id: string | undefined;
  try {
    const resolved = await params;
    id = resolved.id;
    
    // Получаем историю изменений для документа
    const history = await prisma.documentHistory.findMany({
      where: { document_id: id },
      include: {
        user: {
          select: {
            first_name: true,
            last_name: true,
            middle_name: true,
            role: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    return NextResponse.json({ history });
  } catch (error) {
    logger.error('Error fetching history', 'documents/[id]/history', error instanceof Error ? { error: error.message, stack: error.stack, id: id ?? undefined } : { error: String(error), id: id ?? undefined });
    return NextResponse.json(
      { error: 'Failed to fetch history' },
      { status: 500 }
    );
  }
}

// POST /api/documents/[id]/history - Добавить запись в историю
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let id: string | undefined;
  try {
    const resolved = await params;
    id = resolved.id;
    const body = await request.json();
    const { action, old_value, new_value, user_id, details } = body;

    if (!action || !user_id) {
      return NextResponse.json(
        { error: 'Action and user_id are required' },
        { status: 400 }
      );
    }

    // Проверяем, существует ли документ
    const document = await prisma.quote.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!document) {
      // Проверяем в таблице invoices
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        select: { id: true }
      });

      if (!invoice) {
        // Проверяем в таблице supplier_orders
        const supplierOrder = await prisma.supplierOrder.findUnique({
          where: { id },
          select: { id: true }
        });

        if (!supplierOrder) {
          return NextResponse.json(
            { error: 'Document not found' },
            { status: 404 }
          );
        }
      }
    }

    // Создаем запись в истории
    const historyEntry = await prisma.documentHistory.create({
      data: {
        document_id: id,
        user_id,
        action,
        old_value: old_value || null,
        new_value: new_value || null,
        details: details || null,
        created_at: new Date()
      },
      include: {
        user: {
          select: {
            first_name: true,
            last_name: true,
            middle_name: true,
            role: true
          }
        }
      }
    });

    return NextResponse.json({ historyEntry });
  } catch (error) {
    logger.error('Error creating history entry', 'documents/[id]/history', error instanceof Error ? { error: error.message, stack: error.stack, id: id ?? undefined } : { error: String(error), id: id ?? undefined });
    return NextResponse.json(
      { error: 'Failed to create history entry' },
      { status: 500 }
    );
  }
}
