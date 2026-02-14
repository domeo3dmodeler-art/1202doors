import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, withErrorHandling } from '@/lib/api/response';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

async function getHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  
  logger.debug('Получение статистики комплектатора', 'complectator/stats', {}, loggingContext);
  
  // Получаем статистику клиентов
  const totalClients = await prisma.client.count({
    where: { isActive: true }
  }).catch(() => 0);

  // Получаем статистику КП (коммерческих предложений)
  const quotesInWork = await prisma.quote.count({
    where: { 
      status: { in: ['draft', 'sent', 'review'] }
    }
  }).catch(() => 0);

  // Получаем статистику счетов
  const totalInvoices = await prisma.invoice.count({
    where: { status: { not: 'CANCELLED' } }
  }).catch(() => 0);

  // Получаем статистику товаров из каталога
  const totalProducts = await prisma.product.count({
    where: { is_active: true }
  }).catch(() => 0);

  // Получаем статистику заказов
  const ordersInWork = await prisma.order.count({
    where: { 
      status: { in: ['new', 'processing', 'confirmed'] }
    }
  }).catch(() => 0);

  const completedOrders = await prisma.order.count({
    where: { 
      status: 'completed'
    }
  }).catch(() => 0);

  // Получаем последние активности
  const recentOrders = await prisma.order.findMany({
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

  const recentQuotes = await prisma.quote.findMany({
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

  const stats = {
    clients: {
      total: totalClients,
      active: totalClients
    },
    quotes: {
      inWork: quotesInWork,
      total: await prisma.quote.count().catch(() => 0)
    },
    invoices: {
      total: totalInvoices,
      pending: await prisma.invoice.count({
        where: { status: 'pending' }
      }).catch(() => 0)
    },
    products: {
      total: totalProducts,
      active: totalProducts
    },
    orders: {
      inWork: ordersInWork,
      completed: completedOrders,
      total: await prisma.order.count().catch(() => 0)
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
      ...recentQuotes.map(quote => ({
        id: quote.id,
        type: 'quote',
        title: `КП #${quote.number}`,
        client: `${quote.client.lastName} ${quote.client.firstName}`,
        status: quote.status,
        createdAt: quote.created_at,
        icon: '📄'
      }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10)
  };

  logger.info('Статистика комплектатора получена', 'complectator/stats', { stats }, loggingContext);

  return apiSuccess({
    stats,
    timestamp: new Date().toISOString()
  });
}

export const GET = withErrorHandling(
  requireAuthAndPermission(getHandler, 'complectator'),
  'complectator/stats/GET'
);
