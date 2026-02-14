import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canUserEditClient, canUserDeleteClient } from '@/lib/auth/permissions';
import type { UserRole } from '@/lib/auth/roles';
import { isValidInternationalPhone, normalizePhoneForStorage } from '@/lib/utils/phone';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, ValidationError, BusinessRuleError } from '@/lib/api/errors';
import { updateClientSchema } from '@/lib/validation/client.schemas';
import { validateRequest } from '@/lib/validation/middleware';
import { clientRepository } from '@/lib/repositories/client.repository';
import { requireAuth, requirePermission } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// GET /api/clients/[id] - Получение клиента с документами
async function getHandler(
  request: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { id } = await params;
  
  const client = await clientRepository.findById(id);

  if (!client) {
    throw new NotFoundError('Клиент', id);
  }

  // Получаем документы клиента
  const documents = await clientRepository.getClientDocuments(id);

  // Получаем заказы у поставщика для всех заказов клиента
  // SupplierOrder связан с Order через parent_document_id
  const orderIds = documents.orders.map((order: any) => order.id);
  const supplierOrders = orderIds.length > 0 ? await prisma.supplierOrder.findMany({
    where: {
      parent_document_id: { in: orderIds }
    },
    orderBy: { created_at: 'desc' }
  }) : [];

  // Добавляем supplier_orders к каждому заказу
  const ordersWithSupplierOrders = documents.orders.map((order: any) => ({
    ...order,
    supplier_orders: supplierOrders.filter((so: any) => so.parent_document_id === order.id)
  }));

  // Безопасный парсинг customFields
  let customFields = {};
  try {
    customFields = JSON.parse(client.customFields || '{}');
  } catch (parseError) {
    logger.warn('Failed to parse client customFields as JSON', 'clients/[id]/GET', { clientId: id, customFields: client.customFields }, loggingContext);
    customFields = {};
  }

  return apiSuccess({
    client: {
      ...client,
      customFields,
      quotes: documents.quotes,
      invoices: documents.invoices,
      orders: ordersWithSupplierOrders
    }
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth(async (req: NextRequest, user: AuthenticatedUser) => {
      return await getHandler(req, user, { params });
    }),
    'clients/[id]/GET'
  )(request);
}

// PUT /api/clients/[id] - Обновление клиента
async function putHandler(
  request: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { id } = await params;
  const body = await request.json();

  // Валидация через Zod
  const validation = validateRequest(updateClientSchema, body);
  if (!validation.success) {
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Ошибка валидации данных',
      400,
      validation.errors
    );
  }

  const validatedData = validation.data;

  // Валидация телефона
  if (validatedData.phone && !isValidInternationalPhone(validatedData.phone)) {
    throw new ValidationError('Неверный формат телефона. Используйте международный формат (например: +7 999 123-45-67)');
  }

  // Нормализуем телефон для хранения
  const updateData: Parameters<typeof clientRepository.update>[1] = {
    ...validatedData,
    phone: validatedData.phone ? normalizePhoneForStorage(validatedData.phone) : undefined,
    customFields: validatedData.customFields ? JSON.stringify(validatedData.customFields) : undefined
  };

  const client = await clientRepository.update(id, updateData);

  // Безопасный парсинг customFields
  let customFields = {};
  try {
    customFields = JSON.parse(client.customFields || '{}');
  } catch (parseError) {
    logger.warn('Failed to parse client customFields as JSON', 'clients/[id]/PUT', { clientId: id, customFields: client.customFields }, loggingContext);
    customFields = {};
  }

  return apiSuccess(
    {
      ...client,
      customFields
    },
    'Клиент успешно обновлен'
  );
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requirePermission(
      (role: string) => canUserEditClient(role as UserRole),
      async (req: NextRequest, user: AuthenticatedUser) => {
        return await putHandler(req, user, { params });
      }
    ),
    'clients/[id]/PUT'
  )(request);
}

// DELETE /api/clients/[id] - Удаление клиента
async function deleteHandler(
  request: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { id } = await params;

  // Проверяем, что у клиента нет активных документов
  const documents = await clientRepository.getClientDocuments(id);
  
  const activeInvoices = documents.invoices.filter((inv: any) => inv.status !== 'CANCELLED').length;
  const activeQuotes = documents.quotes.filter((q: any) => q.status !== 'CANCELLED').length;
  const activeOrders = documents.orders.filter((ord: any) => ord.status !== 'CANCELLED').length;

  const totalActiveDocuments = activeInvoices + activeQuotes + activeOrders;

  if (totalActiveDocuments > 0) {
    throw new BusinessRuleError(
      `Нельзя удалить клиента с активными документами (Счетов: ${activeInvoices}, КП: ${activeQuotes}, Заказов: ${activeOrders})`
    );
  }

  await prisma.client.delete({
    where: { id }
  });

  return apiSuccess(
    null,
    'Клиент успешно удален'
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requirePermission(
      (role: string) => canUserDeleteClient(role as UserRole),
      async (req: NextRequest, user: AuthenticatedUser) => {
        return await deleteHandler(req, user, { params });
      }
    ),
    'clients/[id]/DELETE'
  )(request);
}

