import { NextRequest, NextResponse } from 'next/server';
import { dbOptimizationService } from '../../../../../lib/services/database-optimization.service';
import { logger } from '../../../../../lib/logging/logger';

// GET /api/admin/database/optimization - Получение статистики и рекомендаций
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'stats':
        const stats = await dbOptimizationService.getPerformanceStats();
        return NextResponse.json({
          success: true,
          stats
        });

      case 'recommendations':
        const recommendations = await dbOptimizationService.getOptimizationRecommendations();
        return NextResponse.json({
          success: true,
          recommendations
        });

      default:
        return NextResponse.json({
          success: true,
          message: 'API для оптимизации базы данных',
          endpoints: [
            'GET /api/admin/database/optimization?action=stats',
            'GET /api/admin/database/optimization?action=recommendations',
            'POST /api/admin/database/optimization?action=optimize',
            'POST /api/admin/database/optimization?action=update-stats',
            'POST /api/admin/database/optimization?action=normalize-properties',
            'POST /api/admin/database/optimization?action=cleanup-cache'
          ]
        });
    }
  } catch (error) {
    logger.error('Ошибка при получении данных оптимизации', 'admin/database/optimization', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return NextResponse.json(
      { error: 'Ошибка при получении данных оптимизации' },
      { status: 500 }
    );
  }
}

// POST /api/admin/database/optimization - Выполнение операций оптимизации
export async function POST(req: NextRequest) {
  let action: string | null = null;
  try {
    const { searchParams } = new URL(req.url);
    action = searchParams.get('action');

    if (!action) {
      return NextResponse.json(
        { error: 'Не указано действие' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'optimize':
        logger.info('Запуск полной оптимизации БД', 'admin/database/optimization');
        await dbOptimizationService.performFullOptimization();
        return NextResponse.json({
          success: true,
          message: 'Полная оптимизация базы данных завершена'
        });

      case 'update-stats':
        logger.info('Обновление статистики товаров', 'admin/database/optimization');
        await dbOptimizationService.updateProductStatsCache();
        return NextResponse.json({
          success: true,
          message: 'Статистика товаров обновлена'
        });

      case 'normalize-properties':
        logger.info('Нормализация свойств товаров', 'admin/database/optimization');
        await dbOptimizationService.normalizeProductProperties();
        return NextResponse.json({
          success: true,
          message: 'Свойства товаров нормализованы'
        });

      case 'cleanup-cache':
        logger.info('Очистка кэша', 'admin/database/optimization');
        await dbOptimizationService.cleanupExpiredCache();
        return NextResponse.json({
          success: true,
          message: 'Кэш очищен'
        });

      case 'optimize-sqlite':
        logger.info('Оптимизация настроек SQLite', 'admin/database/optimization');
        await dbOptimizationService.optimizeSQLiteSettings();
        return NextResponse.json({
          success: true,
          message: 'Настройки SQLite оптимизированы'
        });

      case 'create-virtual-columns':
        logger.info('Создание виртуальных колонок', 'admin/database/optimization');
        await dbOptimizationService.createVirtualColumns();
        return NextResponse.json({
          success: true,
          message: 'Виртуальные колонки созданы'
        });

      case 'optimize-indexes':
        logger.info('Оптимизация индексов', 'admin/database/optimization');
        await dbOptimizationService.optimizeIndexes();
        return NextResponse.json({
          success: true,
          message: 'Индексы оптимизированы'
        });

      default:
        return NextResponse.json(
          { error: `Неизвестное действие: ${action}` },
          { status: 400 }
        );
    }
  } catch (error) {
    logger.error(`Ошибка при выполнении действия`, 'admin/database/optimization', { action: action ?? 'unknown', error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined });
    return NextResponse.json(
      { 
        error: 'Ошибка при выполнении операции оптимизации',
        details: error instanceof Error ? error.message : 'Неизвестная ошибка'
      },
      { status: 500 }
    );
  }
}
