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

// POST /api/orders/[id]/files - Загрузка оптовых счетов и техзаданий
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
  const wholesaleInvoices = formData.getAll('wholesale_invoices') as File[];
  const technicalSpecs = formData.getAll('technical_specs') as File[];

  // Валидация типов файлов
  const allowedInvoiceTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
    'application/vnd.ms-excel', // XLS
    'application/excel'
  ];

  const allowedTechSpecTypes = ['application/pdf'];

  const uploadedFiles: {
    wholesale_invoices: string[];
    technical_specs: string[];
  } = {
    wholesale_invoices: [],
    technical_specs: []
  };

  // Создаем директорию для заказов если её нет (в public/uploads для доступа через API)
  const uploadsDir = join(process.cwd(), 'public', 'uploads', 'orders', id);
  if (!existsSync(uploadsDir)) {
    await mkdir(uploadsDir, { recursive: true });
  }

  // Загрузка оптовых счетов
  for (const file of wholesaleInvoices) {
    if (file.size === 0) continue;

    if (!allowedInvoiceTypes.includes(file.type)) {
      throw new ValidationError(`Неподдерживаемый тип файла для оптового счета: ${file.name}. Разрешены: PDF, Excel`);
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new ValidationError(`Файл ${file.name} слишком большой. Максимальный размер: 10MB`);
    }

    const timestamp = Date.now();
    const extension = file.name.split('.').pop();
    // Безопасное имя файла: убираем недопустимые символы, но сохраняем читаемость
    const safeOriginalName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .substring(0, 100); // Ограничиваем длину
    const filename = `wholesale_invoice_${timestamp}_${safeOriginalName}`;
    const filepath = join(uploadsDir, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    // Сохраняем оригинальное имя в query параметре для отображения
    const fileUrl = `/api/uploads/orders/${id}/${filename}?original=${encodeURIComponent(file.name)}`;
    uploadedFiles.wholesale_invoices.push(fileUrl);
  }

  // Загрузка техзаданий
  for (const file of technicalSpecs) {
    if (file.size === 0) continue;

    if (!allowedTechSpecTypes.includes(file.type)) {
      throw new ValidationError(`Неподдерживаемый тип файла для техзадания: ${file.name}. Разрешен только PDF`);
    }

    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new ValidationError(`Файл ${file.name} слишком большой. Максимальный размер: 10MB`);
    }

    const timestamp = Date.now();
    const extension = file.name.split('.').pop();
    // Безопасное имя файла: убираем недопустимые символы, но сохраняем читаемость
    const safeOriginalName = file.name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .substring(0, 100); // Ограничиваем длину
    const filename = `tech_spec_${timestamp}_${safeOriginalName}`;
    const filepath = join(uploadsDir, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(filepath, buffer);

    // Сохраняем оригинальное имя в query параметре для отображения
    const fileUrl = `/api/uploads/orders/${id}/${filename}?original=${encodeURIComponent(file.name)}`;
    uploadedFiles.technical_specs.push(fileUrl);
  }

  // Получаем существующие файлы
  const existingWholesaleInvoices = order.wholesale_invoices 
    ? JSON.parse(order.wholesale_invoices) 
    : [];
  const existingTechnicalSpecs = order.technical_specs 
    ? JSON.parse(order.technical_specs) 
    : [];

  // Объединяем с новыми файлами
  const allWholesaleInvoices = [...existingWholesaleInvoices, ...uploadedFiles.wholesale_invoices];
  const allTechnicalSpecs = [...existingTechnicalSpecs, ...uploadedFiles.technical_specs];

  // Обновляем заказ
  const updatedOrder = await prisma.order.update({
    where: { id },
    data: {
      wholesale_invoices: JSON.stringify(allWholesaleInvoices),
      technical_specs: JSON.stringify(allTechnicalSpecs)
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
    files: {
      wholesale_invoices: allWholesaleInvoices,
      technical_specs: allTechnicalSpecs
    }
  }, 'Файлы загружены');
}

// DELETE /api/orders/[id]/files - Удаление оптовых счетов и техзаданий
async function deleteHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  const body = await req.json();
  const { fileUrl, fileType } = body; // fileType: 'wholesale_invoice' | 'technical_spec'

  if (!fileUrl || !fileType) {
    throw new ValidationError('Не указан URL файла или тип файла');
  }

  if (!['wholesale_invoice', 'technical_spec'].includes(fileType)) {
    throw new ValidationError('Неверный тип файла. Допустимые значения: wholesale_invoice, technical_spec');
  }

  // Проверяем существование заказа
  const order = await prisma.order.findUnique({
    where: { id }
  });

  if (!order) {
    throw new NotFoundError('Заказ', id);
  }

  // Удаляем query параметры из URL
  let filePath = fileUrl.split('?')[0];
  
  // Нормализуем путь: убираем /api/uploads/ или /uploads/
  if (filePath.startsWith('/api/uploads/')) {
    filePath = filePath.replace('/api/uploads/', '');
  } else if (filePath.startsWith('/uploads/')) {
    filePath = filePath.replace('/uploads/', '');
  }

  // Проверяем безопасность пути
  if (filePath.includes('..') || !filePath.startsWith(`orders/${id}/`)) {
    throw new ValidationError('Небезопасный путь к файлу');
  }

  // Полный путь к файлу
  const fullPath = join(process.cwd(), 'public', 'uploads', filePath);
  const oldPath = join(process.cwd(), 'uploads', filePath);

  // Удаляем файл с диска
  try {
    if (existsSync(fullPath)) {
      await unlink(fullPath);
    } else if (existsSync(oldPath)) {
      await unlink(oldPath);
    }
  } catch (error) {
    logger.warn('Не удалось удалить файл с диска', 'orders/[id]/files/DELETE', { error, filePath }, loggingContext);
    // Продолжаем выполнение, даже если файл не найден на диске
  }

  // Получаем существующие файлы
  const existingWholesaleInvoices = order.wholesale_invoices 
    ? JSON.parse(order.wholesale_invoices) 
    : [];
  const existingTechnicalSpecs = order.technical_specs 
    ? JSON.parse(order.technical_specs) 
    : [];

  // Удаляем файл из массива
  let updatedWholesaleInvoices = existingWholesaleInvoices;
  let updatedTechnicalSpecs = existingTechnicalSpecs;

  if (fileType === 'wholesale_invoice') {
    updatedWholesaleInvoices = existingWholesaleInvoices.filter((url: string) => url !== fileUrl);
  } else if (fileType === 'technical_spec') {
    updatedTechnicalSpecs = existingTechnicalSpecs.filter((url: string) => url !== fileUrl);
  }

  // Обновляем заказ
  const updatedOrder = await prisma.order.update({
    where: { id },
    data: {
      wholesale_invoices: JSON.stringify(updatedWholesaleInvoices),
      technical_specs: JSON.stringify(updatedTechnicalSpecs)
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

  logger.info('Файл удален', 'orders/[id]/files/DELETE', {
    orderId: id,
    fileUrl,
    fileType,
    userId: user.userId
  }, loggingContext);

  return apiSuccess({
    order: updatedOrder,
    files: {
      wholesale_invoices: updatedWholesaleInvoices,
      technical_specs: updatedTechnicalSpecs
    }
  }, 'Файл удален');
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((request, user) => postHandler(request, user, { params })),
    'orders/[id]/files/POST'
  )(req);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((request, user) => deleteHandler(request, user, { params })),
    'orders/[id]/files/DELETE'
  )(req);
}

