import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { validateImageFile, generateUniqueFileName } from '../../../../../lib/validation/file-validation';
import { uploadRateLimiter, getClientIP, createNextRateLimitResponse } from '../../../../../lib/security/rate-limiter';
import { upsertPropertyPhoto, deletePropertyPhotos } from '../../../../../lib/property-photos';
import type { AuthenticatedUser } from '@/lib/auth/request-helpers';

// DELETE /api/admin/import/photos - Очистка всех привязок фото в категории
async function deleteHandler(request: NextRequest, user: AuthenticatedUser): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const propertyName = searchParams.get('property_name');

    if (!category) {
      throw new ValidationError('Не указана категория');
    }

    logger.info('Очистка привязок фото в категории', 'admin/import/photos', { userId: user.userId, category, propertyName });

    let deletedCount = 0;

    if (propertyName) {
      // Удаляем фото для конкретного свойства
      const result = await prisma.propertyPhoto.deleteMany({
      where: {
          categoryId: category,
          propertyName: propertyName
        }
      });
      deletedCount = result.count;
    } else {
      // Удаляем все фото в категории
      const result = await prisma.propertyPhoto.deleteMany({
        where: {
          categoryId: category
        }
      });
      deletedCount = result.count;
    }

    // Очищаем кэш
    try {
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/catalog/doors/photos`, {
        method: 'DELETE'
      });
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/catalog/doors/complete-data`, {
        method: 'DELETE'
      });
      } catch (error) {
      logger.warn('Ошибка очистки кэша', 'admin/import/photos', error instanceof Error ? { error: error.message } : { error: String(error) });
    }

    logger.info('Привязки фото удалены', 'admin/import/photos', { deletedCount });

    return apiSuccess({
      message: `Удалено ${deletedCount} фото`,
      deletedCount
    });

  } catch (error) {
    logger.error('Ошибка очистки фото', 'admin/import/photos', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof ValidationError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка сервера при очистке фото', 500);
  }
}

export const DELETE = withErrorHandling(
  requireAuthAndPermission(deleteHandler, 'ADMIN'),
  'admin/import/photos/DELETE'
);

