import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// PUT /api/orders/[id]/door-dimensions - Обновление данных дверей
async function putHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  const body = await req.json();
  const { door_dimensions, measurement_done, project_complexity } = body;

  // Проверяем существование заказа
  const order = await prisma.order.findUnique({
    where: { id }
  });

  if (!order) {
    throw new NotFoundError('Заказ', id);
  }

  // Валидация данных дверей
  if (door_dimensions && !Array.isArray(door_dimensions)) {
    throw new ValidationError('door_dimensions должен быть массивом');
  }

  if (door_dimensions) {
    for (const dimension of door_dimensions) {
      if (!dimension.width || !dimension.height || !dimension.quantity) {
        throw new ValidationError('Каждое измерение двери должно содержать width, height и quantity');
      }
    }
  }

  // Формируем данные для обновления
  const updateData: Record<string, unknown> = {};

  if (door_dimensions !== undefined) {
    updateData.door_dimensions = JSON.stringify(door_dimensions);
  }

  if (measurement_done !== undefined) {
    updateData.measurement_done = measurement_done;
  }

  if (project_complexity !== undefined) {
    if (project_complexity && !['SIMPLE', 'COMPLEX'].includes(project_complexity)) {
      throw new ValidationError('project_complexity должен быть "SIMPLE" или "COMPLEX"');
    }
    updateData.project_complexity = project_complexity;
  }

  // Обновляем заказ
  const updatedOrder = await prisma.order.update({
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
          total_amount: true,
          cart_data: true
        }
      }
    }
  });

  return apiSuccess({
    order: {
      ...updatedOrder,
      door_dimensions: updatedOrder.door_dimensions 
        ? JSON.parse(updatedOrder.door_dimensions) 
        : null
    }
  }, 'Данные дверей обновлены');
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((request, user) => putHandler(request, user, { params })),
    'orders/[id]/door-dimensions/PUT'
  )(req);
}

