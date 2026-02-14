import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, BusinessRuleError, InvalidStateError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';
import { canTransitionTo } from '@/lib/validation/status-transitions';
import { validateStatusTransitionRequirements } from '@/lib/validation/status-requirements';

// GET /api/orders/[id] - Получение заказа по ID
async function getHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          phone: true,
          address: true,
          objectId: true,
          compilationLeadNumber: true
        }
      },
      invoice: {
        select: {
          id: true,
          number: true,
          status: true,
          total_amount: true,
          cart_data: true,
          created_at: true
        }
      }
    }
  });

  if (!order) {
    throw new NotFoundError('Заказ', id);
  }

  // Получаем информацию о комплектаторе если есть
  let complectator_name = null;
  if (order.complectator_id) {
    const complectator = await prisma.user.findUnique({
      where: { id: order.complectator_id },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        middle_name: true
      }
    });

    if (complectator) {
      complectator_name = `${complectator.last_name} ${complectator.first_name.charAt(0)}.${complectator.middle_name ? complectator.middle_name.charAt(0) + '.' : ''}`;
    }
  }

  // Получаем информацию об исполнителе если есть
  let executor_name = null;
  if (order.executor_id) {
    const executor = await prisma.user.findUnique({
      where: { id: order.executor_id },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        middle_name: true
      }
    });

    if (executor) {
      executor_name = `${executor.last_name} ${executor.first_name.charAt(0)}.${executor.middle_name ? executor.middle_name.charAt(0) + '.' : ''}`;
    }
  }

  // Форматируем данные
  const formattedOrder = {
    id: order.id,
    number: order.number,
    client_id: order.client_id,
    invoice_id: order.invoice_id,
    lead_number: order.lead_number,
    complectator_id: order.complectator_id,
    complectator_name,
    executor_id: order.executor_id,
    executor_name,
    status: order.status,
    project_file_url: order.project_file_url,
    door_dimensions: order.door_dimensions ? JSON.parse(order.door_dimensions) : null,
    measurement_done: order.measurement_done,
    project_complexity: order.project_complexity,
    wholesale_invoices: order.wholesale_invoices ? JSON.parse(order.wholesale_invoices) : [],
    technical_specs: order.technical_specs ? JSON.parse(order.technical_specs) : [],
    verification_status: order.verification_status,
    verification_notes: order.verification_notes,
    notes: order.notes,
    created_at: order.created_at,
    updated_at: order.updated_at,
    cart_data: order.cart_data ? (() => {
      try {
        return typeof order.cart_data === 'string' ? JSON.parse(order.cart_data) : order.cart_data;
      } catch {
        return null;
      }
    })() : null,
    cart_session_id: order.cart_session_id,
    total_amount: order.total_amount,
    client: {
      id: order.client.id,
      firstName: order.client.firstName,
      lastName: order.client.lastName,
      middleName: order.client.middleName,
      phone: order.client.phone,
      address: order.client.address,
      objectId: order.client.objectId,
      compilationLeadNumber: order.client.compilationLeadNumber,
      fullName: `${order.client.lastName} ${order.client.firstName}${order.client.middleName ? ' ' + order.client.middleName : ''}`
    },
    invoice: order.invoice ? {
      ...order.invoice,
      cart_data: order.invoice.cart_data ? (() => {
        try {
          return typeof order.invoice.cart_data === 'string' ? JSON.parse(order.invoice.cart_data) : order.invoice.cart_data;
        } catch {
          return null;
        }
      })() : null
    } : null
  };

  return apiSuccess({ order: formattedOrder });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth(async (request: NextRequest, user: AuthenticatedUser) => {
      return await getHandler(request, user, { params });
    }),
    'orders/[id]/GET'
  )(req);
}