// POST /api/admin/import/photos - Загрузка фотографий для свойств товаров
async function postHandler(request: NextRequest, user: AuthenticatedUser): Promise<NextResponse> {
  try {
    // Проверка rate limiting
    const clientIP = getClientIP(request);
    const isAllowed = uploadRateLimiter.isAllowed(clientIP);
    
    if (!isAllowed) {
      return createNextRateLimitResponse(uploadRateLimiter, clientIP);
    }

    const formData = await request.formData();
    const photos = formData.getAll('photos') as File[];
    const category = formData.get('category') as string;
    const mappingProperty = formData.get('mapping_property') as string;
    const uploadType = formData.get('upload_type') as string || 'property';

    logger.info('Загрузка фото', 'admin/import/photos', { 
      userId: user.userId,
      photosCount: photos.length, 
      category, 
      mappingProperty, 
      uploadType 
    });

    if (!category || !mappingProperty) {
      throw new ValidationError('Не указаны категория или свойство для привязки');
    }

    // Создаем директорию для загрузки
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'products', category);
    
    try {
      await mkdir(uploadDir, { recursive: true });
      logger.debug('Директория создана', 'admin/import/photos', { uploadDir });
    } catch (error) {
      logger.debug('Директория уже существует или ошибка создания', 'admin/import/photos', error instanceof Error ? { error: error.message } : { error: String(error) });
    }

    const uploadedPhotos: any[] = [];
    const uploadErrors: string[] = [];

    // Загружаем фотографии
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      
      try {
        logger.debug(`Загружаем фото ${i + 1}/${photos.length}`, 'admin/import/photos', { photoName: photo.name, photoIndex: i + 1, totalPhotos: photos.length });
        
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
        
        // Сохраняем информацию о загруженной фотографии (будем определять тип позже)
        const uploadedPhoto = {
          originalName: photo.name,
          fileName: fileName,
          filePath: `products/${category}/${fileName}`, // Без /uploads, т.к. API добавляет это
          size: photo.size,
          type: photo.type,
          photoInfo: null // Определим после загрузки всех файлов
        };
        
        uploadedPhotos.push(uploadedPhoto);
        
        logger.debug(`Photo ${i} uploaded successfully`, 'admin/import/photos', { fileName });
        
      } catch (error) {
        logger.error(`Error uploading photo ${i}`, 'admin/import/photos', error instanceof Error ? { error: error.message } : { error: String(error) });
        uploadErrors.push(`Ошибка при загрузке ${photo.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    // После загрузки всех файлов определяем тип фото (обложка/галерея)
    // НОВАЯ ЛОГИКА:
    // 1. Для КАЖДОГО файла определяем базовое имя модели, убирая ВСЕ суффиксы _N
    // 2. Если файл БЕЗ _N (точное совпадение с базовым именем) = обложка (cover)
    // 3. Если файл с _N (например, X_1, X_2) = галерея (gallery_N)
    // 4. Регистр не учитывается
    //
    // Примеры:
    // "DomeoDoors_Base_1.png" -> базовое имя "domeodoors_base_1" -> обложка
    // "DomeoDoors_Base_1_1.png" -> базовое имя "domeodoors_base_1" -> галерея_1
    // "DomeoDoors_Base_1_2.png" -> базовое имя "domeodoors_base_1" -> галерея_2
    // "DomeoDoors_Base_2.png" -> базовое имя "domeodoors_base_2" -> обложка
    // "DomeoDoors_Base_2_1.png" -> базовое имя "domeodoors_base_2" -> галерея_1
    
    logger.debug('Определение типа фото', 'admin/import/photos', { totalFiles: uploadedPhotos.length });
    
    for (const photo of uploadedPhotos) {
      const nameWithoutExt = photo.originalName.replace(/\.[^/.]+$/, "").toLowerCase();
      
      // ЛОГИКА ОПРЕДЕЛЕНИЯ ТИПА ФОТО:
      // 1. Проверяем, есть ли в конце имя файла суффикс _N (галерея)
      // 2. Убираем суффикс _N если есть
      // 3. Преобразуем имя модели из формата фото в формат БД
      // 
      // Примеры:
      // "domeodoors_alberti4" -> модель "domeodoors_alberti_4" (обложка)
      // "domeodoors_alberti4_1" -> модель "domeodoors_alberti_4" (галерея_1)
      // "domeodoors_base_1" -> модель "domeodoors_base_1" (обложка)
      // "domeodoors_base_1_1" -> модель "domeodoors_base_1" (галерея_1)
      
      // ЛОГИКА:
      // 1. Если имя файла заканчивается на _1, _2 и т.д. (например, base_1_1, base_1_2) → ГАЛЕРЕЯ
      // 2. Если имя файла НЕ заканчивается на дополнительное _N → ОБЛОЖКА
      // 
      // Примеры:
      // "Base_1.png" → обложка (полное совпадение с значением свойства)
      // "Base_1_1.png" → галерея_1 (дополнительный _1)
      // "Base_1_2.png" → галерея_2 (дополнительный _2)
      
      // Проверяем, есть ли в конце имени файла дополнительный суффикс _N
      // Например: "d29_1" → нашли "_1" в конце, значит это галерея
      // Важно: ищем именно "_N" (подчеркивание + цифра), а не просто цифру
      const galleryMatch = nameWithoutExt.match(/_(\d+)$/);
      
      let baseName: string;
      let galleryNumber: number | null = null;
      let isCover: boolean;
      
      if (galleryMatch) {
        // Есть суффикс _N в конце - это галерея
        // Пример: "d29_1" → galleryMatch находит "_1", это галерея
        // Убираем последний суффикс _N из имени
        baseName = nameWithoutExt.slice(0, -galleryMatch[0].length);
        galleryNumber = parseInt(galleryMatch[1]);
        isCover = false;
        
        logger.debug(`Галерея определена`, 'admin/import/photos', { nameWithoutExt, baseName, galleryNumber });
      } else {
        // НЕТ дополнительного суффикса _N - это ОБЛОЖКА
        baseName = nameWithoutExt;
        galleryNumber = null;
        isCover = true;
        
        logger.debug(`Обложка определена`, 'admin/import/photos', { nameWithoutExt });
      }
      
      const modelName = baseName;
      
      photo.photoInfo = {
        fileName: photo.originalName,
        isCover: isCover,
        number: galleryNumber,
        baseName: modelName,
        isGallery: !isCover
      };
      
      if (isCover) {
        logger.debug(`Обложка привязана`, 'admin/import/photos', { originalName: photo.originalName, modelName });
      } else {
        logger.debug(`Галерея привязана`, 'admin/import/photos', { originalName: photo.originalName, modelName, galleryNumber });
      }
    }
    
    // Привязываем фото к товарам или свойствам
    let linkedPhotos = 0;
    const linkedDetails: any[] = [];

    if (mappingProperty && uploadedPhotos.length > 0) {
      if (uploadType === 'property') {
        logger.debug('Привязка фото к свойствам товаров (property_photos)', 'admin/import/photos');
        
        for (const photo of uploadedPhotos) {
          const { photoInfo } = photo;
          
          // Проверяем, что photoInfo был установлен
          if (!photoInfo) {
            logger.error(`photoInfo не установлен`, 'admin/import/photos', { originalName: photo.originalName });
            continue;
          }
          
          // Получаем имя файла без расширения
          const nameWithoutExt = photo.originalName.replace(/\.[^/.]+$/, "").toLowerCase();
          
          logger.debug(`Обработка фото`, 'admin/import/photos', {
            originalName: photo.originalName,
            photoType: photoInfo.isCover ? 'ОБЛОЖКА' : 'ГАЛЕРЕЯ',
            baseName: photoInfo.baseName,
            number: photoInfo.number || 'N/A'
          });

          // Определяем тип фото для базы данных
          const photoType = photoInfo.isCover 
            ? 'cover' 
            : (photoInfo.number ? `gallery_${photoInfo.number}` : 'cover');

          // Для propertyValue ВСЕГДА сохраняем полное имя файла
          // Оно должно полностью совпадать со значением выбранного свойства
          const propertyValue = nameWithoutExt;
          
          // Сохраняем фото в property_photos
          const savedPhoto = await upsertPropertyPhoto(
            category,
            mappingProperty,
            propertyValue,
            photo.filePath,
            photoType,
            {
              originalFilename: photo.originalName,
              fileSize: photo.size,
              mimeType: photo.type
            }
          );

          if (savedPhoto) {
            linkedPhotos++;
            
            // Для поиска по артикулу используем оригинальное имя файла без расширения
            const searchValue = mappingProperty === 'Артикул поставщика' 
              ? photo.originalName.replace(/\.[^/.]+$/, "").toLowerCase()
              : photoInfo.baseName;
            
            logger.debug(`Ищем товары по свойству`, 'admin/import/photos', { mappingProperty, searchValue });
            
            // Находим товары с этим значением свойства для статистики
        const products = await prisma.product.findMany({
          where: {
                catalog_category_id: category,
                properties_data: {
                  contains: `"${mappingProperty}":"${searchValue}"`
                }
          },
          select: {
            id: true,
            sku: true,
                name: true
              }
            });

            linkedDetails.push({
              fileName: photo.originalName,
              message: `Привязано к ${products.length} товарам`,
              productsLinked: products.length,
              matchedProducts: products.map(p => ({
                id: p.id,
                sku: p.sku,
                name: p.name
              }))
            });

            logger.info(`Фото привязано к свойству`, 'admin/import/photos', { originalName: photo.originalName, mappingProperty, baseName: photoInfo.baseName });
          } else {
            logger.error(`Ошибка сохранения фото`, 'admin/import/photos', { originalName: photo.originalName });
          }
        }
      } else {
        logger.debug('Привязка фото к товарам (properties_data)', 'admin/import/photos');

        for (const photo of uploadedPhotos) {
          const { photoInfo } = photo;
          
          // Проверяем, что photoInfo был установлен
          if (!photoInfo) {
            logger.error(`photoInfo не установлен`, 'admin/import/photos', { originalName: photo.originalName });
            continue;
          }
          
          logger.debug(`Обработка фото`, 'admin/import/photos', { originalName: photo.originalName, baseName: photoInfo.baseName });

          // Для поиска по выбранному свойству используем имя файла без расширения и префикса
          // Формат файла: 1761588175210_db5p3e_akcent_bl.png
          // Нужно извлечь: akcent_bl
          // Убираем расширение
          let nameWithoutExt = photo.originalName.replace(/\.[^/.]+$/, "");
          const parts = nameWithoutExt.split('_');
          
          // Используем все имя файла (без расширения) как значение для поиска
          // Т.к. имя файла должно совпадать со значением свойства
          const extractedName = nameWithoutExt;
          // Убираем лишние пробелы и приводим к нижнему регистру
          const searchValue = extractedName.replace(/\s+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
          
          // Логируем для отладки
          logger.debug(`Извлечение имени из файла`, 'admin/import/photos', {
            originalName: photo.originalName,
            parts: parts.join('|'),
            extractedName: searchValue
          });
          
          logger.debug(`Ищем товары по свойству`, 'admin/import/photos', { mappingProperty, searchValue });

          // Находим товары с этим значением свойства
          // Парсим все товары категории и сравниваем по свойству
          const allProducts = await prisma.product.findMany({
            where: {
              catalog_category_id: category
            },
            select: {
              id: true,
              sku: true,
              name: true,
              properties_data: true
            }
          });
          
          // Фильтруем товары, где свойство совпадает со значением (с учетом разных типов данных)
          const products = allProducts.filter(product => {
            try {
              const properties = typeof product.properties_data === 'string' 
                ? JSON.parse(product.properties_data) 
                : product.properties_data;
              
              const propertyValue = properties[mappingProperty];
              if (propertyValue === undefined) return false;
              
              // Сравниваем как строки, приводя к нижнему регистру и убирая пробелы
              const normalizedSearchValue = searchValue.toLowerCase().trim();
              const normalizedPropertyValue = String(propertyValue).toLowerCase().trim();
              
              return normalizedPropertyValue === normalizedSearchValue;
            } catch (error) {
              logger.error(`Ошибка парсинга свойств для товара`, 'admin/import/photos', { productSku: product.sku, error: error instanceof Error ? error.message : String(error) });
              return false;
            }
          });
          
          logger.debug(`Найдено товаров`, 'admin/import/photos', { productsCount: products.length });

          let productsUpdated = 0;
          for (const product of products) {
            try {
              const properties = JSON.parse(product.properties_data || '{}');
              
              // Инициализируем структуру фото
              if (!properties.photos) {
                properties.photos = { cover: null, gallery: [] };
              } else if (Array.isArray(properties.photos)) {
                // Миграция старых данных: массив -> объект
                const oldPhotos = properties.photos;
                properties.photos = {
                  cover: oldPhotos[0] || null,
                  gallery: oldPhotos.slice(1)
                };
              }
              
              // Определяем, куда добавлять фото
              if (photo.photoInfo.isCover) {
                // Обложка - заменяем существующую
                properties.photos.cover = photo.filePath;
                logger.debug(`Обложка для товара`, 'admin/import/photos', { productSku: product.sku, filePath: photo.filePath });
              } else if (photo.photoInfo.number) {
                // Галерея - добавляем в массив
                const galleryNumber = photo.photoInfo.number;
                // Заполняем массив null'ами если нужно
                while (properties.photos.gallery.length < galleryNumber - 1) {
                  properties.photos.gallery.push(null);
                }
                properties.photos.gallery[galleryNumber - 1] = photo.filePath;
                logger.debug(`Фото галереи для товара`, 'admin/import/photos', { productSku: product.sku, galleryNumber, filePath: photo.filePath });
              } else {
                // Без номера - добавляем в конец галереи
                properties.photos.gallery.push(photo.filePath);
              }
                
              await prisma.product.update({
                where: { id: product.id },
                data: {
                  properties_data: JSON.stringify(properties)
                }
              });
              
              productsUpdated++;
            } catch (error) {
              logger.error(`Ошибка обновления товара`, 'admin/import/photos', { productSku: product.sku, error: error instanceof Error ? error.message : String(error) });
            }
          }

          if (productsUpdated > 0) {
                linkedPhotos++;
            linkedDetails.push({
              fileName: photo.originalName,
              message: `Привязано к ${productsUpdated} товарам`,
              productsLinked: productsUpdated,
              matchedProducts: products.slice(0, productsUpdated).map(p => ({
                id: p.id,
                sku: p.sku,
                name: p.name
              }))
            });

            logger.info(`Фото привязано к товарам`, 'admin/import/photos', { originalName: photo.originalName, productsUpdated });
          }
        }
      }
    }

    // Очищаем кэш
    try {
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/catalog/doors/photos`, {
        method: 'DELETE'
      });
      await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/catalog/doors/complete-data`, {
        method: 'DELETE'
      });
    } catch (error) {
      logger.warn('Ошибка очистки кэша', 'admin/import/photos', error instanceof Error ? { error: error.message } : { error: String(error) });
    }

    const result = {
      success: true,
      uploaded: uploadedPhotos.length,
      linked: linkedPhotos,
      errors: uploadErrors.length,
      uploadErrors,
      linkedDetails,
      photos: uploadedPhotos,
      category,
      upload_dir: uploadDir,
      mapping_property: mappingProperty
    };

    logger.info('Результат загрузки', 'admin/import/photos', { 
      uploaded: result.uploaded,
      linked: result.linked,
      errors: result.errors
    });

    return apiSuccess(result);

  } catch (error) {
    logger.error('Критическая ошибка загрузки фото', 'admin/import/photos', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof ValidationError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Критическая ошибка сервера при загрузке фото', 500);
  }
}

export const POST = withErrorHandling(
  requireAuthAndPermission(postHandler, 'ADMIN'),
  'admin/import/photos/POST'
);
