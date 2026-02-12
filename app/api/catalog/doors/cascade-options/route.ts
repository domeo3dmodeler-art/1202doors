import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { logger } from '@/lib/logging/logger';
import { getDoorsCategoryId } from '@/lib/catalog-categories';

// Простое кэширование в памяти (для продакшена лучше использовать Redis)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 минут

async function getHandler(
  req: NextRequest
): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const style = searchParams.get('style');
    const model = searchParams.get('model');
    const finish = searchParams.get('finish');
    const color = searchParams.get('color');
    const type = searchParams.get('type');
    const width = searchParams.get('width');
    const height = searchParams.get('height');
    const edge = searchParams.get('edge');

    logger.info('🔍 Каскадная фильтрация', 'catalog/doors/cascade-options', { style, model, finish, color, type, width, height, edge });

    // Проверяем кэш
    const cacheKey = `cascade_${style || 'all'}_${model || 'all'}_${finish || 'all'}_${color || 'all'}`;
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      logger.info('⚡ Используем кэшированные данные', 'catalog/doors/cascade-options', { cacheKey });
      return NextResponse.json(cached.data, {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=300' // 5 минут кэш в браузере
        }
      });
    }
    
    const doorsCategoryId = await getDoorsCategoryId();
    if (!doorsCategoryId) {
      return NextResponse.json({ styles: [], models: [], finishes: [], colors: [], types: [], widths: [], heights: [], edges: [] }, { status: 200 });
    }
    const products = await prisma.product.findMany({
      where: {
        catalog_category_id: doorsCategoryId
      },
      select: {
        properties_data: true
      }
    });

    // Фильтруем товары по выбранным параметрам
    // НЕ фильтруем по width и height - они нужны для показа всех доступных опций
    const filteredProducts = products.filter((product: { properties_data: unknown }) => {
      const properties = product.properties_data ?
        (typeof product.properties_data === 'string' ? JSON.parse(product.properties_data) : product.properties_data) : {};

      // Применяем фильтры по порядку
      if (style && properties['Domeo_Стиль Web'] !== style) return false;
      
      // Модель: по коду Domeo (Web) или по фабричному названию
      if (model && properties['Код модели Domeo (Web)'] !== model && properties['Domeo_Название модели для Web'] !== model) return false;
      if (finish && properties['Тип покрытия'] !== finish) return false;
      if (color && properties['Domeo_Цвет'] !== color) return false;
      if (type && properties['Тип конструкции'] !== type) return false;
      // НЕ фильтруем по width и height - они нужны для каскадной фильтрации
      
            // Фильтрация по кромке с новой логикой
            if (edge) {
              const edgeValue = properties['Кромка'];
              
              let hasMatchingEdge = false;
              
              if (edge === 'Нет') {
                // Если выбрано "Нет", то товар должен не иметь кромки или иметь значение "нет"
                hasMatchingEdge = !edgeValue || edgeValue === '-' || edgeValue === '' || 
                  edgeValue.toLowerCase() === 'нет' || edgeValue.toLowerCase() === 'no';
              } else if (edge === 'Да') {
                // Если выбрано "Да", то товар должен иметь кромку (любое значение кроме пустого/нет)
                hasMatchingEdge = edgeValue && edgeValue !== '-' && edgeValue !== '' && 
                  edgeValue.toLowerCase() !== 'нет' && edgeValue.toLowerCase() !== 'no';
              } else {
                // Если выбрано конкретное значение кромки, сравниваем с полем "Кромка"
                hasMatchingEdge = edgeValue === edge;
              }
              
              if (!hasMatchingEdge) return false;
            }

      return true;
    });

    logger.info(`📦 Отфильтровано товаров: ${filteredProducts.length} из ${products.length}`, 'catalog/doors/cascade-options');
    
    // Отладочная информация
    if (filteredProducts.length === 0 && model) {
      logger.debug('🔍 Отладка: проверяем соответствие модели', 'catalog/doors/cascade-options');
      const sampleProducts = products.slice(0, 5);
      sampleProducts.forEach((product: { properties_data: unknown }, index: number) => {
        const properties = product.properties_data ?
          (typeof product.properties_data === 'string' ? JSON.parse(product.properties_data) : product.properties_data) : {};
        logger.debug(`   Товар ${index + 1}: модель="${properties['Domeo_Название модели для Web']}", стиль="${properties['Domeo_Стиль Web']}"`, 'catalog/doors/cascade-options');
      });
    }

    // Собираем доступные опции для следующего уровня
    const availableOptions = {
      finish: new Set<string>(),
      color: new Set<string>(),
      type: new Set<string>(),
      width: new Set<number>(),
      height: new Set<number>(),
      edge: new Set<string>()
    };

    // Анализируем кромку для определения логики
    let hasNoEdgeWithoutCost = 0;  // Кромка "нет" без стоимости
    let hasNoEdgeWithCost = 0;     // Кромка "нет" со стоимостью
    let hasSpecificEdgeProducts = 0;
    const specificEdgeValues = new Set<string>();

    filteredProducts.forEach((product: { properties_data: unknown }) => {
      const properties = product.properties_data ?
        (typeof product.properties_data === 'string' ? JSON.parse(product.properties_data) : product.properties_data) : {};

      // Добавляем опции, которые еще не выбраны, ИЛИ уже выбраны (чтобы они отображались в селекте)
      if (properties['Тип покрытия']) availableOptions.finish.add(properties['Тип покрытия']);
      if (properties['Domeo_Цвет']) availableOptions.color.add(properties['Domeo_Цвет']);
      if (properties['Тип конструкции']) availableOptions.type.add(properties['Тип конструкции']);
      if (properties['Ширина/мм']) availableOptions.width.add(Number(properties['Ширина/мм']));
      if (properties['Высота/мм']) availableOptions.height.add(Number(properties['Высота/мм']));
      
      // Анализируем кромку
      const edgeValue = properties['Кромка'];
      const costValue = properties['Стоимость надбавки за кромку'];
      
      if (!edgeValue || edgeValue === '-' || edgeValue === '' || 
          edgeValue.toLowerCase() === 'нет' || edgeValue.toLowerCase() === 'no') {
        // Проверяем наличие стоимости надбавки
        if (costValue && costValue !== '-' && costValue !== '' && costValue !== null) {
          hasNoEdgeWithCost++;
        } else {
          hasNoEdgeWithoutCost++;
        }
      } else {
        hasSpecificEdgeProducts++;
        specificEdgeValues.add(edgeValue);
      }
    });

    // Определяем логику отображения кромки
    if (hasNoEdgeWithoutCost > 0 && hasNoEdgeWithCost === 0 && hasSpecificEdgeProducts === 0) {
      // Только товары без кромки и без стоимости - показываем "Не доступно для заказа"
      availableOptions.edge.add('Не доступно для заказа');
    } else if (hasNoEdgeWithCost > 0) {
      // Если есть товары со стоимостью кромки - показываем только Да/Нет
      availableOptions.edge.add('Нет');
      availableOptions.edge.add('Да');
    } else if (hasSpecificEdgeProducts > 0 && hasNoEdgeWithCost === 0 && hasNoEdgeWithoutCost === 0) {
      // Только товары с конкретной кромкой и без стоимости - показываем все значения
      specificEdgeValues.forEach(value => availableOptions.edge.add(value));
    } else {
      // Остальные случаи - показываем только "Нет"
      availableOptions.edge.add('Нет');
    }

    const responseData = {
      ok: true,
      filteredCount: filteredProducts.length,
      availableOptions: {
        finish: Array.from(availableOptions.finish).sort(),
        color: Array.from(availableOptions.color).sort(),
        type: Array.from(availableOptions.type).sort(),
        width: Array.from(availableOptions.width).sort((a, b) => a - b),
        height: Array.from(availableOptions.height).sort((a, b) => a - b),
        edge: Array.from(availableOptions.edge).sort()
      }
    };

    logger.info('✅ Каскадные опции получены', 'catalog/doors/cascade-options', { availableOptions: responseData.availableOptions });

    // Сохраняем в кэш
    cache.set(cacheKey, { data: responseData, timestamp: Date.now() });
    logger.info('💾 Сохранили в кэш', 'catalog/doors/cascade-options', { cacheKey });

    return NextResponse.json(responseData, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300' // 5 минут кэш в браузере
      }
    });
  } catch (error) {
    logger.error('Error in cascade filtering', 'catalog/doors/cascade-options', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка каскадной фильтрации', 500);
  }
}

// Публичный API - каталог доступен всем
export const GET = withErrorHandling(
  getHandler,
  'catalog/doors/cascade-options/GET'
);
