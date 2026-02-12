import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { getPropertyPhotos, structurePropertyPhotos } from '@/lib/property-photos';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';
import { getDoorsCategoryId } from '@/lib/catalog-categories';

// Кэш для фото
const photoCache = new Map<string, { data: any; timestamp: number }>();
const PHOTO_CACHE_TTL = 30 * 60 * 1000; // 30 минут для фото

// DELETE - очистка кэша
async function deleteHandler(
  req: NextRequest,
  user: ReturnType<typeof getAuthenticatedUser>
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  photoCache.clear();
  logger.info('Кэш photos-batch очищен', 'catalog/doors/photos-batch/DELETE', {}, loggingContext);
  return apiSuccess({ success: true, message: 'Кэш photos-batch очищен' });
}

export const DELETE = withErrorHandling(
  requireAuth(deleteHandler),
  'catalog/doors/photos-batch/DELETE'
);

async function postHandler(
  req: NextRequest
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  
  let models: string[];
  try {
    // Парсим JSON напрямую
    const body = await req.json();
    models = body?.models;
  } catch (jsonError) {
    logger.error('Ошибка парсинга JSON в photos-batch', 'catalog/doors/photos-batch/POST', { 
      error: jsonError instanceof Error ? jsonError.message : String(jsonError),
      stack: jsonError instanceof Error ? jsonError.stack : undefined
    }, loggingContext);
    return apiError('Неверный формат JSON в теле запроса', ApiErrorCode.VALIDATION_ERROR, 400);
  }
  
  if (!models || !Array.isArray(models)) {
    logger.warn('Неверный формат запроса photos-batch', 'catalog/doors/photos-batch/POST', { models }, loggingContext);
    throw new ValidationError('Неверный формат запроса: ожидается массив models');
  }

  logger.debug('Batch загрузка фото для моделей', 'catalog/doors/photos-batch/POST', { modelsCount: models.length }, loggingContext);

    const results: Record<string, any> = {};
    const uncachedModels: string[] = [];

    // Проверяем кэш для каждой модели
    for (const model of models) {
      const cacheKey = `photo_${model}`;
      const cached = photoCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp) < PHOTO_CACHE_TTL) {
        results[model] = cached.data;
      } else {
        uncachedModels.push(model);
      }
    }

    logger.debug('Статистика кэша', 'catalog/doors/photos-batch/POST', {
      cached: models.length - uncachedModels.length,
      toLoad: uncachedModels.length
    }, loggingContext);

    // Загружаем только не кэшированные модели
    if (uncachedModels.length > 0) {
      const doorsCategoryId = await getDoorsCategoryId();
      if (!doorsCategoryId) {
        return apiSuccess({ results: Object.fromEntries(models.map(m => [m, { photos: [], count: 0 }])) });
      }

      // Оптимизация: фильтруем товары по нужным моделям на уровне БД
      // Создаем условия для поиска моделей в properties_data
      const modelSearchConditions = uncachedModels.map(model => ({
        properties_data: {
          contains: `"Domeo_Название модели для Web":"${model}"`
        }
      }));

      // Получаем только товары с нужными моделями
      const products = await prisma.product.findMany({
        where: {
          catalog_category_id: doorsCategoryId,
          OR: modelSearchConditions.length > 0 ? modelSearchConditions : undefined
        },
        select: {
          properties_data: true
        },
        // Ограничиваем количество для оптимизации
        take: uncachedModels.length * 10 // Примерно 10 товаров на модель
      });

      logger.debug('Получено товаров из БД (оптимизировано)', 'catalog/doors/photos-batch/POST', { 
        productsCount: products.length,
        modelsRequested: uncachedModels.length
      }, loggingContext);

      // Создаем мапу модель -> артикул (для поиска фото по артикулу)
      const modelToValue = new Map<string, string>();
      
      for (const product of products) {
        try {
          let properties: any = {};
          
          if (product.properties_data) {
            if (typeof product.properties_data === 'string') {
              try {
                // Проверяем, что строка не пустая
                if (product.properties_data.trim().length === 0) {
                  continue;
                }
                properties = JSON.parse(product.properties_data);
              } catch (parseError) {
                logger.warn('Ошибка парсинга JSON для товара', 'catalog/doors/photos-batch/POST', {
                  dataType: typeof product.properties_data,
                  dataLength: product.properties_data?.length,
                  preview: typeof product.properties_data === 'string' ? product.properties_data.substring(0, 200) : null,
                  error: parseError
                }, loggingContext);
                continue; // Пропускаем этот товар
              }
            } else if (typeof product.properties_data === 'object') {
              properties = product.properties_data;
            } else {
              continue; // Пропускаем невалидные данные
            }
          }
          
          const modelName = properties['Domeo_Название модели для Web'];
          const article = properties['Артикул поставщика'];
          
          if (modelName && uncachedModels.includes(modelName)) {
            // Сохраняем артикул, а не название модели
            modelToValue.set(modelName, article || modelName);
          }
        } catch (error) {
          logger.warn('Ошибка обработки товара', 'catalog/doors/photos-batch/POST', { error }, loggingContext);
          // Пропускаем этот товар
        }
      }

      // Получаем фотографии из PropertyPhoto для каждой модели
      const photosByModel = new Map<string, any>();
      
      for (const [modelName, propertyValue] of modelToValue.entries()) {
        // Приводим propertyValue к нижнему регистру для поиска
        const normalizedPropertyValue = propertyValue.toLowerCase();
        
        logger.debug('Поиск фото для модели', 'catalog/doors/photos-batch/POST', {
          modelName,
          propertyValue,
          normalizedPropertyValue
        }, loggingContext);
        
        // Получаем фотографии для этой модели из PropertyPhoto
        // Сначала ищем по "Артикул поставщика" (т.к. фото привязаны по артикулу)
        let propertyPhotos = await getPropertyPhotos(
          doorsCategoryId,
          'Артикул поставщика',
          normalizedPropertyValue
        );
        
        logger.debug('Найдено фото для базового артикула', 'catalog/doors/photos-batch/POST', {
          propertyValue,
          photosCount: propertyPhotos.length
        }, loggingContext);
        
        // Всегда ищем фото для вариантов артикула (d2 → d2_1, d2_2, ...)
        logger.debug('Поиск фото для вариантов артикула', 'catalog/doors/photos-batch/POST', { propertyValue }, loggingContext);
        
        // Ищем фото для вариантов: d2 → d2_1, d2_2, d2_3 и т.д.
        for (let i = 1; i <= 10; i++) {
          const variantArticle = `${propertyValue}_${i}`;
          const variantPhotos = await getPropertyPhotos(
            doorsCategoryId,
            'Артикул поставщика',
            variantArticle.toLowerCase()
          );
          
          if (variantPhotos.length > 0) {
            logger.debug('Найдено фото для варианта артикула', 'catalog/doors/photos-batch/POST', {
              variantArticle,
              photosCount: variantPhotos.length
            }, loggingContext);
            propertyPhotos.push(...variantPhotos);
          }
        }
        
        // Если не найдено ни по артикулу, ни по вариантам, ищем по "Domeo_Название модели для Web"
        if (propertyPhotos.length === 0) {
          logger.debug('Фото не найдено, пробуем поиск по названию модели', 'catalog/doors/photos-batch/POST', { modelName }, loggingContext);
          propertyPhotos = await getPropertyPhotos(
            doorsCategoryId,
            'Domeo_Название модели для Web',
            normalizedPropertyValue
          );
        }
        
        logger.debug('Всего найдено фото для модели', 'catalog/doors/photos-batch/POST', {
          modelName,
          photosCount: propertyPhotos.length
        }, loggingContext);

        // Структурируем фотографии в обложку и галерею
        const photoStructure = structurePropertyPhotos(propertyPhotos);
        
        logger.debug('Структурированные фото для модели', 'catalog/doors/photos-batch/POST', {
          modelName,
          cover: photoStructure.cover,
          galleryCount: photoStructure.gallery.length
        }, loggingContext);
        
        // Путь из БД может быть с префиксом /uploads/ или без него
        // Нужно привести к единому формату: /uploads/...
        let finalPhotoPath = null;
        if (photoStructure.cover) {
          if (photoStructure.cover.startsWith('/uploads/')) {
            finalPhotoPath = photoStructure.cover;
          } else {
            finalPhotoPath = `/uploads/${photoStructure.cover}`;
          }
        }
        
        // То же для галереи
        const finalGalleryPaths = photoStructure.gallery.map(p => {
          if (p.startsWith('/uploads/')) return p;
          return `/uploads/${p}`;
        });
        
        logger.debug('Формируем результат для модели', 'catalog/doors/photos-batch/POST', {
          modelName,
          coverFromDB: photoStructure.cover,
          finalPhotoPath,
          startsWithUploads: finalPhotoPath?.startsWith('/uploads')
        }, loggingContext);
        
        photosByModel.set(modelName, {
          modelKey: modelName, // Используем полное имя модели для поиска фото
          photo: finalPhotoPath,
          photos: {
            cover: finalPhotoPath,
            gallery: finalGalleryPaths
          },
          hasGallery: photoStructure.gallery.length > 0
        });
      }

      // Формируем результаты и сохраняем в кэш
      for (const model of uncachedModels) {
        const modelData = photosByModel.get(model);
        const result = {
          model,
          modelKey: modelData?.modelKey || '',
          photo: modelData?.photo || null,
          photos: modelData?.photos || { cover: null, gallery: [] },
          hasGallery: modelData?.hasGallery || false
        };
        
        results[model] = result;
        
        // Сохраняем в кэш
        const cacheKey = `photo_${model}`;
        photoCache.set(cacheKey, { data: result, timestamp: Date.now() });
      }
    }

    logger.info('Batch загрузка завершена', 'catalog/doors/photos-batch/POST', {
      modelsRequested: models.length,
      modelsWithResults: Object.keys(results).length,
      firstModel: Object.keys(results)[0]
    }, loggingContext);

    return apiSuccess({
      photos: results
    });
}

// Публичный API - фото доступны всем
export const POST = withErrorHandling(
  postHandler,
  'catalog/doors/photos-batch/POST'
);
