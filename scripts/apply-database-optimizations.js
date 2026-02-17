#!/usr/bin/env node

/**
 * Скрипт для применения оптимизаций базы данных
 * Запуск: node scripts/apply-database-optimizations.js
 */

const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function applyDatabaseOptimizations() {
  console.log('🚀 Начинаем применение оптимизаций базы данных...');
  
  try {
    // 1. Применяем настройки SQLite
    console.log('\n🔧 1. Применяем настройки SQLite...');
    await prisma.$queryRaw`PRAGMA journal_mode = WAL`;
    await prisma.$queryRaw`PRAGMA synchronous = NORMAL`;
    await prisma.$queryRaw`PRAGMA cache_size = 10000`;
    await prisma.$queryRaw`PRAGMA temp_store = MEMORY`;
    await prisma.$queryRaw`PRAGMA mmap_size = 268435456`;
    await prisma.$queryRaw`PRAGMA optimize`;
    console.log('✅ Настройки SQLite применены');

    // 2. Создаем дополнительные индексы
    console.log('\n🔧 2. Создаем дополнительные индексы...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_products_sku_active ON products(sku, is_active)',
      'CREATE INDEX IF NOT EXISTS idx_products_category_active ON products(catalog_category_id, is_active)',
      'CREATE INDEX IF NOT EXISTS idx_products_price_range ON products(base_price) WHERE is_active = true',
      'CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_products_featured ON products(is_featured, is_active) WHERE is_featured = true',
      'CREATE INDEX IF NOT EXISTS idx_product_images_product_id ON product_images(product_id)',
      'CREATE INDEX IF NOT EXISTS idx_product_images_primary ON product_images(product_id, is_primary) WHERE is_primary = true',
      'CREATE INDEX IF NOT EXISTS idx_product_images_sort ON product_images(product_id, sort_order)',
      'CREATE INDEX IF NOT EXISTS idx_catalog_categories_level ON catalog_categories(level)',
      'CREATE INDEX IF NOT EXISTS idx_catalog_categories_active ON catalog_categories(is_active, level)',
      'CREATE INDEX IF NOT EXISTS idx_catalog_categories_sort ON catalog_categories(parent_id, sort_order)',
      'CREATE INDEX IF NOT EXISTS idx_import_history_category_date ON import_history(catalog_category_id, created_at DESC)',
      'CREATE INDEX IF NOT EXISTS idx_import_history_status ON import_history(status, created_at DESC)'
    ];

    for (const indexQuery of indexes) {
      try {
        await prisma.$executeRawUnsafe(indexQuery);
        console.log(`✅ Создан индекс: ${indexQuery.split(' ')[5]}`);
      } catch (error) {
        console.log(`⚠️ Индекс уже существует или ошибка: ${indexQuery.split(' ')[5]}`);
      }
    }

    // 3. Создаем виртуальные колонки для JSON полей
    console.log('\n🔧 3. Создаем виртуальные колонки...');
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
        expression: "json_extract(properties_data, '$.Общее_Тип покрытия')"
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
        console.log(`✅ Создана виртуальная колонка: ${column.name}`);
      } catch (error) {
        console.log(`⚠️ Колонка ${column.name} уже существует`);
      }
    }

    // 4. Создаем индексы на виртуальные колонки
    console.log('\n🔧 4. Создаем индексы на виртуальные колонки...');
    const virtualIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_products_style_virtual ON products(style_extracted)',
      'CREATE INDEX IF NOT EXISTS idx_products_model_virtual ON products(model_extracted)',
      'CREATE INDEX IF NOT EXISTS idx_products_color_virtual ON products(color_extracted)',
      'CREATE INDEX IF NOT EXISTS idx_products_finish_virtual ON products(finish_extracted)',
      'CREATE INDEX IF NOT EXISTS idx_products_width_virtual ON products(width_extracted)',
      'CREATE INDEX IF NOT EXISTS idx_products_height_virtual ON products(height_extracted)'
    ];

    for (const indexQuery of virtualIndexes) {
      try {
        await prisma.$executeRawUnsafe(indexQuery);
        console.log(`✅ Создан индекс на виртуальную колонку: ${indexQuery.split(' ')[5]}`);
      } catch (error) {
        console.log(`⚠️ Индекс уже существует: ${indexQuery.split(' ')[5]}`);
      }
    }

    // 5. Создаем таблицы для кэширования и мониторинга
    console.log('\n🔧 5. Создаем таблицы для кэширования и мониторинга...');
    
    // Таблица для кэширования запросов
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS query_cache (
        id TEXT PRIMARY KEY,
        cache_key TEXT UNIQUE NOT NULL,
        data TEXT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        hit_count INTEGER DEFAULT 0
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_query_cache_expires ON query_cache(expires_at)
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_query_cache_key ON query_cache(cache_key)
    `);

    // Таблица для статистики товаров
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS product_stats_cache (
        id TEXT PRIMARY KEY,
        catalog_category_id TEXT NOT NULL,
        total_products INTEGER DEFAULT 0,
        active_products INTEGER DEFAULT 0,
        featured_products INTEGER DEFAULT 0,
        price_min REAL DEFAULT 0,
        price_max REAL DEFAULT 0,
        avg_price REAL DEFAULT 0,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (catalog_category_id) REFERENCES catalog_categories(id) ON DELETE CASCADE
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_product_stats_category ON product_stats_cache(catalog_category_id)
    `);

    // Таблица для нормализации свойств товаров
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS product_property_values (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        property_name TEXT NOT NULL,
        property_value TEXT NOT NULL,
        property_type TEXT DEFAULT 'string',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_product_property_values_product ON product_property_values(product_id)
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_product_property_values_name ON product_property_values(property_name)
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_product_property_values_lookup ON product_property_values(property_name, property_value)
    `);

    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_product_property_values_unique ON product_property_values(product_id, property_name)
    `);

    // Таблица для мониторинга производительности
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS performance_stats (
        id TEXT PRIMARY KEY,
        table_name TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        execution_time_ms INTEGER NOT NULL,
        rows_affected INTEGER DEFAULT 0,
        query_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_performance_stats_table ON performance_stats(table_name, created_at DESC)
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_performance_stats_slow ON performance_stats(execution_time_ms DESC) WHERE execution_time_ms > 1000
    `);

    // Таблица для логирования медленных запросов
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS slow_query_log (
        id TEXT PRIMARY KEY,
        query_text TEXT NOT NULL,
        execution_time_ms INTEGER NOT NULL,
        rows_affected INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        user_id TEXT,
        ip_address TEXT
      )
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_slow_query_log_time ON slow_query_log(execution_time_ms DESC)
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_slow_query_log_date ON slow_query_log(created_at DESC)
    `);

    console.log('✅ Таблицы для кэширования и мониторинга созданы');

    // 6. Создаем триггеры для автоматического обновления статистики
    console.log('\n🔧 6. Создаем триггеры...');
    
    // Триггер для обновления счетчика товаров при добавлении
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS update_category_product_count_insert
        AFTER INSERT ON products
        BEGIN
          UPDATE catalog_categories 
          SET products_count = products_count + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = NEW.catalog_category_id;
          
          INSERT OR REPLACE INTO product_stats_cache (
            id, catalog_category_id, last_updated
          ) VALUES (
            NEW.catalog_category_id, NEW.catalog_category_id, CURRENT_TIMESTAMP
          );
        END
    `);

    // Триггер для обновления счетчика товаров при удалении
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS update_category_product_count_delete
        AFTER DELETE ON products
        BEGIN
          UPDATE catalog_categories 
          SET products_count = products_count - 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = OLD.catalog_category_id;
          
          INSERT OR REPLACE INTO product_stats_cache (
            id, catalog_category_id, last_updated
          ) VALUES (
            OLD.catalog_category_id, OLD.catalog_category_id, CURRENT_TIMESTAMP
          );
        END
    `);

    // Триггер для обновления статуса товара
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS update_category_product_count_status
        AFTER UPDATE OF is_active ON products
        BEGIN
          INSERT OR REPLACE INTO product_stats_cache (
            id, catalog_category_id, last_updated
          ) VALUES (
            NEW.catalog_category_id, NEW.catalog_category_id, CURRENT_TIMESTAMP
          );
        END
    `);

    // Триггер для очистки устаревшего кэша
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER IF NOT EXISTS cleanup_expired_cache
        AFTER INSERT ON query_cache
        BEGIN
          DELETE FROM query_cache WHERE expires_at < CURRENT_TIMESTAMP;
        END
    `);

    console.log('✅ Триггеры созданы');

    // 7. Инициализируем данные
    console.log('\n🔧 7. Инициализируем данные...');
    
    // Создаем начальную статистику для существующих категорий
    await prisma.$executeRawUnsafe(`
      INSERT OR IGNORE INTO product_stats_cache (id, catalog_category_id, last_updated)
      SELECT id, id, CURRENT_TIMESTAMP 
      FROM catalog_categories 
      WHERE id NOT IN (SELECT catalog_category_id FROM product_stats_cache)
    `);

    // Обновляем счетчики товаров в категориях
    await prisma.$executeRawUnsafe(`
      UPDATE catalog_categories 
      SET products_count = (
        SELECT COUNT(*) 
        FROM products 
        WHERE products.catalog_category_id = catalog_categories.id
      )
    `);

    console.log('✅ Данные инициализированы');

    // 8. Анализируем базу данных
    console.log('\n🔧 8. Анализируем базу данных...');
    await prisma.$queryRaw`ANALYZE`;
    console.log('✅ Анализ базы данных завершен');

    console.log('\n🎉 Все оптимизации успешно применены!');
    console.log('\n📊 Статистика:');
    
    // Получаем статистику по таблицам
    const productCount = await prisma.product.count();
    const categoryCount = await prisma.catalogCategory.count();
    const imageCount = await prisma.productImage.count();
    
    console.log(`- Товаров: ${productCount}`);
    console.log(`- Категорий: ${categoryCount}`);
    console.log(`- Изображений: ${imageCount}`);

  } catch (error) {
    console.error('❌ Ошибка при применении оптимизаций:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем скрипт
if (require.main === module) {
  applyDatabaseOptimizations()
    .then(() => {
      console.log('\n✅ Скрипт завершен успешно');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Критическая ошибка:', error);
      process.exit(1);
    });
}

module.exports = { applyDatabaseOptimizations };
