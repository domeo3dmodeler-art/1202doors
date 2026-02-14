import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';
import { logger } from '../../../../lib/logging/logger';

export async function POST(request: NextRequest) {
  try {
    const { categoryIds } = await request.json();

    if (!categoryIds || !Array.isArray(categoryIds) || categoryIds.length === 0) {
      return NextResponse.json(
        { error: 'Category IDs are required' },
        { status: 400 }
      );
    }

    // Получаем все свойства товаров из указанных категорий
    const products = await prisma.product.findMany({
      where: {
        catalog_category_id: { in: categoryIds },
        is_active: true
      },
      select: {
        id: true,
        properties_data: true
      }
    });

    // Агрегируем свойства для создания фильтров
    const propertiesMap = new Map();

    products.forEach(product => {
      if (product.properties_data) {
        try {
          const props = typeof product.properties_data === 'string' 
            ? JSON.parse(product.properties_data) 
            : product.properties_data;
          
          Object.entries(props).forEach(([propertyName, propertyValue]) => {
            if (!propertiesMap.has(propertyName)) {
              propertiesMap.set(propertyName, {
                name: propertyName,
                type: 'select',
                values: new Map()
              });
            }

            if (propertyValue !== null && propertyValue !== undefined && propertyValue !== '') {
              const currentCount = propertiesMap.get(propertyName).values.get(propertyValue) || 0;
              propertiesMap.get(propertyName).values.set(propertyValue, currentCount + 1);
            }
          });
        } catch (error) {
          logger.warn('Error parsing properties for product', 'catalog/filters', { productId: product.id, error: error instanceof Error ? error.message : String(error) });
        }
      }
    });

    // Преобразуем в формат фильтров
    const filters = Array.from(propertiesMap.entries()).map(([name, data]: [string, { type: string; values: Map<unknown, number> }]) => {
      const options = Array.from(data.values.entries()).map(([value, count]: [unknown, number]) => ({
        value: String(value),
        label: String(value),
        count
      }));

      // Определяем тип фильтра
      let type = 'select';
      if (data.type === 'number' || data.type === 'decimal') {
        const numbers = options.map((opt: { value: string; label: string; count: number }) => parseFloat(opt.value)).filter(n => !isNaN(n));
        if (numbers.length > 0) {
          type = 'range';
          return {
            id: name.toLowerCase().replace(/\s+/g, '_'),
            name: name,
            type: 'range',
            options: options,
            min: Math.min(...numbers),
            max: Math.max(...numbers),
            step: 1
          };
        }
      }

      // Проверяем, являются ли значения цветами
      const colorPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
      if (options.length <= 10 && options.every((opt: { value: string; label: string; count: number }) => colorPattern.test(opt.value))) {
        type = 'color';
      }

      return {
        id: name.toLowerCase().replace(/\s+/g, '_'),
        name: name,
        type: type,
        options: options.slice(0, 20), // Ограничиваем количество опций
        multiple: type === 'select' && options.length > 5
      };
    });

    // Добавляем стандартные фильтры
    const standardFilters = [
      {
        id: 'price',
        name: 'Цена',
        type: 'range',
        options: [],
        min: 0,
        max: 100000,
        step: 100
      }
    ];

    const allFilters = [...standardFilters, ...filters];

    return NextResponse.json({
      success: true,
      filters: allFilters
    });

  } catch (error) {
    logger.error('Error fetching filters', 'catalog/filters', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
