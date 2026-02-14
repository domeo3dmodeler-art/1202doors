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

// POST /api/admin/import/photos-bulk - Массовая загрузка фотографий с прогрессом
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
    const autoLink = formData.get('auto_link') === 'true';

    logger.info('Массовая загрузка фото', 'admin/import/photos-bulk', { 
      userId: user.userId,
      photosCount: photos.length, 
      category, 
      mappingProperty, 
      autoLink 
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
      logger.debug('Директория создана', 'admin/import/photos-bulk', { uploadDir });
    } catch (error) {
      logger.debug('Директория уже существует или ошибка создания', 'admin/import/photos-bulk', { uploadDir, error: error instanceof Error ? error.message : String(error) });
    }

    const uploadedPhotos: any[] = [];
    const uploadErrors: string[] = [];
    const linkingResults: any[] = [];

    // Загружаем фотографии
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      
      try {
        logger.debug(`Загружаем фото ${i + 1}/${photos.length}`, 'admin/import/photos-bulk', { photoName: photo.name });
        
        // Валидация файла (убрали проверку размера)
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
        const photoInfo = {
          originalName: photo.name,
          fileName: fileName,
          filePath: `/uploads/products/${category}/${fileName}`,
          size: photo.size,
          type: photo.type,
          uploadedAt: new Date().toISOString()
        };
        
        uploadedPhotos.push(photoInfo);
        
        logger.debug(`Photo ${i + 1} uploaded successfully`, 'admin/import/photos-bulk', { fileName, size: photo.size });
        
      } catch (error) {
        logger.error(`Error uploading photo ${i + 1}`, 'admin/import/photos-bulk', error instanceof Error ? { error: error.message } : { error: String(error) });
        uploadErrors.push(`Ошибка при загрузке ${photo.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // Автоматическая привязка фото к товарам
    let linkedPhotos = 0;
    let linkedProducts = 0;
    
    if (autoLink && mappingProperty && uploadedPhotos.length > 0) {
      logger.info('Автоматическая привязка фото к товарам по свойству', 'admin/import/photos-bulk', { mappingProperty });
      
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
        
        logger.info(`Найдено товаров в категории`, 'admin/import/photos-bulk', { category, productsCount: products.length });
        
        for (const photo of uploadedPhotos) {
          // Извлекаем имя файла без расширения для поиска
          const fileNameWithoutExt = path.parse(photo.originalName).name;
          
          logger.debug(`Обработка фото`, 'admin/import/photos-bulk', { originalName: photo.originalName, fileNameWithoutExt });
          
          // Находим товары с таким же значением свойства
          const matchingProducts = products.filter(product => {
            try {
              const properties = JSON.parse(product.properties_data || '{}');
              const propertyValue = properties[mappingProperty];
              
              if (propertyValue) {
                const valueStr = propertyValue.toString().trim();
                const fileNameStr = fileNameWithoutExt.trim();
                
                // Более гибкое сравнение (учитываем регистр и пробелы)
                const exactMatch = valueStr.toLowerCase() === fileNameStr.toLowerCase();
                const partialMatch = valueStr.toLowerCase().includes(fileNameStr.toLowerCase()) ||
                                   fileNameStr.toLowerCase().includes(valueStr.toLowerCase());
                
                if (exactMatch || partialMatch) {
                  logger.debug(`Найдено совпадение для товара`, 'admin/import/photos-bulk', { sku: product.sku, valueStr, fileNameStr });
                  return true;
                }
              }
              
              return false;
            } catch (error) {
              logger.error(`Ошибка при обработке товара ${product.sku}`, 'admin/import/photos-bulk', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
              return false;
            }
          });
          
          logger.debug(`Найдено товаров для фото`, 'admin/import/photos-bulk', { photoName: photo.originalName, matchingProductsCount: matchingProducts.length });
          
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
                logger.debug(`Фото заменено для товара`, 'admin/import/photos-bulk', { originalName: photo.originalName, productSku: product.sku });
                
                linkingResults.push({
                  photo: photo.originalName,
                  product: product.sku,
                  status: 'replaced'
                });
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
                logger.debug(`Фото добавлено в галерею товара`, 'admin/import/photos-bulk', { originalName: photo.originalName, productSku: product.sku });
                
                linkingResults.push({
                  photo: photo.originalName,
                  product: product.sku,
                  status: 'linked'
                });
              }
            } catch (error) {
              logger.error(`Ошибка при привязке фото к товару ${product.sku}`, 'admin/import/photos-bulk', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
              
              linkingResults.push({
                photo: photo.originalName,
                product: product.sku,
                status: 'error',
                error: error instanceof Error ? error.message : String(error)
              });
            }
          }
          
          if (matchingProducts.length > 0) {
            linkedProducts += matchingProducts.length;
          }
        }
        
      } catch (error) {
        logger.error('Ошибка при привязке фото к товарам', 'admin/import/photos-bulk', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
      }
    }

    // Статистика загрузки
    const stats = {
      totalPhotos: photos.length,
      uploadedPhotos: uploadedPhotos.length,
      uploadErrors: uploadErrors.length,
      linkedPhotos: linkedPhotos,
      linkedProducts: linkedProducts,
      linkingResults: linkingResults
    };

    logger.info('Массовая загрузка завершена', 'admin/import/photos-bulk', { stats });

    return apiSuccess({
      message: `Загружено ${uploadedPhotos.length} из ${photos.length} фото`,
      stats: stats,
      uploadedPhotos: uploadedPhotos,
      uploadErrors: uploadErrors,
      linkingResults: linkingResults
    });

  } catch (error) {
    logger.error('Ошибка при массовой загрузке фото', 'admin/import/photos-bulk', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof ValidationError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка сервера при загрузке фото', 500);
  }
}

export const POST = withErrorHandling(
  requireAuthAndPermission(postHandler, 'ADMIN'),
  'admin/import/photos-bulk/POST'
);
