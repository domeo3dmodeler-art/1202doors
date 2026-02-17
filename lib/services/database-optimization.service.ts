import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';

/**
 * Сервис оптимизации производительности базы данных
 * Включает кэширование, мониторинг и оптимизацию запросов
 */
export class DatabaseOptimizationService {
  private static instance: DatabaseOptimizationService;
  private queryCache = new Map<string, { data: any; expires: number }>();
  private slowQueryThreshold = 1000; // 1 секунда

  static getInstance(): DatabaseOptimizationService {
    if (!DatabaseOptimizationService.instance) {
      DatabaseOptimizationService.instance = new DatabaseOptimizationService();
    }
    return DatabaseOptimizationService.instance;
  }

  /**
   * Применяет оптимизации SQLite для лучшей производительности
   */
  async optimizeSQLiteSettings(): Promise<void> {
    try {
      logger.info('Применяем оптимизации SQLite', 'database-optimization-service');
      
      // Настройки для лучшей производительности
      await prisma.$executeRaw`PRAGMA journal_mode = WAL`;
      await prisma.$executeRaw`PRAGMA synchronous = NORMAL`;
      await prisma.$executeRaw`PRAGMA cache_size = 10000`;
      await prisma.$executeRaw`PRAGMA temp_store = MEMORY`;
      await prisma.$executeRaw`PRAGMA mmap_size = 268435456`;
      await prisma.$executeRaw`PRAGMA optimize`;
      
      logger.info('Настройки SQLite оптимизированы', 'database-optimization-service');
    } catch (error) {
      logger.error('Ошибка при оптимизации SQLite', 'database-optimization-service', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    }
  }

  /**
   * Создает виртуальные колонки для JSON полей
   */
  async createVirtualColumns(): Promise<void> {
    try {
      logger.info('Создаем виртуальные колонки для JSON полей', 'database-optimization-service');
      
      // Создаем виртуальные колонки для часто используемых JSON полей
      const virtualColumns = [
        {
          name: 'style_extracted',
          expression: "json_extract(properties_data, '$.Domeo_Стиль Web')"
        },
        {
          name: 'model_extracted',
          expression: "json_extract(properties_data, '$.Domeo_Название модели для Web')"
        },
        {
          name: 'color_extracted',
          expression: "json_extract(properties_data, '$.Цвет/Отделка')"
        },
        {
          name: 'finish_extracted',
          expression: "json_extract(properties_data, '$.Тип покрытия')"
        },
        {
          name: 'width_extracted',
          expression: "json_extract(properties_data, '$.Ширина/мм')"
        },
        {
          name: 'height_extracted',
          expression: "json_extract(properties_data, '$.Высота/мм')"
        }
      ];

      for (const column of virtualColumns) {
        try {
          await prisma.$executeRawUnsafe(
            `ALTER TABLE products ADD COLUMN ${column.name} TEXT GENERATED ALWAYS AS (${column.expression}) VIRTUAL`
          );
          logger.debug('Создана виртуальная колонка', 'database-optimization-service', { columnName: column.name });
        } catch (error) {
          // Колонка уже существует
          logger.debug('Колонка уже существует', 'database-optimization-service', { columnName: column.name });
        }
      }

      // Создаем индексы на виртуальные колонки
      const indexes = [
        'CREATE INDEX IF NOT EXISTS idx_products_style_virtual ON products(style_extracted)',
        'CREATE INDEX IF NOT EXISTS idx_products_model_virtual ON products(model_extracted)',
        'CREATE INDEX IF NOT EXISTS idx_products_color_virtual ON products(color_extracted)',
        'CREATE INDEX IF NOT EXISTS idx_products_finish_virtual ON products(finish_extracted)',
        'CREATE INDEX IF NOT EXISTS idx_products_width_virtual ON products(width_extracted)',
        'CREATE INDEX IF NOT EXISTS idx_products_height_virtual ON products(height_extracted)'
      ];

      for (const indexQuery of indexes) {
        await prisma.$executeRawUnsafe(indexQuery);
      }

      logger.info('Виртуальные колонки и индексы созданы', 'database-optimization-service');
    } catch (error) {
      logger.error('Ошибка при создании виртуальных колонок', 'database-optimization-service', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    }
  }

  /**
   * Обновляет статистику товаров в кэше
   */
  async updateProductStatsCache(): Promise<void> {
    try {
      logger.info('Обновляем кэш статистики товаров', 'database-optimization-service');
      
      const categories = await prisma.catalogCategory.findMany({
        select: { id: true, name: true }
      });

      for (const category of categories) {
        const stats = await prisma.product.aggregate({
          where: { catalog_category_id: category.id },
          _count: { id: true },
          _min: { base_price: true },
          _max: { base_price: true },
          _avg: { base_price: true }
        });

        const activeStats = await prisma.product.aggregate({
          where: { 
            catalog_category_id: category.id,
            is_active: true 
          },
          _count: { id: true }
        });

        const featuredStats = await prisma.product.aggregate({
          where: { 
            catalog_category_id: category.id,
            is_featured: true,
            is_active: true 
          },
          _count: { id: true }
        });

        await prisma.productStatsCache.upsert({
          where: { id: category.id },
          update: {
            total_products: stats._count.id,
            active_products: activeStats._count.id,
            featured_products: featuredStats._count.id,
            price_min: stats._min.base_price || 0,
            price_max: stats._max.base_price || 0,
            avg_price: stats._avg.base_price || 0,
            last_updated: new Date()
          },
          create: {
            id: category.id,
            catalog_category_id: category.id,
            total_products: stats._count.id,
            active_products: activeStats._count.id,
            featured_products: featuredStats._count.id,
            price_min: stats._min.base_price || 0,
            price_max: stats._max.base_price || 0,
            avg_price: stats._avg.base_price || 0
          }
        });
      }

      logger.info('Статистика обновлена', 'database-optimization-service', { categoriesCount: categories.length });
    } catch (error) {
      logger.error('Ошибка при обновлении статистики', 'database-optimization-service', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    }
  }

  /**
   * Нормализует JSON свойства товаров в отдельную таблицу
   */
  async normalizeProductProperties(): Promise<void> {
    try {
      logger.info('Нормализуем свойства товаров', 'database-optimization-service');
      
      const products = await prisma.product.findMany({
        select: {
          id: true,
          properties_data: true
        }
      });

      let processedCount = 0;
      for (const product of products) {
        if (!product.properties_data) continue;

        try {
          const properties = typeof product.properties_data === 'string' 
            ? JSON.parse(product.properties_data) 
            : product.properties_data;

          // Удаляем существующие записи для этого товара
          await prisma.productPropertyValue.deleteMany({
            where: { product_id: product.id }
          });

          // Создаем новые записи
          const propertyValues = Object.entries(properties).map(([name, value]) => ({
            product_id: product.id,
            property_name: name,
            property_value: String(value),
            property_type: this.detectPropertyType(value)
          }));

          if (propertyValues.length > 0) {
            await prisma.productPropertyValue.createMany({
              data: propertyValues
            });
            processedCount++;
          }
        } catch (error) {
          logger.error('Ошибка при обработке товара', 'database-optimization-service', error instanceof Error ? { error: error.message, stack: error.stack, productId: product.id } : { error: String(error), productId: product.id });
        }
      }

      logger.info('Нормализовано товаров', 'database-optimization-service', { processedCount });
    } catch (error) {
      logger.error('Ошибка при нормализации свойств', 'database-optimization-service', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    }
  }

  /**
   * Определяет тип свойства по значению
   */
  private detectPropertyType(value: any): string {
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    return 'string';
  }

  /**
   * Кэширует результат запроса
   */
  async cacheQuery<T>(
    cacheKey: string, 
    queryFn: () => Promise<T>, 
    ttlMinutes: number = 30
  ): Promise<T> {
    const now = Date.now();
    const cached = this.queryCache.get(cacheKey);

    if (cached && cached.expires > now) {
      logger.debug('Используем кэш для ключа', 'database-optimization-service', { cacheKey });
      return cached.data;
    }

    logger.debug('Выполняем запрос для ключа', 'database-optimization-service', { cacheKey });
    const startTime = Date.now();
    
    try {
      const result = await queryFn();
      const executionTime = Date.now() - startTime;

      // Сохраняем в кэш
      this.queryCache.set(cacheKey, {
        data: result,
        expires: now + (ttlMinutes * 60 * 1000)
      });

      // Логируем медленные запросы
      if (executionTime > this.slowQueryThreshold) {
        await this.logSlowQuery(cacheKey, executionTime);
      }

      return result;
    } catch (error) {
      logger.error('Ошибка при выполнении запроса', 'database-optimization-service', error instanceof Error ? { error: error.message, stack: error.stack, cacheKey } : { error: String(error), cacheKey });
      throw error;
    }
  }

  /**
   * Логирует медленные запросы
   */
  private async logSlowQuery(queryKey: string, executionTime: number): Promise<void> {
    try {
      await prisma.slowQueryLog.create({
        data: {
          query_text: queryKey,
          execution_time_ms: executionTime,
          rows_affected: 0, // Будет заполнено при необходимости
          created_at: new Date()
        }
      });
    } catch (error) {
      logger.error('Ошибка при логировании медленного запроса', 'database-optimization-service', error instanceof Error ? { error: error.message, stack: error.stack, queryKey } : { error: String(error), queryKey });
    }
  }

  /**
   * Очищает устаревший кэш
   */
  async cleanupExpiredCache(): Promise<void> {
    try {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [key, value] of this.queryCache.entries()) {
        if (value.expires <= now) {
          this.queryCache.delete(key);
          cleanedCount++;
        }
      }

      // Очищаем кэш в БД
      await prisma.queryCache.deleteMany({
        where: {
          expires_at: {
            lt: new Date()
          }
        }
      });

      logger.info('Очищено записей из кэша', 'database-optimization-service', { cleanedCount });
    } catch (error) {
      logger.error('Ошибка при очистке кэша', 'database-optimization-service', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    }
  }

  /**
   * Получает статистику производительности
   */
  async getPerformanceStats(): Promise<any> {
    try {
      const slowQueries = await prisma.slowQueryLog.findMany({
        orderBy: { execution_time_ms: 'desc' },
        take: 10
      });

      const performanceStats = await prisma.performanceStats.groupBy({
        by: ['table_name', 'operation_type'],
        _avg: { execution_time_ms: true },
        _count: { id: true },
        orderBy: { _avg: { execution_time_ms: 'desc' } }
      });

      const cacheStats = await prisma.queryCache.aggregate({
        _count: { id: true },
        _sum: { hit_count: true }
      });

      return {
        slowQueries,
        performanceStats,
        cacheStats: {
          totalCachedQueries: cacheStats._count.id,
          totalHits: cacheStats._sum.hit_count || 0
        },
        memoryCache: {
          size: this.queryCache.size
        }
      };
    } catch (error) {
      logger.error('Ошибка при получении статистики', 'database-optimization-service', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
      return null;
    }
  }

  /**
   * Оптимизирует индексы базы данных
   */
  async optimizeIndexes(): Promise<void> {
    try {
      logger.info('Оптимизируем индексы', 'database-optimization-service');
      
      // Анализируем использование индексов
      await prisma.$executeRaw`ANALYZE`;
      
      // Перестраиваем индексы для лучшей производительности
      await prisma.$executeRaw`REINDEX`;
      
      logger.info('Индексы оптимизированы', 'database-optimization-service');
    } catch (error) {
      logger.error('Ошибка при оптимизации индексов', 'database-optimization-service', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    }
  }

  /**
   * Выполняет полную оптимизацию базы данных
   */
  async performFullOptimization(): Promise<void> {
    try {
      logger.info('Начинаем полную оптимизацию базы данных', 'database-optimization-service');
      
      // 1. Применяем настройки SQLite
      await this.optimizeSQLiteSettings();
      
      // 2. Создаем виртуальные колонки
      await this.createVirtualColumns();
      
      // 3. Нормализуем свойства товаров
      await this.normalizeProductProperties();
      
      // 4. Обновляем статистику
      await this.updateProductStatsCache();
      
      // 5. Оптимизируем индексы
      await this.optimizeIndexes();
      
      // 6. Очищаем кэш
      await this.cleanupExpiredCache();
      
      logger.info('Полная оптимизация завершена', 'database-optimization-service');
    } catch (error) {
      logger.error('Ошибка при полной оптимизации', 'database-optimization-service', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    }
  }

  /**
   * Получает рекомендации по оптимизации
   */
  async getOptimizationRecommendations(): Promise<string[]> {
    const recommendations: string[] = [];
    
    try {
      // Проверяем медленные запросы
      const slowQueriesCount = await prisma.slowQueryLog.count({
        where: {
          execution_time_ms: { gt: 2000 } // Более 2 секунд
        }
      });

      if (slowQueriesCount > 0) {
        recommendations.push(`Найдено ${slowQueriesCount} медленных запросов (>2с). Рекомендуется добавить индексы.`);
      }

      // Проверяем размер кэша
      const cacheSize = this.queryCache.size;
      if (cacheSize > 1000) {
        recommendations.push(`Кэш содержит ${cacheSize} записей. Рекомендуется очистка.`);
      }

      // Проверяем статистику товаров
      const outdatedStats = await prisma.productStatsCache.count({
        where: {
          last_updated: {
            lt: new Date(Date.now() - 24 * 60 * 60 * 1000) // Старше 24 часов
          }
        }
      });

      if (outdatedStats > 0) {
        recommendations.push(`Статистика ${outdatedStats} категорий устарела. Рекомендуется обновление.`);
      }

      // Проверяем нормализацию свойств
      const productsWithoutNormalizedProps = await prisma.product.count({
        where: {
          property_values: {
            none: {}
          }
        }
      });

      if (productsWithoutNormalizedProps > 0) {
        recommendations.push(`${productsWithoutNormalizedProps} товаров не имеют нормализованных свойств.`);
      }

    } catch (error) {
      logger.error('Ошибка при получении рекомендаций', 'database-optimization-service', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    }

    return recommendations;
  }
}

// Экспортируем экземпляр сервиса
export const dbOptimizationService = DatabaseOptimizationService.getInstance();
