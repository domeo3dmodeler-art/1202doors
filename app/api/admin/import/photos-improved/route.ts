import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import type { AuthenticatedUser } from '@/lib/auth/request-helpers';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { validateImageFile, generateUniqueFileName } from '../../../../../lib/validation/file-validation';
import { uploadRateLimiter, getClientIP, createNextRateLimitResponse } from '../../../../../lib/security/rate-limiter';

// POST /api/admin/import/photos-improved - Улучшенная загрузка фотографий товаров
async function postHandler(request: NextRequest, user: AuthenticatedUser): Promise<NextResponse> {
  try {
    // Rate limiting
    const clientIP = getClientIP(request);
    if (!uploadRateLimiter.isAllowed(clientIP)) {
      return createNextRateLimitResponse(uploadRateLimiter, clientIP);
    }

    const formData = await request.formData();
    const photos = formData.getAll('photos') as File[];
    const category = formData.get('category') as string;
    const mappingProperty = formData.get('mapping_property') as string;

    logger.info('Улучшенная загрузка фото', 'admin/import/photos-improved', { 
      userId: user.userId,
      photosCount: photos.length, 
      category, 
      mappingProperty 
    });

    if (!photos || photos.length === 0) {
      throw new ValidationError('Не выбраны фотографии для загрузки');
    }

    if (!category) {
      throw new ValidationError('Не указана категория для загрузки');
    }

    if (!mappingProperty) {
      throw new ValidationError('Не указано свойство для привязки фото');
    }

    // Создаем директорию для загрузки
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'products', category);
    
    try {
      await mkdir(uploadDir, { recursive: true });
      logger.debug('Директория создана', 'admin/import/photos-improved', { uploadDir });
    } catch (error) {
      logger.debug('Директория уже существует или ошибка создания', 'admin/import/photos-improved', error instanceof Error ? { error: error.message } : { error: String(error) });
    }

    const uploadedPhotos: any[] = [];
    const uploadErrors: string[] = [];

    // Загружаем фотографии
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      
      try {
        logger.debug(`Загружаем фото ${i + 1}/${photos.length}`, 'admin/import/photos-improved', { photoName: photo.name, photoIndex: i + 1, totalPhotos: photos.length });
        
        // Валидация файла
        const validation = validateImageFile(photo);
        if (!validation.isValid) {
          uploadErrors.push(`Ошибка валидации ${photo.name}: ${validation.error}`);
          continue;
        }
        
        const bytes = await photo.arrayBuffer();
        const buffer = Buffer.from(bytes);
        
        // Генерируем безопасное уникальное имя файла
        const fileName = generateUniqueFileName(photo.name);
        const filePath = path.join(uploadDir, fileName);
        
        await writeFile(filePath, buffer);
        
        // Сохраняем информацию о загруженной фотографии
        uploadedPhotos.push({
          originalName: photo.name,
          fileName: fileName,
          filePath: `/uploads/products/${category}/${fileName}`,
          size: photo.size,
          type: photo.type
        });
        
        logger.debug(`Photo ${i} uploaded successfully`, 'admin/import/photos-improved', { fileName, size: photo.size });
        
      } catch (error) {
        logger.error(`Error uploading photo ${i}`, 'admin/import/photos-improved', error instanceof Error ? { error: error.message } : { error: String(error) });
        uploadErrors.push(`Ошибка при загрузке ${photo.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Привязываем фото к товарам
    let linkedPhotos = 0;
    if (mappingProperty && uploadedPhotos.length > 0) {
      logger.debug('Привязка фото к товарам по свойству', 'admin/import/photos-improved', { mappingProperty });
      
      try {
        // Получаем все товары из категории
        const products = await prisma.product.findMany({
          where: {
            catalog_category_id: category
          },
          select: {
            id: true,
            sku: true,
            properties_data: true
          }
        });
        
        logger.debug(`Найдено товаров в категории`, 'admin/import/photos-improved', { category, productsCount: products.length });
        
        for (const photo of uploadedPhotos) {
          // Извлекаем имя файла без расширения для поиска
          const fileNameWithoutExt = path.parse(photo.originalName).name;
          
          logger.debug(`Обработка фото`, 'admin/import/photos-improved', { originalName: photo.originalName, fileNameWithoutExt });
          
          // Находим товары с таким же значением свойства
          const matchingProducts = products.filter(product => {
            try {
              const properties = JSON.parse(product.properties_data || '{}');
              const propertyValue = properties[mappingProperty];
              
              if (propertyValue) {
                const valueStr = propertyValue.toString().trim();
                const fileNameStr = fileNameWithoutExt.trim();
                const exactMatch = valueStr === fileNameStr;
                
                if (exactMatch) {
                  logger.debug(`Найдено совпадение для товара`, 'admin/import/photos-improved', { productSku: product.sku, valueStr, fileNameStr });
                  return true;
                }
              }
              
              return false;
            } catch (error) {
              logger.error(`Ошибка при обработке товара`, 'admin/import/photos-improved', { productSku: product.sku, error: error instanceof Error ? error.message : String(error) });
              return false;
            }
          });
          
          logger.debug(`Найдено товаров для фото`, 'admin/import/photos-improved', { photoName: photo.originalName, matchingProductsCount: matchingProducts.length });
          
          // Привязываем фото ко всем найденным товарам
          for (const product of matchingProducts) {
            try {
              const currentProperties = JSON.parse(product.properties_data || '{}');
              
              // Инициализируем массив photos если его нет
              if (!currentProperties.photos) {
                currentProperties.photos = [];
              }
              
              // Извлекаем точное имя файла без расширения
              const exactFileName = photo.originalName.replace(/\.[^/.]+$/, ""); // Убираем расширение
              
              // Ищем существующее фото с таким же именем (включая суффиксы)
              const existingPhotoIndex = currentProperties.photos.findIndex((existingPhoto: string) => {
                const existingFileName = existingPhoto.split('/').pop()?.replace(/\.[^/.]+$/, "") || '';
                return existingFileName === exactFileName;
              });
              
              if (existingPhotoIndex !== -1) {
                // Заменяем существующее фото
                currentProperties.photos[existingPhotoIndex] = photo.filePath;
                
                await prisma.product.update({
                  where: { id: product.id },
                  data: {
                    properties_data: JSON.stringify(currentProperties)
                  }
                });
                
                linkedPhotos++;
                logger.debug(`Фото заменено для товара`, 'admin/import/photos-improved', { originalName: photo.originalName, productSku: product.sku });
              } else {
                // Добавляем новое фото в галерею
                currentProperties.photos.push(photo.filePath);
                
                await prisma.product.update({
                  where: { id: product.id },
                  data: {
                    properties_data: JSON.stringify(currentProperties)
                  }
                });
                
                linkedPhotos++;
                logger.debug(`Фото добавлено в галерею товара`, 'admin/import/photos-improved', { originalName: photo.originalName, productSku: product.sku });
              }
            } catch (error) {
              logger.error(`Ошибка при привязке фото к товару`, 'admin/import/photos-improved', { productSku: product.sku, error: error instanceof Error ? error.message : String(error) });
            }
          }
        }
        
      } catch (error) {
        logger.error('Ошибка при привязке фото к товарам', 'admin/import/photos-improved', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
      }
    }

    const result = {
      success: true,
      uploaded: uploadedPhotos.length,
      linked: linkedPhotos,
      errors: uploadErrors.length,
      details: uploadErrors,
      photos: uploadedPhotos.map(photo => ({
        originalName: photo.originalName,
        fileName: photo.fileName,
        filePath: photo.filePath,
        size: photo.size
      }))
    };

    logger.info('Результат загрузки', 'admin/import/photos-improved', { 
      uploaded: result.uploaded,
      linked: result.linked,
      errors: result.errors
    });

    return apiSuccess(result);

  } catch (error) {
    logger.error('Ошибка при загрузке фотографий', 'admin/import/photos-improved', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof ValidationError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка при загрузке фотографий', 500);
  }
}

export const POST = withErrorHandling(
  requireAuthAndPermission(postHandler, 'ADMIN'),
  'admin/import/photos-improved/POST'
);
