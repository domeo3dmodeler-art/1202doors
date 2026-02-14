import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as XLSX from 'xlsx';
import { validateDocumentFile } from '@/lib/validation/file-validation';
import { fixAllEncoding, fixFieldsEncoding } from '@/lib/encoding-utils';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api/response';
import { ValidationError, NotFoundError } from '@/lib/api/errors';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import type { AuthenticatedUser } from '@/lib/auth/request-helpers';
import { apiValidator } from '@/lib/api-validator';

// ===================== УНИФИЦИРОВАННЫЙ ИМПОРТ =====================

async function postHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  
  logger.info('Начало унифицированного импорта', 'admin/import/unified/POST', {}, loggingContext);
  
  const formData = await req.formData();
  const file = formData.get("file") as File;
  const categoryId = formData.get("category") as string;
  const mode = formData.get("mode") as string || 'preview'; // 'preview' или 'import'
  const templateId = formData.get("templateId") as string;

  logger.debug('Получены параметры импорта', 'admin/import/unified/POST', {
    hasFile: !!file,
    fileName: file?.name,
    fileSize: file?.size,
    categoryId,
    mode,
    templateId: templateId || 'auto'
  }, loggingContext);

  // Валидация входных данных
  if (!file) {
    throw new ValidationError('Файл не предоставлен');
  }

  if (!categoryId) {
    throw new ValidationError('Категория не указана');
  }

  // Валидация файла
  const validation = validateDocumentFile(file);
  if (!validation.isValid) {
    throw new ValidationError(validation.error || 'Неверный формат файла', {
      filename: file.name,
      size: file.size,
      type: file.type
    });
  }

  logger.debug('Унифицированный импорт', 'admin/import/unified/POST', {
    filename: file.name,
    categoryId,
    mode,
    templateId: templateId || 'auto'
  }, loggingContext);

    // Получаем шаблон
    let template;
    if (templateId) {
      template = await prisma.importTemplate.findUnique({
        where: { id: templateId }
      });
    } else {
      template = await prisma.importTemplate.findFirst({
        where: { 
          catalog_category_id: categoryId,
          is_active: true 
        },
        orderBy: { created_at: 'desc' }
      });
    }

  if (!template) {
    logger.warn('Шаблон не найден для категории', 'admin/import/unified/POST', { categoryId }, loggingContext);
    
    // Проверяем, существует ли категория
    const category = await prisma.catalogCategory.findUnique({
      where: { id: categoryId },
      select: { name: true }
    });

    const errorMessage = category 
      ? `Шаблон не найден для категории "${category.name}". Создайте шаблон для этой категории перед импортом.`
      : `Категория с ID "${categoryId}" не найдена.`;

    throw new NotFoundError(errorMessage + " Создайте шаблон импорта для этой категории через раздел 'Шаблоны' в интерфейсе импорта.");
  }

    // Парсим поля шаблона с исправлением кодировки
    let requiredFields = JSON.parse(template.required_fields || '[]');
    let calculatorFields = JSON.parse(template.calculator_fields || '[]');
    let exportFields = JSON.parse(template.export_fields || '[]');
    let templateConfig = JSON.parse(template.template_config || '{}');
    
    // Исправляем кодировку
    requiredFields = fixFieldsEncoding(requiredFields);
    calculatorFields = fixFieldsEncoding(calculatorFields);
    exportFields = fixFieldsEncoding(exportFields);
    templateConfig = fixAllEncoding(templateConfig);

  logger.debug('Используем шаблон', 'admin/import/unified/POST', {
    name: template.name,
    requiredFields: requiredFields.length,
    calculatorFields: calculatorFields.length,
    exportFields: exportFields.length
  }, loggingContext);

    // Читаем файл
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (rawData.length < 2) {
    throw new ValidationError('Файл должен содержать заголовки и хотя бы одну строку данных');
  }

    const headers = rawData[0] as string[];
    const rows = rawData.slice(1) as any[][];

  logger.debug('Данные файла', 'admin/import/unified/POST', {
    headers: headers.length,
    rows: rows.length,
    sampleHeaders: headers.slice(0, 5)
  }, loggingContext);

  // Исправляем кодировку заголовков
  const fixedHeaders = fixFieldsEncoding(headers);
  
  logger.debug('Заголовки после исправления кодировки', 'admin/import/unified/POST', {
    fixedHeaders
  }, loggingContext);

    // Валидируем заголовки - проверяем точное совпадение с шаблоном
    const availableRequiredFields = requiredFields.filter((field: string) => fixedHeaders.includes(field));
    const missingFields = requiredFields.filter((field: string) => !fixedHeaders.includes(field));
    
  logger.debug('Анализ полей', 'admin/import/unified/POST', {
    requiredFields: requiredFields.length,
    availableRequiredFields: availableRequiredFields.length,
    missingFields: missingFields.length,
    availableFields: fixedHeaders
  }, loggingContext);

    // Проверяем наличие SKU внутреннее - это минимальное требование для обновления товаров
    const hasInternalSku = fixedHeaders.includes('SKU внутреннее');
    
  // Если нет ни одного обязательного поля из шаблона И нет SKU внутреннее - ошибка
  if (availableRequiredFields.length === 0 && !hasInternalSku) {
    throw new ValidationError('Файл не соответствует шаблону категории', {
      category: (template as { catalog_category?: { name: string } }).catalog_category?.name ?? 'Неизвестная категория',
      missingFields: missingFields,
      availableFields: fixedHeaders,
      templateRequiredFields: requiredFields,
      suggestion: "Файл должен содержать хотя бы 'SKU внутреннее' для обновления товаров, или все обязательные поля из шаблона. Скачайте актуальный шаблон для этой категории и используйте его структуру.",
      message: `Отсутствуют обязательные поля. Файл должен содержать хотя бы 'SKU внутреннее' для обновления товаров, или все обязательные поля из шаблона: ${missingFields.slice(0, 5).join(', ')}.`
    });
  }
  
  // Если нет обязательных полей, но есть SKU внутреннее - это режим обновления цен/свойств
  if (availableRequiredFields.length === 0 && hasInternalSku) {
    logger.debug('Режим обновления: найдено только SKU внутреннее', 'admin/import/unified/POST', {}, loggingContext);
  }

    // Обрабатываем данные
    const products = [];
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const product: any = {
          sku: '', // Будет определен из файла или сгенерирован
          name: '',
          properties_data: {},
          row_number: i + 2
        };

        // Заполняем свойства товара
        // Обрабатываем ТОЛЬКО поля из шаблона (requiredFields)
        // Поля, которые есть в файле, но отсутствуют в шаблоне - ИГНОРИРУЮТСЯ
        const properties: any = {};
        
        // Обрабатываем только поля из шаблона
        requiredFields.forEach((field: string) => {
          // Проверяем, есть ли это поле в файле
          const headerIndex = fixedHeaders.indexOf(field);
          if (headerIndex !== -1 && row[headerIndex] !== undefined) {
            const value = row[headerIndex];
            // Игнорируем пустые значения
            if (value !== undefined && value !== null && value !== '' && value !== '-') {
              properties[field] = value;
            }
          }
          // Если поле из шаблона отсутствует в файле - пропускаем
          // При обновлении: старое значение останется в БД
          // При создании: может быть ошибка валидации, если поле обязательное
        });

        // Логирование для диагностики (только для первых 3 строк)
        if (i < 3) {
          logger.debug(`Обработка строки ${i + 2}`, 'admin/import/unified/POST', {
            processedFields: Object.keys(properties).length,
            requiredFieldsCount: requiredFields.length,
            foundFields: Object.keys(properties),
            allFileFields: fixedHeaders
          }, loggingContext);
        }

        // Исправляем кодировку свойств
        product.properties_data = fixAllEncoding(properties);

        // Определяем SKU внутреннее
        const internalSku = properties['SKU внутреннее'];
        if (internalSku && internalSku.trim() !== '') {
          product.sku = internalSku.trim();
          
          // Проверяем уникальность SKU во всей БД
          // Если в режиме preview - предупредим позже
          // Если в режиме import - проверим перед созданием/обновлением
        } else {
          // Генерируем автоматически уникальный SKU
          // Используем оптимизированный подход: timestamp (миллисекунды) + наносекунды + случайное число + индекс строки
          // Это обеспечивает очень высокую вероятность уникальности без проверки в БД
          const supplierSku = properties['Артикул поставщика'] || `ITEM_${i + 1}`;
          
          // Генерируем уникальный SKU с оптимизированным подходом
          // Используем timestamp + наносекунды + случайное число + индекс строки для максимальной уникальности
          const timestamp = Date.now();
          
          // Получаем наносекунды через process.hrtime для высокой точности
          let nanoSeconds = '';
          try {
            if (typeof process !== 'undefined' && process.hrtime) {
              const hrtime = process.hrtime();
              // hrtime возвращает [секунды, наносекунды]
              // Используем наносекунды как дополнительную компоненту уникальности
              nanoSeconds = hrtime[1].toString().padStart(9, '0').slice(-6); // Последние 6 цифр
            } else {
              // Fallback: используем случайное число для имитации наносекунд
              nanoSeconds = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
            }
          } catch (e) {
            // Если process.hrtime недоступен, используем случайное число
            nanoSeconds = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
          }
          
          // Дополнительная случайная компонента (8 символов)
          const randomSuffix = Math.random().toString(36).substring(2, 10);
          // Индекс строки с padding (6 цифр)
          const rowIndex = (i + 1).toString().padStart(6, '0');
          // Ограничиваем артикул поставщика (20 символов)
          const supplierSkuShort = supplierSku.substring(0, 20);
          
          // Формат: SKU_timestamp_nanoSeconds_random_rowIndex_supplierSku
          // Комбинации: ~2^48 (timestamp) * 2^20 (nanoSeconds) * 2^48 (random) * 2^20 (rowIndex) = ~2^136
          // Вероятность коллизии крайне мала (< 10^-40)
          product.sku = `SKU_${timestamp}_${nanoSeconds}_${randomSuffix}_${rowIndex}_${supplierSkuShort}`;
          
          // Убираем проверку уникальности в цикле для оптимизации производительности
          // Вероятность коллизии с таким форматом практически нулевая
          // Если коллизия произойдет (крайне маловероятно), Prisma выбросит ошибку P2002 при создании
        }

        // ВАЖНО: Если SKU внутреннее заполнено - это режим обновления
        // В режиме обновления требуется ТОЛЬКО SKU внутреннее - все остальное опционально
        if (!internalSku || internalSku.trim() === '') {
          // Если SKU внутреннее пустое - создается новый товар
          // Для нового товара требуется ВСЕ обязательные поля из шаблона
          
          // Определяем название - ищем поле с названием во всех полях шаблона
          const nameField = requiredFields.find((field: string) => 
            field.toLowerCase().includes('название') || 
            field.toLowerCase().includes('наименование') ||
            field.toLowerCase().includes('имя')
          );
          
          if (nameField && properties[nameField]) {
            product.name = properties[nameField];
          } else {
            product.name = 'Без названия';
          }
          
          // Проверяем ВСЕ обязательные поля из шаблона для нового товара
          const missingRequiredFields = requiredFields.filter((field: string) => {
            // Проверяем, есть ли поле в файле И заполнено ли оно
            const hasFieldInFile = fixedHeaders.includes(field);
            const value = properties[field];
            return !hasFieldInFile || !value || value.toString().trim() === '' || value === '-';
          });

          if (missingRequiredFields.length > 0) {
            throw new Error(`Отсутствуют обязательные поля из шаблона: ${missingRequiredFields.join(', ')}`);
          }
        } else {
          // РЕЖИМ ОБНОВЛЕНИЯ: SKU внутреннее заполнено
          // В этом режиме требуется ТОЛЬКО SKU - все остальное опционально
          // Название и другие поля можно взять из БД, если их нет в файле
          
          // Определяем название - если есть в файле, используем, иначе возьмем из БД позже
          const nameField = requiredFields.find((field: string) => 
            field.toLowerCase().includes('название') || 
            field.toLowerCase().includes('наименование') ||
            field.toLowerCase().includes('имя')
          );
          
          if (nameField && properties[nameField]) {
            product.name = properties[nameField];
          } else {
            // Название не указано в файле - будет взято из БД при обновлении
            product.name = 'Без названия';
          }
          
          // В режиме обновления НЕ проверяем обязательные поля - они опциональны
          // Главное - наличие SKU внутреннее, по нему найдем товар в БД
        }

        products.push(product);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Неизвестная ошибка';
        logger.warn(`Ошибка обработки строки ${i + 2}`, 'admin/import/unified/POST', {
          error: errorMessage,
          rowNumber: i + 2
        }, loggingContext);
        errors.push({
          row: i + 2,
          error: errorMessage,
          data: row
        });
      }
    }
    
    logger.info('Результат обработки файла', 'admin/import/unified/POST', {
      processedProducts: products.length,
      validationErrors: errors.length,
      sampleErrors: errors.slice(0, 5)
    }, loggingContext);

    // Если режим preview, возвращаем предварительный просмотр
    if (mode === 'preview') {
      // Проверяем существование товаров в БД для предупреждения о несуществующих SKU
      // SKU проверяются во всей БД (не только в категории), так как SKU должны быть уникальными глобально
      const skuChecks: Array<{ 
        sku: string; 
        exists: boolean; 
        row: number; 
        existingCategoryId?: string | null;
        existingCategoryName?: string | null;
        existingProductName?: string | null;
      }> = [];
      
      for (const product of products) {
        if (product.sku) {
          // Проверяем уникальность SKU во всей БД (не только в категории)
          const existingProduct = await prisma.product.findUnique({
            where: {
              sku: product.sku
            },
            select: { 
              id: true, 
              catalog_category_id: true,
              name: true,
              catalog_category: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          });
          
          skuChecks.push({
            sku: product.sku,
            exists: !!existingProduct,
            row: product.row_number || 0,
            // Добавляем информацию о категории существующего товара (если найден)
            existingCategoryId: existingProduct?.catalog_category_id || null,
            existingCategoryName: existingProduct?.catalog_category?.name || null,
            existingProductName: existingProduct?.name || null
          });
        }
      }
      
      const notFoundSkus = skuChecks.filter(check => !check.exists);
      const foundSkus = skuChecks.filter(check => check.exists);
      
      // Проверяем, есть ли SKU в других категориях (для предупреждения)
      const skusInOtherCategories = skuChecks.filter(check => 
        check.exists && 
        check.existingCategoryId && 
        check.existingCategoryId !== categoryId
      );
      
      return apiSuccess({
        mode: 'preview',
        template: {
          name: template.name,
          requiredFields,
          calculatorFields,
          exportFields
        },
        data: {
          totalRows: rows.length,
          validProducts: products.length,
          errors: errors.length,
          sampleProducts: products.slice(0, 5),
          sampleErrors: errors.slice(0, 5)
        },
        skuCheck: {
          total: skuChecks.length,
          found: foundSkus.length,
          notFound: notFoundSkus.length,
          notFoundSkus: notFoundSkus.slice(0, 20), // Первые 20 для показа
          skusInOtherCategories: skusInOtherCategories.length > 0 ? skusInOtherCategories.slice(0, 20) : [], // SKU в других категориях
          warning: notFoundSkus.length > 0 
            ? `Обнаружено ${notFoundSkus.length} несуществующих SKU. Эти товары будут созданы как новые при импорте.` 
            : null,
          crossCategoryWarning: skusInOtherCategories.length > 0
            ? `ОШИБКА: Обнаружено ${skusInOtherCategories.length} SKU, которые уже существуют в других категориях. Импорт товаров из других категорий запрещен. Исправьте SKU в файле и попробуйте снова.`
            : null,
          crossCategorySkus: skusInOtherCategories.length > 0 
            ? skusInOtherCategories.map(check => ({
                sku: check.sku,
                row: check.row,
                existingCategoryName: check.existingCategoryName || 'Неизвестная категория',
                existingCategoryId: check.existingCategoryId,
                existingProductName: check.existingProductName || 'Без названия'
              }))
            : []
        }
      });
    }

    // Режим импорта - сохраняем в базу
    logger.info('Режим импорта', 'admin/import/unified/POST', {
      mode,
      productsToProcess: products.length
    }, loggingContext);
    
    let importedCount = 0;
    let updatedCount = 0;
    let createdCount = 0;
    let errorCount = 0;

    for (const product of products) {
      logger.debug(`Обработка товара ${importedCount + 1}/${products.length}`, 'admin/import/unified/POST', {
        sku: product.sku
      }, loggingContext);
      try {
        // Проверяем существование товара по SKU внутреннему во всей БД (не только в категории)
        // SKU должен быть уникальным во всей БД товаров
        const existingProduct = await prisma.product.findUnique({
          where: {
            sku: product.sku
          },
          include: {
            catalog_category: {
              select: {
                id: true,
                name: true
              }
            }
          }
        });
        
        // Если товар найден в другой категории - ЗАПРЕЩАЕМ обновление и выдаем ошибку
        if (existingProduct && existingProduct.catalog_category_id !== categoryId) {
          const existingCategoryName = existingProduct.catalog_category?.name || 'Неизвестная категория';
          const errorMessage = `SKU "${product.sku}" (товар "${existingProduct.name}") уже существует в категории "${existingCategoryName}" (ID: ${existingProduct.catalog_category_id}). Импорт товаров из других категорий запрещен. Удалите или измените SKU в файле.`;
          
          logger.error('SKU найден в другой категории', 'admin/import/unified/POST', {
            sku: product.sku,
            existingCategoryId: existingProduct.catalog_category_id,
            existingCategoryName,
            targetCategoryId: categoryId
          }, loggingContext);
          throw new Error(errorMessage);
        }

        if (existingProduct) {
          // Обновляем существующий товар - только заполненные поля
          logger.debug('Товар найден в БД', 'admin/import/unified/POST', {
            productId: existingProduct.id,
            categoryId: existingProduct.catalog_category_id,
            currentName: existingProduct.name
          }, loggingContext);
          
          const updateData: any = {
            updated_at: new Date()
          };

          // Обновляем название, если оно указано в файле (и не "Без названия")
          // Если название не указано в файле - оставляем существующее название из БД
          if (product.name && product.name !== 'Без названия') {
            updateData.name = product.name;
            logger.debug('Обновление названия', 'admin/import/unified/POST', {
              oldName: existingProduct.name,
              newName: product.name
            }, loggingContext);
          } else {
            // Название не указано в файле - оставляем существующее из БД
            logger.debug('Название не указано в файле - оставляем существующее', 'admin/import/unified/POST', {
              existingName: existingProduct.name
            }, loggingContext);
          }

          // Обновляем только заполненные свойства
          const existingProperties = existingProduct.properties_data ? 
            (typeof existingProduct.properties_data === 'string' ? 
              JSON.parse(existingProduct.properties_data) : 
              existingProduct.properties_data) : {};

          logger.debug('Существующие поля в БД', 'admin/import/unified/POST', {
            existingFieldsCount: Object.keys(existingProperties).length,
            existingFields: Object.keys(existingProperties),
            fileFieldsCount: Object.keys(product.properties_data).length,
            fileFields: Object.keys(product.properties_data)
          }, loggingContext);

          const newProperties = { ...existingProperties };
          
          // Обновляем только те поля, которые не пустые в файле
          // Исправляем кодировку полей перед обновлением
          const fixedKeys = fixFieldsEncoding(Object.keys(product.properties_data));
          let updatedFieldsCount = 0;
          Object.keys(product.properties_data).forEach((originalKey, index) => {
            const fixedKey = fixedKeys[index];
            const value = product.properties_data[originalKey];
            if (value !== undefined && value !== null && value !== '' && value !== '-') {
              const oldValue = newProperties[fixedKey];
              newProperties[fixedKey] = value;
              updatedFieldsCount++;
            }
          });

          logger.debug('Обновление полей товара', 'admin/import/unified/POST', {
            updatedFieldsCount
          }, loggingContext);

          updateData.properties_data = JSON.stringify(newProperties);
          updateData.specifications = JSON.stringify(newProperties);

          const updateResult = await prisma.product.update({
            where: { id: existingProduct.id },
            data: updateData
          });

          logger.debug('Товар успешно обновлен в БД', 'admin/import/unified/POST', {
            productId: updateResult.id
          }, loggingContext);
          updatedCount++;
        } else {
          // Создаем новый товар - все обязательные поля должны быть заполнены
          logger.debug('Товар не найден в БД - создаем новый товар', 'admin/import/unified/POST', {
            sku: product.sku
          }, loggingContext);
          
          // Исправляем кодировку полей перед сохранением
          const fixedProperties = fixFieldsEncoding(Object.keys(product.properties_data)).reduce((acc, fixedKey, index) => {
            const originalKey = Object.keys(product.properties_data)[index];
            acc[fixedKey] = product.properties_data[originalKey];
            return acc;
          }, {} as Record<string, any>);
          
          logger.debug('Поля для создания', 'admin/import/unified/POST', {
            fieldsCount: Object.keys(fixedProperties).length,
            fields: Object.keys(fixedProperties)
          }, loggingContext);
          
          try {
            const newProduct = await prisma.product.create({
              data: {
                sku: product.sku,
                name: product.name,
                catalog_category_id: categoryId,
                properties_data: JSON.stringify(fixedProperties),
                specifications: JSON.stringify(fixedProperties),
                base_price: 0,
                stock_quantity: 0,
                is_active: true
              }
            });

            logger.debug('Новый товар создан', 'admin/import/unified/POST', {
              productId: newProduct.id,
              sku: newProduct.sku
            }, loggingContext);
            createdCount++;
          } catch (createError: any) {
            // Обрабатываем ошибку уникальности SKU
            if (createError.code === 'P2002' && createError.meta?.target?.includes('sku')) {
              logger.error('SKU уже существует в БД', 'admin/import/unified/POST', {
                sku: product.sku,
                error: createError
              }, loggingContext);
              throw new Error(`SKU "${product.sku}" уже существует в базе данных. SKU должны быть уникальными во всей БД товаров.`);
            }
            logger.error('Ошибка при создании товара', 'admin/import/unified/POST', {
              sku: product.sku,
              error: createError
            }, loggingContext);
            throw createError; // Пробрасываем другие ошибки
          }
        }

        importedCount++;
        logger.debug('Товар обработан', 'admin/import/unified/POST', {
          importedCount,
          total: products.length
        }, loggingContext);

      } catch (error) {
        logger.error('Ошибка импорта товара', 'admin/import/unified/POST', {
          sku: product.sku,
          error: error instanceof Error ? error.message : String(error)
        }, loggingContext);
        errorCount++;
      }
    }
    
    logger.info('Итоги импорта', 'admin/import/unified/POST', {
      imported: importedCount,
      updated: updatedCount,
      created: createdCount,
      errors: errorCount
    }, loggingContext);

    // Сохраняем историю импорта
    await prisma.importHistory.create({
      data: {
        template_id: template.id,
        catalog_category_id: categoryId,
        filename: file.name,
        file_size: file.size,
        imported_count: importedCount,
        error_count: errorCount + errors.length,
        status: errorCount > 0 ? 'partial' : 'completed',
        errors: JSON.stringify(errors),
        import_data: JSON.stringify({
          template: template.name,
          requiredFields,
          totalRows: rows.length
        })
      }
    });

    logger.info('Импорт завершен', 'admin/import/unified/POST', {
      imported: importedCount,
      created: createdCount,
      updated: updatedCount,
      errors: errorCount,
      validationErrors: errors.length
    }, loggingContext);

    return apiSuccess({
      mode: 'import',
      imported: importedCount,
      created: createdCount,
      updated: updatedCount,
      errors: errorCount + errors.length,
      validationErrors: errors.length,
      template: template.name,
      filename: file.name
    });
}

export const POST = withErrorHandling(
  requireAuthAndPermission(postHandler, 'ADMIN'),
  'admin/import/unified/POST'
);
