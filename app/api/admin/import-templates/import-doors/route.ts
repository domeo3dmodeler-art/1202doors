import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateDocumentFile } from '@/lib/validation/file-validation';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';
import { DoorsImportService } from '@/lib/services/doors-import.service';
import { getDoorsCategoryId } from '@/lib/catalog-categories';

/**
 * POST /api/admin/import-templates/import-doors
 * Импорт нового шаблона дверей из файла newdata.xlsx
 */
async function postHandler(
  req: NextRequest,
  user: ReturnType<typeof getAuthenticatedUser>
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const formData = await req.formData();
  const file = formData.get('file') as File;
  let categoryId = (formData.get('categoryId') as string)?.trim() || undefined;
  if (!categoryId) {
    categoryId = (await getDoorsCategoryId()) ?? undefined;
  }
  const mode = (formData.get('mode') as string) || 'preview'; // 'preview' или 'import'
  const updateMode = (formData.get('updateMode') as string) || 'merge'; // 'replace' | 'merge' | 'add_new'

  if (!file) {
    throw new ValidationError('Файл не предоставлен');
  }

  // Валидация файла
  const validation = validateDocumentFile(file);
  if (!validation.isValid) {
    throw new ValidationError(validation.error || 'Неверный формат файла');
  }

  logger.info('Импорт шаблона дверей', 'admin/import-templates/import-doors/POST', {
    fileName: file.name,
    fileSize: file.size,
    categoryId: categoryId || 'default',
    mode,
    updateMode,
    userId: user.userId
  }, loggingContext);

  try {
    // Читаем файл в буфер
    const buffer = Buffer.from(await file.arrayBuffer());

    // Создаем сервис импорта
    const importService = new DoorsImportService(categoryId || undefined);

    // Импортируем данные
    const result = await importService.importFromFile(buffer, {
      mode: mode as 'preview' | 'import',
      updateMode: updateMode as 'replace' | 'merge' | 'add_new',
      categoryId: categoryId || undefined
    });

    logger.info('Импорт шаблона дверей завершен', 'admin/import-templates/import-doors/POST', {
      success: result.success,
      models: result.models,
      coatings: result.coatings,
      errorsCount: result.errors.length,
      warningsCount: result.warnings.length
    }, loggingContext);

    return apiSuccess({
      result,
      message: mode === 'preview' ? 'Предпросмотр завершен' : 'Импорт завершен'
    });
  } catch (error) {
    logger.error('Ошибка импорта шаблона дверей', 'admin/import-templates/import-doors/POST', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    }, loggingContext);

    if (error instanceof ValidationError) {
      throw error;
    }

    return apiError(
      ApiErrorCode.INTERNAL_SERVER_ERROR,
      `Ошибка при импорте: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
      500
    );
  }
}

export const POST = withErrorHandling(
  requireAuthAndPermission(postHandler, 'ADMIN'),
  'admin/import-templates/import-doors/POST'
);

