/**
 * Удаление связанных с документом записей (комментарии, история) при удалении документа.
 * document_id в DocumentComment и DocumentHistory — полиморфная ссылка (строка id документа),
 * FK в Prisma не задан, поэтому каскад выполняем в коде.
 */
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';

export async function deleteDocumentCommentsAndHistory(documentId: string): Promise<void> {
  if (!documentId || typeof documentId !== 'string' || documentId.trim() === '') return;
  try {
    const [commentsResult, historyResult] = await Promise.all([
      prisma.documentComment.deleteMany({ where: { document_id: documentId } }),
      prisma.documentHistory.deleteMany({ where: { document_id: documentId } })
    ]);
    if (commentsResult.count > 0 || historyResult.count > 0) {
      logger.debug('Удалены связи документа', 'delete-document-relations', {
        documentId,
        commentsDeleted: commentsResult.count,
        historyDeleted: historyResult.count
      });
    }
  } catch (error) {
    logger.warn('Ошибка удаления комментариев/истории документа', 'delete-document-relations', {
      documentId,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

/** Удаление комментариев и истории для списка document_id (для массового удаления документов). */
export async function deleteDocumentCommentsAndHistoryForMany(documentIds: string[]): Promise<void> {
  const ids = documentIds.filter((id): id is string => typeof id === 'string' && id.trim() !== '');
  if (ids.length === 0) return;
  try {
    const [commentsResult, historyResult] = await Promise.all([
      prisma.documentComment.deleteMany({ where: { document_id: { in: ids } } }),
      prisma.documentHistory.deleteMany({ where: { document_id: { in: ids } } })
    ]);
    if (commentsResult.count > 0 || historyResult.count > 0) {
      logger.debug('Удалены связи документов (bulk)', 'delete-document-relations', {
        count: ids.length,
        commentsDeleted: commentsResult.count,
        historyDeleted: historyResult.count
      });
    }
  } catch (error) {
    logger.warn('Ошибка удаления комментариев/истории документов (bulk)', 'delete-document-relations', {
      count: ids.length,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}
