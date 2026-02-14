import { NextRequest, NextResponse } from 'next/server';
import { documentService } from '@/lib/services/document.service';
import { canUserCreateDocument } from '@/lib/auth/permissions';
import { logger } from '@/lib/logging/logger';
import { createDocumentRequestSchema } from '@/lib/validation/document.schemas';
import { validateRequest } from '@/lib/validation/middleware';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { requirePermission } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';
import type { UserRole } from '@/lib/auth/roles';
import type { CreateDocumentRequest } from '@/lib/types/documents';

// POST /api/documents/create - Универсальное создание документов с автоматическими связями
async function handler(req: NextRequest, user: AuthenticatedUser): Promise<NextResponse> {
  const body = await req.json();
  
  // Валидация через Zod
  const validation = validateRequest(createDocumentRequestSchema, body);
  if (!validation.success) {
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Ошибка валидации данных',
      400,
      validation.errors
    );
  }

  const validatedBody = validation.data;

  logger.info(`Создание документа типа ${validatedBody.type}`, 'DOCUMENTS', {
    type: validatedBody.type,
    parentDocumentId: validatedBody.parent_document_id || 'нет',
    userId: user.userId
  });

  // Используем userId из токена если created_by не указан
  const finalCreatedBy = validatedBody.created_by || user.userId || 'system';

  // Используем Document Service для создания документа
  const request = { ...validatedBody, created_by: finalCreatedBy } as CreateDocumentRequest;

  const result = await documentService.createDocument(request);

  return apiSuccess(
    {
      document: {
        id: result.id,
        type: result.type,
        number: result.number,
        parent_document_id: result.parent_document_id,
        cart_session_id: result.cart_session_id,
        client_id: result.client_id,
        total_amount: result.total_amount,
        created_at: result.created_at,
        isNew: result.isNew
      }
    },
    'Документ успешно создан'
  );
}

export const POST = withErrorHandling(
  requirePermission((role: string) => canUserCreateDocument(role as UserRole, 'quote'), handler),
  'documents/create'
);
