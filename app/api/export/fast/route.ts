import { NextRequest, NextResponse } from 'next/server';
import { exportService } from '@/lib/services/export.service';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { exportDocumentRequestSchema } from '@/lib/validation/document.schemas';
import { validateRequest } from '@/lib/validation/middleware';
import { apiSuccess, apiError, ApiErrorCode, handleApiError, withErrorHandling } from '@/lib/api/response';

// POST /api/export/fast - Быстрый экспорт документов
async function handler(request: NextRequest): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const body = await request.json();
  
  // Валидация через Zod
  const validation = validateRequest(exportDocumentRequestSchema, body);
  if (!validation.success) {
    logger.warn('Validation failed', 'export/fast', { errors: validation.errors }, loggingContext);
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Ошибка валидации данных',
      400,
      validation.errors
    );
  }

  const validatedBody = validation.data;
  
  logger.debug('Fast export request', 'export/fast', { 
    type: validatedBody.type, 
    format: validatedBody.format, 
    clientId: validatedBody.clientId, 
    itemsCount: validatedBody.items.length, 
    totalAmount: validatedBody.totalAmount 
  }, loggingContext);

  let result;
  try {
    result = await exportService.exportDocument(validatedBody);
  } catch (exportError) {
    const message = exportError instanceof Error ? exportError.message : String(exportError);
    const stack = exportError instanceof Error ? exportError.stack : undefined;
    logger.error('Export failed', 'export/fast', { message, stack, type: validatedBody.type, format: validatedBody.format }, loggingContext);
    return apiError(
      ApiErrorCode.INTERNAL_SERVER_ERROR,
      `Ошибка экспорта документа: ${message}`,
      500,
      undefined
    );
  }

  // Возвращаем файл с информацией о документе
  // Убеждаемся, что filename содержит только латинские символы
  const safeFilename = result.filename.replace(/[^\x00-\x7F]/g, (char) => {
    const charCode = char.charCodeAt(0);
    if (charCode === 1050) return 'K'; // К
    if (charCode === 1055) return 'P'; // П
    if (charCode === 1057) return 'S'; // С
    if (charCode === 1095) return 'ch'; // ч
    if (charCode === 1077) return 'e'; // е
    if (charCode === 1090) return 't'; // т
    if (charCode === 1079) return 'z'; // з
    if (charCode === 1072) return 'a'; // а
    if (charCode === 1082) return 'k'; // к
    return 'X';
  });
  
  return new NextResponse(result.buffer, {
    headers: {
      'Content-Type': result.mimeType,
      'Content-Disposition': `attachment; filename="${safeFilename}"`,
      'Content-Length': result.buffer.length.toString(),
      'X-Document-Id': result.documentId || '',
      'X-Document-Type': result.documentType || '',
      'X-Document-Number': result.documentNumber || '',
      'Cache-Control': 'no-cache'
    }
  });
}

export const POST = withErrorHandling(handler, 'export/fast');

