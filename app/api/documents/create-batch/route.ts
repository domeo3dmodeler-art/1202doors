import { NextRequest, NextResponse } from 'next/server';
import { generateCartSessionId } from '@/lib/utils/cart-session';
import { findExistingDocument } from '@/lib/documents/deduplication';
import { documentService } from '@/lib/services/document.service';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// POST /api/documents/create-batch - Создание нескольких документов из корзины
async function postHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const body = await req.json();
  const {
    cart_session_id, // ID сессии корзины (опционально, будет сгенерирован если не передан)
    client_id,
    items,
    total_amount,
    subtotal = 0,
    tax_amount = 0,
    notes,
    document_types = ['quote', 'invoice'], // Типы документов для создания
  } = body;

  // Генерируем cart_session_id если не передан
  const finalCartSessionId = cart_session_id || generateCartSessionId();

  logger.info('Создание документов из корзины', 'documents/create-batch', {
    documentTypes: document_types.join(', '),
    cartSessionId: finalCartSessionId
  }, loggingContext);

  // Валидация
  if (!client_id || !items || !Array.isArray(items)) {
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Необходимые поля: client_id, items',
      400
    );
  }

  const results: Array<{
    type: string;
    documentId: string | null;
    documentNumber: string;
    isNew: boolean;
    message: string;
  }> = [];
  const errors: Array<{
    type: string;
    error: string;
  }> = [];

  // Создаем каждый тип документа
  for (const type of document_types) {
    try {
      // Проверяем существующий документ
      const existingDocument = await findExistingDocument(
        type as 'quote' | 'invoice' | 'supplier_order',
        null,
        finalCartSessionId,
        client_id,
        items,
        total_amount
      );
      
      let documentId: string | null = null;
      let documentNumber: string;
      let isNew = false;

      if (existingDocument) {
        documentNumber = existingDocument.number;
        documentId = existingDocument.id;
        logger.debug(`Используем существующий ${type}`, 'documents/create-batch', {
          documentNumber,
          documentId
        }, loggingContext);
      } else {
        // Используем documentService для создания документа
        const document = await documentService.createDocument({
          type: type as 'quote' | 'invoice' | 'order' | 'supplier_order',
          client_id,
          items,
          total_amount,
          subtotal,
          tax_amount,
          notes,
          parent_document_id: null,
          cart_session_id: finalCartSessionId,
          created_by: user.userId || 'system'
        });

        documentId = document.id;
        documentNumber = document.number;
        isNew = true;
        logger.info(`Создан новый ${type}`, 'documents/create-batch', {
          documentNumber,
          documentId
        }, loggingContext);
      }

      results.push({
        type: type,
        documentId: documentId,
        documentNumber: documentNumber,
        isNew: isNew,
        message: isNew ? 'Создан новый документ' : 'Использован существующий документ'
      });

    } catch (error: unknown) {
      logger.error(`Ошибка создания ${type}`, 'documents/create-batch', { error }, loggingContext);
      errors.push({
        type: type,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      });
    }
  }

  return apiSuccess({
    cart_session_id: finalCartSessionId,
    results,
    errors,
    message: `Создано ${results.length} документов из корзины`
  });
}

export const POST = withErrorHandling(
  requireAuth(postHandler),
  'documents/create-batch/POST'
);
