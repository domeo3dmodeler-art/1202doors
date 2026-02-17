import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, withErrorHandling } from '@/lib/api/response';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';

async function getHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  
  logger.debug('Получение статистики исполнителя', 'executor/stats', { userId: user.userId }, loggingContext);
  
  // Получаем статистику заказов для исполнителя
  const totalOrders = await prisma.order.count({
    where: {
      executor_id: user.userId
    }
  }).catch(() => 0);

  // Заказы в работе (статусы исполнителя)
  const pendingOrders = await prisma.order.count({
    where: {
      executor_id: user.userId,
      status: {
        in: ['NEW_PLANNED', 'UNDER_REVIEW', 'AWAITING_MEASUREMENT', 'AWAITING_INVOICE', 'READY_FOR_PRODUCTION']
      }
    }
  }).catch(() => 0);

  // Завершенные заказы
  const completedOrders = await prisma.order.count({
    where: {
      executor_id: user.userId,
      status: 'COMPLETED'
    }
  }).catch(() => 0);

  // Получаем статистику заказов поставщиков
  const totalSupplierOrders = await prisma.supplierOrder.count({
    where: {
      executor_id: user.userId
    }
  }).catch(() => 0);

  const pendingSupplierOrders = await prisma.supplierOrder.count({
    where: {
      executor_id: user.userId,
      status: {
        in: ['PENDING', 'ORDERED', 'RECEIVED_FROM_SUPPLIER']
      }
    }
  }).catch(() => 0);

  const completedSupplierOrders = await prisma.supplierOrder.count({
    where: {
      executor_id: user.userId,
      status: 'COMPLETED'
    }
  }).catch(() => 0);

  // Получаем статистику счетов (для просмотра)
  const totalInvoices = await prisma.invoice.count({
    where: {
      order: {
        executor_id: user.userId
      }
    }
  }).catch(() => 0);

  // Получаем последние активности
  const recentOrders = await prisma.order.findMany({
    where: {
      executor_id: user.userId
    },
    take: 5,
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      number: true,
      status: true,
      created_at: true,
      client: {
        select: {
          firstName: true,
          lastName: true
        }
      }
    }
  }).catch(() => []);

  const recentSupplierOrders = await prisma.supplierOrder.findMany({
    where: {
      executor_id: user.userId
    },
    take: 5,
    orderBy: { created_at: 'desc' },
    select: {
      id: true,
      number: true,
      status: true,
      created_at: true,
      supplier_name: true
    }
  }).catch(() => []);

  const stats = {
    orders: {
      total: totalOrders,
      pending: pendingOrders,
      completed: completedOrders
    },
    supplierOrders: {
      total: totalSupplierOrders,
      pending: pendingSupplierOrders,
      completed: completedSupplierOrders
    },
    invoices: {
      total: totalInvoices
    },
    recentActivity: [
      ...recentOrders.map(order => ({
        id: order.id,
        type: 'order',
        title: `Заказ #${order.number}`,
        client: `${order.client.lastName} ${order.client.firstName}`,
        status: order.status,
        createdAt: order.created_at,
        icon: '📋'
      })),
      ...recentSupplierOrders.map(supplierOrder => ({
        id: supplierOrder.id,
        type: 'supplier_order',
        title: `Заказ поставщику #${supplierOrder.number}`,
        supplier: supplierOrder.supplier_name || 'Не указан',
        status: supplierOrder.status,
        createdAt: supplierOrder.created_at,
        icon: '📦'
      }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10)
  };

  logger.info('Статистика исполнителя получена', 'executor/stats', { stats, userId: user.userId }, loggingContext);

  return apiSuccess({
    stats,
    timestamp: new Date().toISOString()
  });
}

export const GET = withErrorHandling(
  requireAuthAndPermission(getHandler, 'executor'),
  'executor/stats/GET'
);

