import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';

// PUT /api/documents/[id]/comments/[commentId] - Редактировать комментарий
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  let id: string | undefined;
  let commentId: string | undefined;
  try {
    const resolved = await params;
    id = resolved.id;
    commentId = resolved.commentId;
    const body = await request.json();
    const { text } = body;

    if (!text) {
      return NextResponse.json(
        { error: 'Text is required' },
        { status: 400 }
      );
    }

    // Проверяем, существует ли комментарий
    const existingComment = await prisma.documentComment.findUnique({
      where: { id: commentId },
      select: { id: true, document_id: true }
    });

    if (!existingComment || existingComment.document_id !== id) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    // Обновляем комментарий
    const updatedComment = await prisma.documentComment.update({
      where: { id: commentId },
      data: {
        text,
        updated_at: new Date()
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

    return NextResponse.json({ comment: updatedComment });
  } catch (error) {
    logger.error('Error updating comment', 'documents/[id]/comments/[commentId]', error instanceof Error ? { error: error.message, stack: error.stack, id: id ?? undefined, commentId: commentId ?? undefined } : { error: String(error), id: id ?? undefined, commentId: commentId ?? undefined });
    return NextResponse.json(
      { error: 'Failed to update comment' },
      { status: 500 }
    );
  }
}

// DELETE /api/documents/[id]/comments/[commentId] - Удалить комментарий
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  let id: string | undefined;
  let commentId: string | undefined;
  try {
    const resolved = await params;
    id = resolved.id;
    commentId = resolved.commentId;

    // Проверяем, существует ли комментарий
    const existingComment = await prisma.documentComment.findUnique({
      where: { id: commentId },
      select: { id: true, document_id: true }
    });

    if (!existingComment || existingComment.document_id !== id) {
      return NextResponse.json(
        { error: 'Comment not found' },
        { status: 404 }
      );
    }

    // Удаляем комментарий
    await prisma.documentComment.delete({
      where: { id: commentId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error deleting comment', 'documents/[id]/comments/[commentId]', error instanceof Error ? { error: error.message, stack: error.stack, id: id ?? undefined, commentId: commentId ?? undefined } : { error: String(error), id: id ?? undefined, commentId: commentId ?? undefined });
    return NextResponse.json(
      { error: 'Failed to delete comment' },
      { status: 500 }
    );
  }
}
