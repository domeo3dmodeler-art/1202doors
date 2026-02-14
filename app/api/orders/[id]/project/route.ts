import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// POST /api/orders/[id]/project - Загрузка проекта/планировки
async function postHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;

  // Проверяем существование заказа
  const order = await prisma.order.findUnique({
    where: { id }
  });

  if (!order) {
    throw new NotFoundError('Заказ', id);
  }

  const formData = await req.formData();
  const file = formData.get('file') as File;

  if (!file) {
    throw new ValidationError('Файл не предоставлен');
  }

  // Валидация типа файла
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'application/acad',
    'application/x-dwg',
    'application/x-dxf',
    'image/vnd.dwg',
    'image/x-dwg'
  ];

  if (!allowedTypes.includes(file.type)) {
    throw new ValidationError('Неподдерживаемый тип файла. Разрешены: PDF, JPG, PNG, DWG, DXF');
  }

  // Валидация размера файла (максимум 1MB)
  const maxSize = 1 * 1024 * 1024; // 1MB
  if (file.size > maxSize) {
    throw new ValidationError('Файл слишком большой. Максимальный размер: 1MB');
  }

  // Создаем директорию для заказов если её нет
  // Сохраняем в public/uploads/orders для доступа через API route
  const uploadsDir = join(process.cwd(), 'public', 'uploads', 'orders', id);
  if (!existsSync(uploadsDir)) {
    await mkdir(uploadsDir, { recursive: true });
  }

  // Генерируем имя файла с сохранением оригинального имени
  const timestamp = Date.now();
  const extension = file.name.split('.').pop();
  // Безопасное имя файла: убираем недопустимые символы, но сохраняем читаемость
  const safeOriginalName = file.name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .substring(0, 100); // Ограничиваем длину
  const filename = `project_${timestamp}_${safeOriginalName}`;
  const filepath = join(uploadsDir, filename);

  // Сохраняем файл
  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  // URL файла для сохранения в БД
  // Используем /api/uploads/ для доступа через API route
  // Сохраняем оригинальное имя в query параметре для отображения
  const fileUrl = `/api/uploads/orders/${id}/${filename}?original=${encodeURIComponent(file.name)}`;

  // Обновляем заказ
  const updatedOrder = await prisma.order.update({
    where: { id },
    data: {
      project_file_url: fileUrl
    },
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true
        }
      }
    }
  });

  return apiSuccess({
    order: updatedOrder,
    file_url: fileUrl
  }, 'Файл проекта загружен');
}

// DELETE /api/orders/[id]/project - Удаление проекта/планировки
async function deleteHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;

  // Проверяем существование заказа
  const order = await prisma.order.findUnique({
    where: { id }
  });

  if (!order) {
    throw new NotFoundError('Заказ', id);
  }

  if (!order.project_file_url) {
    throw new ValidationError('Файл проекта не найден');
  }

  // Извлекаем путь к файлу из URL
  let filePath = order.project_file_url;
  
  // Убираем query параметры из URL
  if (filePath.includes('?')) {
    filePath = filePath.split('?')[0];
  }
  
  // Нормализуем путь: убираем /api/uploads/ или /uploads/
  if (filePath.startsWith('/api/uploads/')) {
    filePath = filePath.replace('/api/uploads/', '');
  } else if (filePath.startsWith('/uploads/')) {
    filePath = filePath.replace('/uploads/', '');
  }

  // Проверяем безопасность пути
  if (filePath.includes('..') || filePath.includes('~')) {
    throw new ValidationError('Небезопасный путь к файлу');
  }

  // Пробуем удалить файл из нового места (public/uploads)
  let fullPath = join(process.cwd(), 'public', 'uploads', filePath);
  let fileDeleted = false;

  if (existsSync(fullPath)) {
    try {
      await unlink(fullPath);
      fileDeleted = true;
      logger.debug('Файл удален из нового места', 'orders/[id]/project/DELETE', { filePath, fullPath });
    } catch (error) {
      logger.error('Ошибка при удалении файла из нового места', 'orders/[id]/project/DELETE', error instanceof Error ? { error: error.message, stack: error.stack, filePath, fullPath } : { error: String(error), filePath, fullPath });
    }
  }

  // Если файл не найден в новом месте, пробуем старое место (uploads)
  if (!fileDeleted) {
    const oldPath = join(process.cwd(), 'uploads', filePath);
    if (existsSync(oldPath)) {
      try {
        await unlink(oldPath);
        fileDeleted = true;
        logger.debug('Файл удален из старого места', 'orders/[id]/project/DELETE', { filePath, oldPath });
      } catch (error) {
        logger.error('Ошибка при удалении файла из старого места', 'orders/[id]/project/DELETE', error instanceof Error ? { error: error.message, stack: error.stack, filePath, oldPath } : { error: String(error), filePath, oldPath });
      }
    }
  }

  // Обновляем заказ, удаляя ссылку на файл
  const updatedOrder = await prisma.order.update({
    where: { id },
    data: {
      project_file_url: null
    },
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true
        }
      }
    }
  });

  if (!fileDeleted) {
    logger.warn('Файл не найден на диске, но ссылка удалена из БД', 'orders/[id]/project/DELETE', { filePath, orderId: id });
  }

  return apiSuccess({
    order: updatedOrder
  }, 'Файл проекта удален');
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((request, user) => postHandler(request, user, { params })),
    'orders/[id]/project/POST'
  )(req);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((request, user) => deleteHandler(request, user, { params })),
    'orders/[id]/project/DELETE'
  )(req);
}

