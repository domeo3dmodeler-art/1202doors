import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';

// GET /api/documents/[id]/comments/count - Получить количество комментариев для документа
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let id: string | undefined;
  try {
    const resolved = await params;
    id = resolved.id;
    
    // Получаем количество комментариев для документа
    const count = await prisma.documentComment.count({
      where: { document_id: id }
    });

    return NextResponse.json({ count });
  } catch (error) {
    logger.error('Error fetching comments count', 'documents/[id]/comments/count', error instanceof Error ? { error: error.message, stack: error.stack, id: id ?? undefined } : { error: String(error), id: id ?? undefined });
    return NextResponse.json({ error: 'Failed to fetch comments count' }, { status: 500 });
  }
}
