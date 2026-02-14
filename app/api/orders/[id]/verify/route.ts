import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// POST /api/orders/[id]/verify - Проверка данных заказа
async function postHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  const body = await req.json();
  const { verification_status, verification_notes } = body;

  if (!verification_status) {
    throw new ValidationError('verification_status обязателен');
  }

  if (!['VERIFIED', 'FAILED'].includes(verification_status)) {
    throw new ValidationError('verification_status должен быть "VERIFIED" или "FAILED"');
  }

  // Получаем заказ
  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      invoice: {
        select: {
          id: true,
          number: true,
          cart_data: true
        }
      }
    }
  });

  if (!order) {
    throw new NotFoundError('Заказ', id);
  }

  // Проверяем наличие проекта
  if (!order.project_file_url) {
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Для проверки требуется загруженный проект/планировка',
      400,
      {
        verification_result: {
          has_project: false,
          can_verify: false
        }
      }
    );
  }

  // Извлекаем данные дверей из счета
  let invoiceDoorData: Array<{
    width: number;
    height: number;
    quantity: number;
    name: string;
    sku: string;
  }> = [];
  if (order.invoice?.cart_data) {
    try {
      const cartData = JSON.parse(order.invoice.cart_data);
      const items = cartData.items || [];
      invoiceDoorData = items.map((item: any) => ({
        width: item.width || 0,
        height: item.height || 0,
        quantity: item.quantity || item.qty || 1,
        name: item.name || item.model || '',
        sku: item.sku_1c || item.id || ''
      }));
    } catch (error) {
      logger.error('Error parsing cart_data', 'orders/[id]/verify', { error }, loggingContext);
    }
  }

  // Извлекаем данные дверей из проекта (door_dimensions)
  const projectDoorData = order.door_dimensions
    ? JSON.parse(order.door_dimensions)
    : [];

  // Сравниваем данные
  const comparisonResult = {
    invoice_items_count: invoiceDoorData.length,
    project_doors_count: projectDoorData.length,
    matches: invoiceDoorData.length === projectDoorData.length,
    details: [] as Array<{
      index: number;
      invoice: { width: number | null; height: number | null; quantity: number | null } | null;
      project: { width: number | null; height: number | null; quantity: number | null; opening_side?: string | null; latches_count?: number | null } | null;
      matches: boolean;
    }>
  };

  if (invoiceDoorData.length > 0 && projectDoorData.length > 0) {
    for (let i = 0; i < Math.max(invoiceDoorData.length, projectDoorData.length); i++) {
      const invoiceItem = invoiceDoorData[i];
      const projectDoor = projectDoorData[i];

      const detail = {
        index: i + 1,
        invoice: invoiceItem ? {
          width: invoiceItem.width || null,
          height: invoiceItem.height || null,
          quantity: invoiceItem.quantity || null
        } : null,
        project: projectDoor ? {
          width: projectDoor.width || null,
          height: projectDoor.height || null,
          quantity: projectDoor.quantity || null,
          opening_side: projectDoor.opening_side || null,
          latches_count: projectDoor.latches_count || null
        } : null,
        matches: invoiceItem && projectDoor
          ? invoiceItem.width === projectDoor.width &&
            invoiceItem.height === projectDoor.height &&
            invoiceItem.quantity === projectDoor.quantity
          : false
      };

      comparisonResult.details.push(detail);
    }
  }

  // Обновляем статус проверки
  const updatedOrder = await prisma.order.update({
    where: { id },
    data: {
      verification_status,
      verification_notes: verification_notes || null
    },
    include: {
      client: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true
        }
      },
      invoice: {
        select: {
          id: true,
          number: true,
          status: true
        }
      }
    }
  });

  return apiSuccess({
    order: updatedOrder,
    verification_result: {
      ...comparisonResult,
      verification_status,
      verification_notes: verification_notes || null
    }
  }, 'Проверка заказа выполнена');
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((request, user) => postHandler(request, user, { params })),
    'orders/[id]/verify/POST'
  )(req);
}

