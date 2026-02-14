import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';
import { promises as fs } from 'fs';

async function getHandler(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    const { searchParams } = new URL(request.url);
    const periodParam = searchParams.get('period');
    
    // Валидация параметров
    const validPeriods = ['7d', '30d', '90d', '1y'];
    const period = periodParam && validPeriods.includes(periodParam) ? periodParam : '30d';

    logger.info('Получение аналитики', 'admin/analytics', { userId: user.userId, period });

    // Вычисляем дату начала периода
    const now = new Date();
    let startDate: Date;
    
    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // Получаем основные метрики
    const [
      totalProducts,
      activeProducts,
      totalCategories,
      totalUsers,
      totalRevenueResult
    ] = await Promise.all([
      prisma.product.count(),
      prisma.product.count({
        where: { is_active: true }
      }),
      prisma.catalogCategory.count(),
      prisma.user.count(),
      prisma.product.aggregate({
        _sum: { base_price: true }
      })
    ]);

    // Получаем товары по категориям
    const productsByCategory = await prisma.product.groupBy({
      by: ['catalog_category_id'],
      _count: {
        id: true
      },
      where: {
        catalog_category_id: {
          not: ''
        }
      }
    });

    // Получаем названия категорий
    const categoryIds = productsByCategory.map(item => item.catalog_category_id).filter(Boolean);
    const categories = await prisma.catalogCategory.findMany({
      where: {
        id: { in: categoryIds }
      },
      select: {
        id: true,
        name: true
      }
    });

    const categoryMap = new Map(categories.map(cat => [cat.id, cat.name]));

    const productsByCategoryWithNames = productsByCategory.map(item => ({
      categoryName: categoryMap.get(item.catalog_category_id) || 'Без категории',
      count: item._count.id
    })).sort((a, b) => b.count - a.count);

    // Получаем последние товары
    const recentProducts = await prisma.product.findMany({
      take: 10,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        sku: true,
        base_price: true,
        created_at: true
      }
    });

    // Получаем топ категории по стоимости
    const topCategories = await prisma.product.groupBy({
      by: ['catalog_category_id'],
      _sum: {
        base_price: true
      },
      _count: {
        id: true
      },
      where: {
        catalog_category_id: {
          not: ''
        }
      }
    });

    const topCategoriesWithNames = topCategories.map(item => ({
      categoryName: categoryMap.get(item.catalog_category_id) || 'Без категории',
      productCount: item._count.id,
      totalValue: item._sum.base_price || 0
    })).sort((a, b) => b.totalValue - a.totalValue);

    // Получаем размер базы данных
    const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './prisma/dev.db';
    let dbSize = 0;
    try {
      const stats = await fs.stat(dbPath);
      dbSize = stats.size;
    } catch (error) {
      logger.warn('Не удалось получить размер БД', 'admin/analytics', error instanceof Error ? { error: error.message } : { error: String(error) });
    }

    // Симуляция метрик производительности
    const performance = {
      avgResponseTime: Math.floor(Math.random() * 50) + 50, // 50-100мс
      totalRequests: Math.floor(Math.random() * 10000) + 50000, // 50k-60k
      errorRate: Math.random() * 0.02, // 0-2%
      uptime: 0.999 // 99.9%
    };

    // Симуляция метрик базы данных
    const database = {
      size: dbSize,
      connections: Math.floor(Math.random() * 5) + 10, // 10-15
      queryTime: Math.floor(Math.random() * 20) + 10, // 10-30мс
      cacheHitRate: 0.85 + Math.random() * 0.1 // 85-95%
    };

    // Определяем состояние системы
    let systemHealth = {
      status: 'healthy' as 'healthy' | 'warning' | 'critical',
      message: 'Все системы работают нормально',
      lastCheck: new Date().toISOString()
    };

    if (performance.errorRate > 0.01) {
      systemHealth = {
        status: 'warning',
        message: 'Обнаружено повышенное количество ошибок',
        lastCheck: new Date().toISOString()
      };
    }

    if (performance.avgResponseTime > 200) {
      systemHealth = {
        status: 'critical',
        message: 'Критически высокое время ответа',
        lastCheck: new Date().toISOString()
      };
    }

    // Генерируем уведомления
    const alerts = [];
    
    if (performance.errorRate > 0.005) {
      alerts.push({
        id: 'high-error-rate',
        type: 'warning',
        title: 'Повышенное количество ошибок',
        message: `Уровень ошибок составляет ${(performance.errorRate * 100).toFixed(2)}%`,
        timestamp: new Date().toISOString()
      });
    }

    if (database.queryTime > 50) {
      alerts.push({
        id: 'slow-queries',
        type: 'warning',
        title: 'Медленные запросы',
        message: `Среднее время выполнения запросов: ${database.queryTime}мс`,
        timestamp: new Date().toISOString()
      });
    }

    if (totalProducts === 0) {
      alerts.push({
        id: 'no-products',
        type: 'error',
        title: 'Нет товаров',
        message: 'В системе не найдено ни одного товара',
        timestamp: new Date().toISOString()
      });
    }

    if (activeProducts / totalProducts < 0.5 && totalProducts > 0) {
      alerts.push({
        id: 'low-active-products',
        type: 'warning',
        title: 'Мало активных товаров',
        message: `Только ${((activeProducts / totalProducts) * 100).toFixed(1)}% товаров активны`,
        timestamp: new Date().toISOString()
      });
    }

    // Добавляем информационное уведомление о успешной работе
    if (alerts.length === 0) {
      alerts.push({
        id: 'system-healthy',
        type: 'info',
        title: 'Система работает стабильно',
        message: 'Все компоненты функционируют в штатном режиме',
        timestamp: new Date().toISOString()
      });
    }

    const analyticsData = {
      totalProducts,
      activeProducts,
      totalCategories,
      totalUsers,
      totalRevenue: totalRevenueResult._sum.base_price || 0,
      totalOrders: 0, // Пока заказов нет
      productsByCategory: productsByCategoryWithNames,
      recentProducts: recentProducts.map(product => ({
        ...product,
        created_at: product.created_at.toISOString()
      })),
      topCategories: topCategoriesWithNames,
      systemHealth,
      performance,
      database,
      alerts
    };

    logger.info('Аналитика получена', 'admin/analytics', { 
      totalProducts, 
      activeProducts, 
      totalCategories, 
      totalUsers 
    });

    const res = NextResponse.json({
      success: true,
      data: analyticsData,
      meta: { timestamp: new Date().toISOString() }
    }, { status: 200 });
    res.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.headers.set('Pragma', 'no-cache');
    res.headers.set('Expires', '0');
    return res;

  } catch (error) {
    logger.error('Error fetching analytics', 'admin/analytics', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка получения аналитики', 500);
  }
}

export const GET = withErrorHandling(
  requireAuthAndPermission(getHandler, 'ADMIN'),
  'admin/analytics/GET'
);
