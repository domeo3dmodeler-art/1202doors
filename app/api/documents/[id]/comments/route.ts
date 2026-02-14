import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';

// GET /api/documents/[id]/comments - Получить комментарии документа
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let id: string | undefined;
  try {
    const resolved = await params;
    id = resolved.id;
    
    // Получаем комментарии для документа
    const comments = await prisma.documentComment.findMany({
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

    return NextResponse.json({ comments });
  } catch (error) {
    logger.error('Error fetching comments', 'documents/[id]/comments', error instanceof Error ? { error: error.message, stack: error.stack, id: id ?? undefined } : { error: String(error), id: id ?? undefined });
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

// POST /api/documents/[id]/comments - Добавить комментарий
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let id: string | undefined;
  try {
    const resolved = await params;
    id = resolved.id;
    const body = await request.json();
    const { text, user_id } = body;

    logger.debug('POST /api/documents/[id]/comments', 'documents/[id]/comments', {
      documentId: id,
      hasText: !!text,
      hasUserId: !!user_id
    });

    if (!text || !user_id) {
      logger.warn('Missing required fields', 'documents/[id]/comments', { documentId: id, hasText: !!text, hasUserId: !!user_id });
      return NextResponse.json(
        { error: 'Text and user_id are required' },
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

    // Создаем комментарий
    const comment = await prisma.documentComment.create({
      data: {
        document_id: id,
        user_id,
        text,
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

    return NextResponse.json({ comment });
  } catch (error) {
    logger.error('Error creating comment', 'documents/[id]/comments', error instanceof Error ? { error: error.message, stack: error.stack, id: id ?? undefined } : { error: String(error), id: id ?? undefined });
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    );
  }
}