// PUT /api/orders/[id] - Обновление заказа
async function putHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  const body = await req.json();
  const {
    status,
    project_file_url,
    door_dimensions,
    measurement_done,
    project_complexity,
    wholesale_invoices,
    technical_specs,
    verification_status,
    verification_notes,
    notes,
    executor_id
  } = body;

  // Проверяем существование заказа
  const existingOrder = await prisma.order.findUnique({
    where: { id }
  });

  if (!existingOrder) {
    throw new NotFoundError('Заказ', id);
  }

  // Валидация переходов статусов
  if (status && status !== existingOrder.status) {
    // Проверяем валидность перехода через общую функцию
    if (!canTransitionTo('order', existingOrder.status, status)) {
      throw new InvalidStateError('Недопустимый переход статуса', {
        currentStatus: existingOrder.status,
        newStatus: status,
        documentType: 'order'
      });
    }

    // Проверяем обязательные поля для перехода в новый статус
    const orderForValidation = await prisma.order.findUnique({
      where: { id },
      select: {
        project_file_url: true,
        door_dimensions: true,
        measurement_done: true,
        project_complexity: true
      }
    });

    if (orderForValidation) {
      // Парсим door_dimensions если это строка
      let doorDimensions = orderForValidation.door_dimensions;
      if (typeof doorDimensions === 'string') {
        try {
          doorDimensions = JSON.parse(doorDimensions);
        } catch (e) {
          doorDimensions = null;
        }
      }

      // Используем project_file_url из body если он передан, иначе из БД
      const finalProjectFileUrl = project_file_url !== undefined ? project_file_url : orderForValidation.project_file_url;
      // Используем door_dimensions из body если они переданы, иначе из БД
      const finalDoorDimensions = door_dimensions !== undefined ? door_dimensions : doorDimensions;

      const validationResult = validateStatusTransitionRequirements(
        'order',
        existingOrder.status,
        status,
        {
          project_file_url: finalProjectFileUrl,
          door_dimensions: finalDoorDimensions,
          measurement_done: orderForValidation.measurement_done,
          project_complexity: orderForValidation.project_complexity
        }
      );

      if (!validationResult.valid) {
        throw new BusinessRuleError(validationResult.error || 'Не выполнены требования для перехода в новый статус');
      }
    }
  }

  // Формируем данные для обновления
  const updateData: Record<string, unknown> = {};

  if (status !== undefined) updateData.status = status;
  if (project_file_url !== undefined) updateData.project_file_url = project_file_url;
  if (door_dimensions !== undefined) updateData.door_dimensions = JSON.stringify(door_dimensions);
  if (measurement_done !== undefined) updateData.measurement_done = measurement_done;
  if (project_complexity !== undefined) updateData.project_complexity = project_complexity;
  if (wholesale_invoices !== undefined) updateData.wholesale_invoices = JSON.stringify(wholesale_invoices);
  if (technical_specs !== undefined) updateData.technical_specs = JSON.stringify(technical_specs);
  if (verification_status !== undefined) updateData.verification_status = verification_status;
  if (verification_notes !== undefined) updateData.verification_notes = verification_notes;
  if (notes !== undefined) updateData.notes = notes;
  if (executor_id !== undefined) updateData.executor_id = executor_id;

  // Обновляем заказ
  const order = await prisma.order.update({
    where: { id },
    data: updateData,
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          phone: true,
          address: true
        }
      },
      invoice: {
        select: {
          id: true,
          number: true,
          status: true,
          total_amount: true
        }
      }
    }
  });

  return apiSuccess({ order }, 'Заказ успешно обновлен');
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth(async (request: NextRequest, user: AuthenticatedUser) => {
      return await putHandler(request, user, { params });
    }),
    'orders/[id]/PUT'
  )(req);
}

// DELETE /api/orders/[id] - Удаление заказа
async function deleteHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  
  const order = await prisma.order.findUnique({
    where: { id }
  });

  if (!order) {
    throw new NotFoundError('Заказ', id);
  }

  await prisma.order.delete({
    where: { id }
  });

  return apiSuccess(null, 'Заказ успешно удален');
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth(async (request: NextRequest, user: AuthenticatedUser) => {
      return await deleteHandler(request, user, { params });
    }),
    'orders/[id]/DELETE'
  )(req);
}
