import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError, NotFoundError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';
import * as XLSX from 'xlsx';
import { validateDocumentFile } from '../../../../../lib/validation/file-validation';

interface CategoryInfo {
  id: string;
  name: string;
  properties?: PropertyInfo[];
  import_mapping?: Record<string, string>;
  categories?: CategoryInfo[];
}

interface PropertyInfo {
  key: string;
  name: string;
  type: string;
  required: boolean;
  unit?: string;
}

interface ImportTemplate {
  id?: string;
  required_fields?: string;
  field_mappings?: FieldMapping[];
}

interface FieldMapping {
  fieldName?: string;
  sourceField?: string;
  targetField?: string;
  required?: boolean;
  isForCalculator?: boolean;
  displayName?: string;
  dataType?: string;
  isRequired?: boolean;
  isVisible?: boolean;
}

interface ProductData {
  sku?: string;
  name: string;
  price?: number | string;
  stock?: number | string;
  brand?: string;
  model?: string;
  description?: string;
  properties_data?: Record<string, unknown>;
  specifications?: Record<string, unknown>;
  row_number?: number;
  category?: string;
}

interface FailedProduct {
  index: number;
  product: {
    name?: string;
    sku?: string;
    price?: number | string;
  };
  error: string;
  errorCode?: string;
}

interface ImportResult {
  success: boolean;
  message?: string;
  note?: string;
  category?: string;
  category_properties?: PropertyInfo[];
  required_fields?: string[];
  headers?: string[];
  total_rows?: number;
  valid_rows?: number;
  error_rows?: number;
  debug?: {
    first_row?: unknown[];
    mapping_config?: Record<string, string>;
    sample_product?: ProductData;
  };
  imported?: number;
  database_saved?: number;
  total_processed?: number;
  failed_products?: number;
  error_stats?: Record<string, number>;
  failed_products_sample?: FailedProduct[];
  save_message?: string;
  [key: string]: unknown;
}

// Функция для создания динамической схемы категории на основе заголовков прайса
async function createDynamicSchema(categoryId: string, headers: string[]) {
  logger.info('Creating dynamic schema for category', 'admin/import/universal', { categoryId, headersCount: headers.length });
  
  // Создаем свойства на основе заголовков
  const properties = headers.map((header, index) => {
    // Определяем тип поля по названию
    let type = 'text';
    let required = false;
    let unit = '';
    
    // Логика определения типа поля
    if (header.toLowerCase().includes('цена') || header.toLowerCase().includes('стоимость')) {
      type = 'number';
      unit = '₽';
      required = true;
    } else if (header.toLowerCase().includes('ширина') || header.toLowerCase().includes('высота') || 
               header.toLowerCase().includes('толщина') || header.toLowerCase().includes('/мм')) {
      type = 'number';
      unit = 'мм';
    } else if (header.toLowerCase().includes('фото') || header.toLowerCase().includes('ссылка')) {
      type = 'url';
    } else if (header.toLowerCase().includes('название') || header.toLowerCase().includes('модель') || 
               header.toLowerCase().includes('артикул') || header.toLowerCase().includes('поставщик')) {
      required = true;
    }
    
    return {
      key: `field_${index + 1}`,
      name: header,
      type: type,
      required: required,
      unit: unit
    };
  });
  
  // Создаем import_mapping
  const import_mapping: Record<string, string> = {};
  headers.forEach((header, index) => {
    import_mapping[`field_${index + 1}`] = header;
  });
  
  const schema = {
    properties: properties,
    import_mapping: import_mapping
  };
  
  logger.debug('Created dynamic schema', 'admin/import/universal', { schema });
  
  // Обновляем категорию в базе данных (пока что просто возвращаем схему)
  // В реальной системе здесь будет вызов API для обновления категории
  
  return schema;
}

// GET /api/admin/import/universal - Получить информацию об импорте
async function getHandler(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category');
    
    logger.info('Получение информации об универсальном импорте', 'admin/import/universal', { userId: user.userId, category });
    
    return apiSuccess({
      message: "API для универсального импорта прайсов",
      usage: "Используйте POST запрос с FormData для загрузки файлов",
      supported_formats: ["xlsx", "xls", "csv"],
      required_fields: {
        file: "Файл для импорта",
        category: "ID категории каталога",
        mode: "Режим обработки (headers или full)"
      },
      example: {
        method: "POST",
        body: "FormData с полями: file, category, mode, mapping"
      },
      current_category: category || "не указана"
    });
  } catch (error) {
    logger.error('Error in GET /api/admin/import/universal', 'admin/import/universal', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка получения информации об импорте', 500);
  }
}

export const GET = withErrorHandling(
  requireAuthAndPermission(getHandler, 'ADMIN'),
  'admin/import/universal/GET'
);

// Универсальный импорт прайсов для любой категории товаров
async function postHandler(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    logger.info('Универсальный импорт прайсов', 'admin/import/universal', { userId: user.userId });
    
    const formData = await req.formData();
    logger.debug('FormData received', 'admin/import/universal', { keys: Array.from(formData.keys()) });
    
    const file = formData.get("file") as File;
    const category = formData.get("category") as string;
    const mapping = formData.get("mapping") as string;
    const mode = formData.get("mode") as string; // 'headers' или 'full'

    logger.info('Параметры импорта', 'admin/import/universal', { 
      fileName: file?.name, 
      fileSize: file?.size, 
      category, 
      mode,
      hasMapping: !!mapping
    });

    // Дополнительная проверка типа файла по расширению
    const fileName = file.name.toLowerCase();
    const isExcelFile = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    const isCsvFile = fileName.endsWith('.csv');
    
    logger.debug('File extension check', 'admin/import/universal', {
      fileName: file.name,
      isExcelFile,
      isCsvFile,
      mimeType: file.type
    });

    if (!file) {
      throw new ValidationError('Файл не предоставлен');
    }

    if (!category) {
      throw new ValidationError('Категория не указана');
    }

    // Валидация файла
    const validation = validateDocumentFile(file);
    if (!validation.isValid) {
      throw new ValidationError(validation.error || 'Неверный формат файла');
    }

    // Получаем информацию о категории из каталога
    const categoriesResponse = await fetch(`${req.nextUrl.origin}/api/catalog/categories`);
    const categoriesData = await categoriesResponse.json();
    logger.debug('Получены категории каталога', 'admin/import/universal', { categoriesCount: categoriesData?.categories?.length });
    
    // Ищем категорию в списке
    let categoryInfo: CategoryInfo | null = null;
    if (Array.isArray(categoriesData)) {
      categoryInfo = (categoriesData as CategoryInfo[]).find((cat: CategoryInfo) => cat.id === category) || null;
    } else if (categoriesData.categories && Array.isArray(categoriesData.categories)) {
      categoryInfo = (categoriesData.categories as CategoryInfo[]).find((cat: CategoryInfo) => cat.id === category) || null;
    }
    
    logger.debug('Найденная категория', 'admin/import/universal', { categoryInfo, importMapping: categoryInfo?.import_mapping });

    if (!categoryInfo) {
      logger.warn(`Категория "${category}" не найдена в каталоге, создаем базовую информацию`, 'admin/import/universal', { category });
      // Создаем базовую информацию о категории
      categoryInfo = {
        id: category,
        name: `Категория ${category}`,
        properties: [],
        import_mapping: {}
      };
    }

    // Получаем шаблон импорта для этой категории
    let importTemplate = null;
    try {
      const templateResponse = await fetch(`${req.nextUrl.origin}/api/admin/import-templates?catalog_category_id=${category}`);
      if (templateResponse.ok) {
        const templateData = await templateResponse.json();
        if (templateData.success && templateData.templates && templateData.templates.length > 0) {
          importTemplate = templateData.templates[0];
          logger.debug('Found import template', 'admin/import/universal', { importTemplate });
        }
      }
    } catch (templateError) {
      logger.debug('No import template found or error', 'admin/import/universal', { error: templateError instanceof Error ? templateError.message : String(templateError) });
    }

    // Если режим "только заголовки", возвращаем только заголовки
    if (mode === 'headers') {
      logger.debug('Headers mode - processing file', 'admin/import/universal', { fileName: file.name, fileType: file.type, fileSize: file.size });
      try {
        const buffer = await file.arrayBuffer();
        let workbook: XLSX.WorkBook;
        
        if (file.type === 'text/csv' || isCsvFile) {
          logger.debug('Processing CSV file', 'admin/import/universal');
          // Для CSV файлов читаем как текст с правильной кодировкой
          const text = await file.text();
          logger.debug('CSV file read', 'admin/import/universal', { textLength: text.length, first200Chars: text.substring(0, 200) });
          
          const lines = text.split('\n').filter(line => line.trim());
          logger.debug('CSV lines count', 'admin/import/universal', { linesCount: lines.length });
          
          if (lines.length === 0 || (lines.length === 1 && lines[0].trim() === '')) {
            throw new ValidationError('CSV файл пустой');
          }
          
          // Определяем разделитель
          const firstLine = lines[0];
          logger.debug('CSV first line', 'admin/import/universal', { firstLine });
          
          let delimiter = ',';
          if (firstLine.includes(';')) {
            delimiter = ';';
          } else if (firstLine.includes('\t')) {
            delimiter = '\t';
          }
          
          logger.debug('Detected delimiter', 'admin/import/universal', { delimiter });
          
          // Парсим заголовки с учетом кавычек
          const headers = (() => {
            const result = [];
            let current = '';
            let inQuotes = false;
            let i = 0;
            
            while (i < firstLine.length) {
              const char = firstLine[i];
              
              if (char === '"') {
                if (inQuotes && firstLine[i + 1] === '"') {
                  // Экранированная кавычка
                  current += '"';
                  i += 2;
                } else {
                  // Начало или конец кавычек
                  inQuotes = !inQuotes;
                  i++;
                }
              } else if (char === delimiter && !inQuotes) {
                // Разделитель вне кавычек
                result.push(current.trim());
                current = '';
                i++;
              } else {
                current += char;
                i++;
              }
            }
            
            // Добавляем последнее поле
            result.push(current.trim());
            return result;
          })();
          
          logger.debug('CSV headers extracted', 'admin/import/universal', { headers, headersCount: headers.length });
          
          // Создаем схему категории на основе заголовков
          const dynamicSchema = await createDynamicSchema(category, headers);
          
          logger.info('Заголовки CSV файла успешно прочитаны', 'admin/import/universal', { headersCount: headers.length });
          
          return apiSuccess({ 
            headers,
            schema: dynamicSchema,
            message: "Заголовки CSV файла успешно прочитаны"
          });
        } else {
          logger.debug('Processing Excel file', 'admin/import/universal', {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            lastModified: file.lastModified
          });
          
          // Для Excel файлов - пробуем разные варианты чтения
          try {
            // Вариант 1: Чтение как array buffer
            workbook = XLSX.read(buffer, { type: 'array' });
            logger.debug('Excel workbook created successfully', 'admin/import/universal', {
              sheetNames: workbook.SheetNames,
              sheetCount: workbook.SheetNames.length
            });
            
            // Пробуем все листы, если первый не содержит данных
            let headers: string[] = [];
            let usedSheet = '';
            
            for (const sheetName of workbook.SheetNames) {
              logger.debug(`Trying sheet: ${sheetName}`, 'admin/import/universal', { sheetName });
              const worksheet = workbook.Sheets[sheetName];
              logger.debug('Worksheet details', 'admin/import/universal', {
                sheetName,
                range: worksheet['!ref'],
                hasData: !!worksheet['!ref']
              });
              
              if (!worksheet['!ref']) {
                logger.debug(`Sheet ${sheetName} has no data range, skipping`, 'admin/import/universal', { sheetName });
                continue;
              }
              
              // Пробуем разные варианты чтения
              let jsonData;
              try {
                // Сначала пробуем с raw: true для сохранения оригинальных значений
                logger.debug('Trying sheet_to_json with raw: true', 'admin/import/universal', { sheetName });
                jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: true, defval: '' });
                logger.debug('Sheet to JSON (raw: true) result', 'admin/import/universal', {
                  sheetName,
                  length: jsonData.length,
                  firstRow: jsonData[0],
                  firstFewRows: jsonData.slice(0, 3)
                });
                
                if (jsonData.length === 0) {
                  // Если не получилось, пробуем без raw
                  logger.debug('No data with raw: true, trying without raw', 'admin/import/universal', { sheetName });
                  jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                  logger.debug('Sheet to JSON (no raw) result', 'admin/import/universal', {
                    sheetName,
                    length: jsonData.length,
                    firstRow: jsonData[0],
                    firstFewRows: jsonData.slice(0, 3)
                  });
                }
              } catch (e) {
                logger.debug('Sheet to JSON failed, trying alternative method', 'admin/import/universal', { sheetName, error: e instanceof Error ? e.message : String(e) });
                jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                logger.debug('Alternative method result', 'admin/import/universal', {
                  sheetName,
                  length: jsonData.length,
                  firstRow: jsonData[0]
                });
              }
              
              if (jsonData.length === 0) {
                logger.debug(`Sheet ${sheetName} appears to be empty, trying next sheet`, 'admin/import/universal', { sheetName });
                continue;
              }
              
              // Читаем заголовки из первой строки
              let headerRowIndex = 0; // Всегда первая строка
              
              logger.debug(`Using first row (index 0) as headers from sheet ${sheetName}`, 'admin/import/universal', { sheetName });
                const headerRow = jsonData[0] as unknown[];
              logger.debug('Raw headers from first row', 'admin/import/universal', { sheetName, headerRow });
              
              // Фильтруем пустые заголовки и заголовки типа _EMPTY_X
              const filteredHeaders = headerRow.filter(h => {
                if (h === null || h === undefined) {
                  logger.debug('Filtering out null/undefined header', 'admin/import/universal', { header: h });
                  return false;
                }
                if (typeof h === 'string') {
                  const trimmed = h.trim();
                  if (trimmed === '') {
                    logger.debug('Filtering out empty string header', 'admin/import/universal');
                    return false;
                  }
                  if (trimmed.startsWith('_EMPTY_')) {
                    logger.debug('Filtering out _EMPTY_ header', 'admin/import/universal', { header: trimmed });
                    return false;
                  }
                  if (trimmed.startsWith('__EMPTY')) {
                    logger.debug('Filtering out __EMPTY header', 'admin/import/universal', { header: trimmed });
                    return false;
                  }
                  logger.debug('Keeping valid string header', 'admin/import/universal', { header: trimmed });
                  return true;
                }
                // Для не-строковых значений тоже включаем
                logger.debug('Keeping non-string header', 'admin/import/universal', { header: h, headerType: typeof h });
                return true;
              }).map(h => String(h).trim());
              
              logger.debug('Final filtered headers', 'admin/import/universal', { 
                filteredHeaders, 
                headersCount: filteredHeaders.length,
                allHeaders: filteredHeaders.map((h, i) => `${i+1}. ${h}`).join(', ')
              });
              
              if (filteredHeaders.length > 0) {
                headers = filteredHeaders;
                usedSheet = sheetName;
                break; // Нашли валидные заголовки, выходим из цикла
              }
            }
            
            if (headers.length === 0) {
              logger.debug('No valid headers found in any sheet, trying raw data approach', 'admin/import/universal');
              // Пробуем получить данные напрямую из первого листа
              const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
              const rawData = XLSX.utils.sheet_to_json(firstSheet, { raw: true });
              logger.debug('Raw data sample', 'admin/import/universal', { rawDataSample: rawData.slice(0, 2) });
              
              if (rawData.length > 0) {
                const firstRow = rawData[0];
                const rawHeaders = Object.keys(firstRow as object);
                logger.debug('Raw headers from object keys', 'admin/import/universal', { rawHeaders });
                
                // Фильтруем пустые заголовки и заголовки типа _EMPTY_X
                const filteredRawHeaders = rawHeaders.filter(h => {
                  if (!h || typeof h !== 'string') return false;
                  const trimmed = h.trim();
                  if (trimmed === '') return false;
                  if (trimmed.startsWith('_EMPTY_')) return false;
                  if (trimmed.startsWith('__EMPTY')) return false;
                  return true;
                });
                
                logger.debug('Filtered raw headers', 'admin/import/universal', { filteredRawHeaders });
                
                if (filteredRawHeaders.length > 0) {
                  logger.info('Заголовки файла прочитаны из raw данных', 'admin/import/universal', { headersCount: filteredRawHeaders.length });
                  return apiSuccess({ 
                    headers: filteredRawHeaders,
                    message: "Заголовки файла прочитаны из raw данных"
                  });
                }
              }
              
              // Если все методы не сработали, возвращаем ошибку с деталями
              logger.error('Не удалось извлечь заголовки из Excel файла', 'admin/import/universal', {
                sheetNames: workbook.SheetNames,
                worksheetRange: workbook.SheetNames.map(name => ({
                  sheet: name,
                  range: workbook.Sheets[name]['!ref']
                }))
              });
              throw new ValidationError('Не удалось извлечь заголовки из Excel файла. Возможно, файл имеет нестандартный формат.');
            }
            
            // Создаем схему категории на основе заголовков
            const dynamicSchema = await createDynamicSchema(category, headers);
            
            logger.info(`Заголовки файла успешно прочитаны из листа "${usedSheet}"`, 'admin/import/universal', { headersCount: headers.length, usedSheet });
            
            return apiSuccess({ 
              headers: headers,
              schema: dynamicSchema,
              message: `Заголовки файла успешно прочитаны из листа "${usedSheet}"`
            });
          } catch (excelError) {
            logger.error('Excel parsing error', 'admin/import/universal', excelError instanceof Error ? { error: excelError.message, stack: excelError.stack } : { error: String(excelError) });
            
            // Пробуем альтернативный способ
            try {
              logger.debug('Trying alternative Excel parsing', 'admin/import/universal');
              workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
              const sheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[sheetName];
              const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
              
              logger.debug('Alternative parsing result', 'admin/import/universal', {
                length: jsonData.length,
                firstRow: jsonData[0]
              });
              
              if (jsonData.length > 0) {
                const headers = jsonData[0] as unknown[];
                
                // Фильтруем пустые заголовки и заголовки типа _EMPTY_X
                const filteredHeaders = headers.filter(h => {
                  if (h === null || h === undefined) return false;
                  if (typeof h === 'string') {
                    const trimmed = h.trim();
                    if (trimmed === '') return false;
                    if (trimmed.startsWith('_EMPTY_')) return false;
                    if (trimmed.startsWith('__EMPTY')) return false;
                    return true;
                  }
                  return true;
                }).map(h => String(h).trim());
                
                logger.debug('Alternative Excel headers', 'admin/import/universal', { filteredHeaders, originalHeaders: headers });
                
                if (filteredHeaders.length > 0) {
                  // Создаем схему категории на основе заголовков
                  const dynamicSchema = await createDynamicSchema(category, filteredHeaders);
                  
                  logger.info('Заголовки файла прочитаны альтернативным способом', 'admin/import/universal', { headersCount: filteredHeaders.length });
                  
                  return apiSuccess({ 
                    headers: filteredHeaders,
                    schema: dynamicSchema,
                    message: "Заголовки файла прочитаны альтернативным способом"
                  });
                }
              }
            } catch (altError) {
              logger.error('Alternative Excel parsing also failed', 'admin/import/universal', altError instanceof Error ? { error: altError.message } : { error: String(altError) });
            }
            
            throw new ValidationError('Не удалось прочитать Excel файл. Проверьте формат файла.');
          }
        }
      } catch (error) {
        logger.error('Ошибка чтения заголовков', 'admin/import/universal', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
        throw new ValidationError('Ошибка чтения файла. Проверьте формат файла.');
      }
    }

    // Парсим mapping если предоставлен
    let mappingConfig: Record<string, unknown> = (categoryInfo.import_mapping ?? {}) as Record<string, unknown>;
    if (mapping) {
      try {
        mappingConfig = JSON.parse(mapping) as Record<string, unknown>;
      } catch (e) {
        throw new ValidationError('Неверный формат mapping JSON');
      }
    }

    // Если настройки импорта уже существуют, используем их
    if (categoryInfo.import_mapping && Object.keys(categoryInfo.import_mapping).length > 0) {
      logger.debug('Using existing import mapping', 'admin/import/universal', { importMapping: categoryInfo.import_mapping });
      mappingConfig = categoryInfo.import_mapping as Record<string, unknown>;
    }

    // Если есть шаблон импорта, используем его данные для маппинга
    if (importTemplate && importTemplate.requiredFields) {
      logger.debug('Using import template for mapping', 'admin/import/universal');
      
      // Парсим templateFields если это строка
      let templateFields = importTemplate.requiredFields;
      if (typeof templateFields === 'string') {
        try {
          templateFields = JSON.parse(templateFields);
        } catch (e) {
          logger.error('Error parsing requiredFields', 'admin/import/universal', e instanceof Error ? { error: e.message } : { error: String(e) });
          templateFields = [];
        }
      }
      
      // Проверяем, что templateFields является массивом
      if (!Array.isArray(templateFields) || templateFields.length === 0) {
        logger.debug('Template fields is not an array or empty, skipping template mapping', 'admin/import/universal');
      } else {
        const calculatorFields = templateFields.map((field: FieldMapping) => field.fieldName || field.sourceField || '');
        
        mappingConfig = {
          ...mappingConfig,
          calculator_fields: calculatorFields,
          frontend_price: calculatorFields[0] ?? ''
        };
        
        // Также обновляем categoryInfo.properties для совместимости
        categoryInfo.properties = templateFields.map((field: FieldMapping) => ({
          key: field.fieldName || field.sourceField || '',
          name: (field as FieldMapping & { displayName?: string }).displayName || field.fieldName || field.sourceField || '',
          type: (field as FieldMapping & { dataType?: string }).dataType || 'string',
          required: field.required ?? true
        }));

        // ОБНОВЛЯЕМ ШАБЛОН с fieldMappings
        if (mappingConfig && mappingConfig.fieldMappings) {
          logger.debug('Saving fieldMappings to template', 'admin/import/universal', { fieldMappings: mappingConfig.fieldMappings });
          
          // Парсим существующий шаблон
          let existingTemplate = null;
          try {
            const existingTemplates = await prisma.importTemplate.findMany({
              where: { catalog_category_id: category }
            });
            existingTemplate = existingTemplates[0];
          } catch (error) {
            logger.debug('No existing template found, will create new one', 'admin/import/universal');
          }

          // Подготавливаем fieldMappings для сохранения
          const rawMappings = mappingConfig.fieldMappings;
          const mappingsArray = Array.isArray(rawMappings) ? rawMappings : (typeof rawMappings === 'string' ? (JSON.parse(rawMappings || '[]') as FieldMapping[]) : []);
          const fieldMappingsData = mappingsArray.map((mapping: FieldMapping) => ({
            fieldName: mapping.fieldName,
            displayName: mapping.displayName,
            dataType: mapping.dataType,
            isRequired: mapping.isRequired ?? mapping.required,
            isVisible: mapping.isVisible !== undefined ? mapping.isVisible : true
          }));

          if (existingTemplate) {
            // Обновляем существующий шаблон
            await prisma.importTemplate.update({
              where: { id: existingTemplate.id },
              data: {
                field_mappings: JSON.stringify(fieldMappingsData),
                updated_at: new Date()
              }
            });
            logger.info('Updated existing template with fieldMappings', 'admin/import/universal', { templateId: existingTemplate.id });
          } else {
            // Создаем новый шаблон
            await prisma.importTemplate.create({
              data: {
                name: `Шаблон для ${categoryInfo.name || 'категории'}`,
                description: `Автоматически созданный шаблон`,
                catalog_category_id: category,
                field_mappings: JSON.stringify(fieldMappingsData),
                required_fields: JSON.stringify([
                  'Название товара',
                  'Цена',
                  ...templateFields.filter(f => f.name?.toLowerCase().includes('артикул')).map(f => f.name)
                ]),
                is_active: true
              }
            });
            logger.info('Created new template with fieldMappings', 'admin/import/universal');
          }
        }

        logger.debug('Generated mapping config from template', 'admin/import/universal', { mappingConfig, categoryProperties: categoryInfo.properties });
      }
    }

    // Реальная обработка файла с библиотекой xlsx
    const buffer = await file.arrayBuffer();
    let workbook;
    
    if (file.type === 'text/csv') {
      // Для CSV файлов читаем как текст с правильной кодировкой
      const text = await file.text();
      logger.debug('CSV file read', 'admin/import/universal', { textLength: text.length, first200Chars: text.substring(0, 200) });
      
      const lines = text.split('\n').filter(line => line.trim());
      logger.debug('CSV lines count', 'admin/import/universal', { linesCount: lines.length });
      
      if (lines.length === 0) {
        throw new ValidationError('CSV файл пустой');
      }
      
      // Определяем разделитель
      const firstLine = lines[0];
      logger.debug('CSV first line', 'admin/import/universal', { firstLine });
      
      let delimiter = ',';
      if (firstLine.includes(';')) {
        delimiter = ';';
      } else if (firstLine.includes('\t')) {
        delimiter = '\t';
      }
      
      logger.debug('Detected delimiter', 'admin/import/universal', { delimiter });
      
      // Парсим CSV с учетом кавычек и разделителей
      const csvData = lines.map(line => {
        const result = [];
        let current = '';
        let inQuotes = false;
        let i = 0;
        
        while (i < line.length) {
          const char = line[i];
          
          if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
              // Экранированная кавычка
              current += '"';
              i += 2;
            } else {
              // Начало или конец кавычек
              inQuotes = !inQuotes;
              i++;
            }
          } else if (char === delimiter && !inQuotes) {
            // Разделитель вне кавычек
            result.push(current.trim());
            current = '';
            i++;
          } else {
            current += char;
            i++;
          }
        }
        
        // Добавляем последнее поле
        result.push(current.trim());
        return result;
      });
      
      logger.debug('Parsed CSV data', 'admin/import/universal', { first3Rows: csvData.slice(0, 3) });
      
      workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet(csvData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    } else {
      // Для Excel файлов используем стандартный парсер
      workbook = XLSX.read(buffer, { type: 'array' });
    }
    
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (jsonData.length === 0) {
      throw new ValidationError('Файл пустой или не содержит данных');
    }

    // Первая строка - заголовки
    const rawHeaders = jsonData[0] as string[];
    // Очищаем заголовки от кавычек и лишних пробелов
    const headers = rawHeaders.map(header => 
      header ? header.toString().replace(/^["']|["']$/g, '').trim() : ''
    ).filter(header => header); // Убираем пустые заголовки
    
    const rows = jsonData.slice(1) as unknown[][];
    
    logger.debug('Headers processing', 'admin/import/universal', {
      rawHeaders,
      cleanedHeaders: headers,
      headersCount: headers.length
    });

    // Валидация обязательных полей
    const requiredFields = (categoryInfo.properties || []).filter((prop: PropertyInfo) => prop.required).map((prop: PropertyInfo) => prop.key);
    const errors: string[] = [];
    const products: ProductData[] = [];
    
    logger.debug('Import processing debug', 'admin/import/universal', {
      headers,
      categoryProperties: categoryInfo.properties,
      requiredFields,
      mappingConfig,
      importTemplate,
      categoryImportMapping: categoryInfo.import_mapping
    });
    
    // Fallback: если нет mappingConfig, создаем простой mapping на основе заголовков
    if (!mappingConfig || (typeof mappingConfig === 'object' && Object.keys(mappingConfig).length === 0)) {
      logger.debug('No mapping config found, creating fallback mapping from headers', 'admin/import/universal');
      mappingConfig = {};
      headers.forEach(header => {
        (mappingConfig as Record<string, string>)[header] = header; // Прямое соответствие заголовок -> поле
      });
      logger.debug('Fallback mapping config', 'admin/import/universal', { mappingConfig });
    }

    // Автоматическое создание шаблона при первой загрузке товаров
    // Также пересоздаем шаблон, если в нем слишком много полей (>200)
    const shouldRecreateTemplate = !importTemplate || 
      (importTemplate && importTemplate.required_fields && 
       JSON.parse(importTemplate.required_fields).length > 200);
    
    if (shouldRecreateTemplate && rows.length > 0) {
      if (importTemplate) {
        logger.debug('Пересоздаем шаблон - слишком много полей', 'admin/import/universal', { fieldsCount: JSON.parse(importTemplate.required_fields).length });
      }
      logger.debug('Auto-creating template', 'admin/import/universal');
      try {
        // Фильтруем заголовки для создания шаблона - исключаем служебные поля
        const filteredHeaders = headers.filter(header => {
          const lowerHeader = header.toLowerCase().trim();
          
          // Исключаем служебные поля
          const excludePatterns = [
            /^№$/,
            /^номер$/,
            /^id$/,
            /^ключ$/,
            /^уникальный/,
            /^системный/,
            /^служебный/,
            /^технический/,
            /^внутренний/,
            /^временный/,
            /^temp/,
            /^tmp/,
            /^test/,
            /^debug/,
            /^domeo_ссылка/,
            /^domeo_ссылк/,
            /^ссылка.*фото/,
            /^фото.*ссылка/,
            /^изображен/,
            /^картинк/,
            /^url/,
            /^http/,
            /^www\./,
            /^\.com/,
            /^\.ru/,
            /^\.org/,
            /^путь/,
            /^path/,
            /^file/,
            /^файл/,
            /^пустой/,
            /^empty/,
            /^null/,
            /^undefined/,
            /^неопределен/,
            /^\s*$/,
            /^[^а-яёa-z0-9\s]/i, // Начинается с не-буквы и не-цифры
            /^\d+$/ // Только цифры
          ];
          
          // Проверяем, не содержит ли заголовок исключаемые паттерны
          const shouldExclude = excludePatterns.some(pattern => pattern.test(lowerHeader));
          
          // Также исключаем слишком короткие или длинные заголовки
          const isValidLength = header.length >= 2 && header.length <= 100;
          
          return !shouldExclude && isValidLength;
        });
        
        logger.debug('Headers filtering', 'admin/import/universal', {
          originalHeadersCount: headers.length,
          filteredHeadersCount: filteredHeaders.length,
          filteredHeaders: filteredHeaders.slice(0, 20)
        });
        
        // Ограничиваем количество полей в шаблоне (максимум 100 полей)
        const maxFields = 100;
        const finalHeaders = filteredHeaders.slice(0, maxFields);
        
        if (filteredHeaders.length > maxFields) {
          logger.debug(`Ограничение: взяты только первые ${maxFields} полей из ${filteredHeaders.length} отфильтрованных`, 'admin/import/universal', { maxFields, totalFiltered: filteredHeaders.length });
        }
        
        // Создаем шаблон на основе отфильтрованных заголовков
        const templateFields = finalHeaders.map((header, index) => {
          // Определяем тип поля на основе названия
          let fieldType = 'text';
          let isRequired = false;
          let isForCalculator = false;
          
          const lowerHeader = header.toLowerCase();
          
          // Обязательные поля
          if (lowerHeader.includes('название') || 
              lowerHeader.includes('имя') || 
              lowerHeader.includes('наименование') ||
              lowerHeader.includes('артикул') ||
              lowerHeader.includes('sku') ||
              lowerHeader.includes('код')) {
            isRequired = true;
          }
          
          // Числовые поля
          if (lowerHeader.includes('цена') || 
              lowerHeader.includes('стоимость') || 
              lowerHeader.includes('сумма') ||
              lowerHeader.includes('количество') ||
              lowerHeader.includes('вес') ||
              lowerHeader.includes('размер') ||
              lowerHeader.includes('объем') ||
              lowerHeader.includes('площадь') ||
              lowerHeader.includes('длина') ||
              lowerHeader.includes('ширина') ||
              lowerHeader.includes('высота') ||
              lowerHeader.includes('глубина') ||
              lowerHeader.includes('диаметр') ||
              lowerHeader.includes('толщина') ||
              /^\d+$/.test(lowerHeader)) {
            fieldType = 'number';
            isForCalculator = true;
          }
          
          // Логические поля
          if (lowerHeader.includes('есть') || 
              lowerHeader.includes('наличие') || 
              lowerHeader.includes('доступн') ||
              lowerHeader.includes('активн') ||
              lowerHeader.includes('включен') ||
              lowerHeader.includes('выключен') ||
              lowerHeader === 'да' ||
              lowerHeader === 'нет') {
            fieldType = 'boolean';
          }
          
          // Создаем fieldName, поддерживающий кириллицу
          const fieldName = header.toLowerCase()
            .replace(/\s+/g, '_')
            .replace(/[^a-z0-9а-яё_]/g, '') // Добавляем поддержку кириллицы
            .replace(/_+/g, '_') // Убираем множественные подчеркивания
            .replace(/^_|_$/g, ''); // Убираем подчеркивания в начале и конце
          
          return {
            fieldName: fieldName || `field_${index + 1}`, // Fallback если fieldName пустой
            displayName: header,
            type: fieldType,
            required: isRequired,
            isForCalculator: isForCalculator,
            isForExport: true
          };
        });

        // Создаем field_mappings для автоматического шаблона
        const fieldMappingsData = templateFields.map(field => ({
          fieldName: field.fieldName,
          displayName: field.displayName,
          dataType: field.type,
          isRequired: field.required,
          isVisible: true
        }));

        const templateData = {
          name: `Автоматический шаблон для ${categoryInfo.name}`,
          description: `Шаблон создан автоматически при первой загрузке товаров в категорию ${categoryInfo.name}. Поля отфильтрованы и ограничены.`,
          catalog_category_id: category,
          field_mappings: JSON.stringify(fieldMappingsData),
          required_fields: JSON.stringify(templateFields.filter(f => f.required)),
          calculator_fields: JSON.stringify(templateFields.filter(f => f.isForCalculator)),
          export_fields: JSON.stringify(templateFields),
          is_active: true
        };

        let templateResponse;
        
        if (importTemplate) {
          // Обновляем существующий шаблон
          templateResponse = await fetch(`${req.nextUrl.origin}/api/admin/import-templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...templateData,
              id: importTemplate.id // Добавляем ID для обновления
            })
          });
          logger.info('Обновляем существующий шаблон', 'admin/import/universal', { templateId: importTemplate.id });
        } else {
          // Создаем новый шаблон
          templateResponse = await fetch(`${req.nextUrl.origin}/api/admin/import-templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(templateData)
          });
          logger.info('Создаем новый шаблон', 'admin/import/universal');
        }

        if (templateResponse.ok) {
          const templateResult = await templateResponse.json();
          importTemplate = templateResult.template;
          logger.info('Шаблон сохранен', 'admin/import/universal', {
            templateId: importTemplate.id,
            requiredFieldsCount: templateFields.filter((f: FieldMapping) => f.required).length,
            calculatorFieldsCount: templateFields.filter((f: FieldMapping) => f.isForCalculator).length,
            totalFieldsCount: templateFields.length
          });
        } else {
          logger.error('Ошибка при сохранении шаблона', 'admin/import/universal');
        }
      } catch (error) {
        logger.error('Ошибка при автоматическом создании шаблона', 'admin/import/universal', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
      }
    }

    logger.debug('Starting row processing', 'admin/import/universal', {
      totalRows: rows.length,
      firstFewRows: rows.slice(0, 3)
    });

    // Обрабатываем каждую строку
    rows.forEach((row, index) => {
      if (index < 5) {
        logger.debug(`Processing row ${index + 1}`, 'admin/import/universal', {
          rowIndex: index + 1,
          rowData: row,
          headers,
          rowLength: row.length,
          headersLength: headers.length
        });
      }
      
      if (row.length === 0 || row.every(cell => !cell)) {
        if (index < 5) {
          logger.debug(`Skipping empty row ${index + 2}`, 'admin/import/universal', { rowIndex: index + 2 });
        }
        return; // Пропускаем пустые строки
      }

      const product: ProductData = { name: '' };
      let hasErrors = false;

      // Создаем объект specifications для хранения всех свойств
      const specifications: Record<string, unknown> = {};

      // Маппим поля согласно настройкам категории
      if (index < 5) {
        logger.debug('Mapping config', 'admin/import/universal', {
          mappingConfig,
          hasCalculatorFields: !!mappingConfig.calculator_fields,
          calculatorFields: mappingConfig.calculator_fields
        });
      }
      
      // Упрощенный маппинг - добавляем все данные из строки в specifications
      headers.forEach((header, headerIndex) => {
        if (row[headerIndex] !== undefined && row[headerIndex] !== null && row[headerIndex] !== '') {
          specifications[header] = row[headerIndex];
        }
      });
      
      // Ищем поле с ценой для product.price - используем точный маппинг из шаблона
      const fieldMappingsArr = mappingConfig?.fieldMappings && Array.isArray(mappingConfig.fieldMappings) ? mappingConfig.fieldMappings : (typeof mappingConfig?.fieldMappings === 'string' ? (JSON.parse(mappingConfig.fieldMappings || '[]') as FieldMapping[]) : []);
      if (mappingConfig && fieldMappingsArr.length > 0) {
        // Находим поле цены из шаблона
        const priceMapping = fieldMappingsArr.find((field: FieldMapping) => 
          (field.dataType === 'number' || !field.dataType) && 
          ((field.displayName && field.displayName.toLowerCase().includes('цена')) || 
           (field.fieldName && field.fieldName.toLowerCase().includes('цена')))
        );
        
        if (priceMapping && priceMapping.fieldName) {
          const priceValue = specifications[priceMapping.fieldName];
          if (priceValue !== undefined && priceValue !== null && priceValue !== '') {
            product.price = (typeof priceValue === 'string' || typeof priceValue === 'number' ? priceValue : String(priceValue)) as string | number;
            if (index < 5) {
              logger.debug(`Found price from template mapping`, 'admin/import/universal', {
                fieldName: priceMapping.fieldName,
                displayName: priceMapping.displayName,
                priceValue,
                priceType: typeof priceValue
              });
            }
          } else {
            if (index < 5) {
              logger.debug(`Price field is empty or undefined`, 'admin/import/universal', { fieldName: priceMapping.fieldName });
            }
          }
        } else {
          if (index < 5) {
            logger.debug(`No price mapping found in template`, 'admin/import/universal');
          }
        }
      } else {
        if (index < 5) {
          logger.debug(`No mapping config available`, 'admin/import/universal');
        }
      }
      
      // Дополнительная проверка: если specifications пустой, добавляем все данные из строки
      if (Object.keys(specifications).length === 0) {
        if (index < 5) {
          logger.debug('Specifications is empty, adding all row data directly', 'admin/import/universal');
        }
        headers.forEach((header, headerIdx) => {
          if (row[headerIdx] !== undefined && row[headerIdx] !== null && row[headerIdx] !== '') {
            specifications[header] = row[headerIdx];
          }
        });
      }
      
      // Извлекаем основные поля товара используя маппинг из шаблона
      if (fieldMappingsArr.length > 0) {
        const fieldMappings = fieldMappingsArr;
        
        // Ищем поле для названия товара
        const nameMapping = fieldMappings.find((f: FieldMapping) => 
          f.displayName && f.displayName.toLowerCase().includes('наименование')
        );
        
        if (nameMapping && nameMapping.fieldName && specifications[nameMapping.fieldName]) {
          product.name = String(specifications[nameMapping.fieldName]).trim();
          if (index < 5) {
            logger.debug(`Found product name from template`, 'admin/import/universal', { productName: product.name });
          }
        }
        
        // Ищем поле для артикула/SKU
        const skuMapping = fieldMappings.find((f: FieldMapping) => 
          f.displayName && f.displayName.toLowerCase().includes('артикул')
        );
        
        if (skuMapping && skuMapping.fieldName && specifications[skuMapping.fieldName]) {
          product.sku = String(specifications[skuMapping.fieldName]).trim();
          if (index < 5) {
            logger.debug(`Found product SKU from template`, 'admin/import/universal', { productSku: product.sku });
          }
        }
      }
      
      // Сохраняем все данные в specifications
      product.specifications = specifications;
      
      // Отладочная информация для первого товара
      if (index === 0) {
        logger.debug('First product debug', 'admin/import/universal', {
          rowData: row,
          headers,
          mappingConfig,
          specifications,
          productName: product.name,
          productSku: product.sku,
          productPrice: product.price,
          product
        });
      }

      // Проверяем обязательные поля - только если они заданы
      if (index < 5) {
        logger.debug('Validation', 'admin/import/universal', {
          requiredFields,
          calculatorFields: mappingConfig.calculator_fields,
          specificationsKeys: Object.keys(specifications)
        });
      }
      
      // Валидация на основе шаблона - более мягкая
      if (importTemplate && importTemplate.requiredFields) {
        // Парсим requiredFields если это строка
        let templateRequiredFields = importTemplate.requiredFields;
        if (typeof templateRequiredFields === 'string') {
          try {
            templateRequiredFields = JSON.parse(templateRequiredFields);
          } catch (e) {
            logger.error('Error parsing requiredFields for validation', 'admin/import/universal', e instanceof Error ? { error: e.message } : { error: String(e) });
            templateRequiredFields = [];
          }
        }
        
        // Проверяем, что это массив
        if (Array.isArray(templateRequiredFields) && templateRequiredFields.length > 0) {
          const missingRequiredFields: string[] = [];
          
          templateRequiredFields.forEach((field: FieldMapping) => {
            const fieldName = (field.fieldName || field.sourceField || '') as string;
            if (!specifications[fieldName] || specifications[fieldName] === '') {
              missingRequiredFields.push(fieldName);
            }
          });
        
          if (missingRequiredFields.length > 0) {
            if (index < 5) {
              logger.warn(`Validation warning: Missing required fields`, 'admin/import/universal', {
                missingFields: missingRequiredFields.join(', '),
                message: 'But continuing anyway - soft validation mode'
              });
            }
            // Не добавляем ошибку, просто предупреждение
            // errors.push(`Строка ${index + 2}: Отсутствуют обязательные поля: ${missingRequiredFields.join(', ')}`);
            // hasErrors = true;
          } else {
            if (index < 5) {
              logger.debug('Product passed validation - all required fields present', 'admin/import/universal');
            }
          }
        }
      }
      
      // Основная валидация - проверяем только что есть данные
      if (Object.keys(specifications).length === 0) {
        if (index < 5) {
          logger.debug('Validation error: No data in specifications', 'admin/import/universal');
        }
        errors.push(`Строка ${index + 2}: Товар не содержит данных`);
        hasErrors = true;
      } else {
        if (index < 5) {
          logger.debug('Product passed validation - has specifications data', 'admin/import/universal', {
            specificationsKeysCount: Object.keys(specifications).length
          });
        }
      }

      if (!hasErrors) {
        products.push({
          ...product,
          properties_data: specifications, // Добавляем properties_data
          row_number: index + 2,
          category: category
        });
        
        // Отладочная информация для первых нескольких товаров
        if (index < 5) {
          logger.debug(`Product ${index + 1} added`, 'admin/import/universal', {
            product,
            specifications,
            hasErrors
          });
        }
      } else {
        // Отладочная информация для товаров с ошибками
        if (index < 5) {
          logger.debug(`Product ${index + 1} rejected`, 'admin/import/universal', {
            product,
            specifications,
            hasErrors,
            errors: errors.slice(-1)
          });
        }
      }
    });

    logger.info('Row processing completed', 'admin/import/universal', {
      totalProductsProcessed: products.length,
      totalErrorsFound: errors.length,
      first3Products: products.slice(0, 3)
    });

    const result: ImportResult = {
      success: true,
      message: "Файл успешно обработан",
      category: typeof categoryInfo === 'string' ? categoryInfo : (categoryInfo?.name ?? category),
      filename: file.name,
      size: file.size,
      type: file.type,
      mapping: mappingConfig,
      imported: products.length,
      errors: errors,
      products: products.slice(0, 10), // Показываем первые 10 товаров для предпросмотра
      photo_mapping: {}, // Будет заполнено после загрузки фото
      file_content_preview: headers.join(', '), // Показываем заголовки
      processing_status: errors.length > 0 ? "partial" : "success",
      note: `Обработано ${rows.length} строк, успешно импортировано ${products.length} товаров`,
      category_properties: categoryInfo.properties,
      required_fields: requiredFields,
      headers: headers,
      total_rows: rows.length,
      valid_rows: products.length,
      error_rows: errors.length,
      debug: {
        first_row: rows[0],
        mapping_config: mappingConfig as Record<string, string>,
        sample_product: products[0] || null
      }
    };

    logger.info('API call success', 'admin/import/universal', { productsCount: products.length, errorsCount: errors.length });
    
    // Сохраняем товары напрямую в базу данных
    const savedProducts: unknown[] = [];
    const failedProducts: FailedProduct[] = [];
    const errorStats: Record<string, number> = {};
    
    try {
      logger.info('Saving products directly to database', 'admin/import/universal', { totalProducts: products.length, firstProduct: products[0] });
      
      if (products.length === 0) {
        logger.warn('No products to save - products array is empty', 'admin/import/universal', { message: 'This might be due to validation errors or empty data' });
        result.save_message = 'Предупреждение: Нет товаров для сохранения - возможно, все товары были отклонены при валидации';
      }
      
      for (let i = 0; i < products.length; i++) {
        const product = products[i];
        try {
          // Минимальная валидация - только проверяем что товар не пустой
          if (!product.properties_data || Object.keys(product.properties_data).length === 0) {
            throw new Error('Товар не содержит данных');
          }
          
          // Профессиональная валидация и парсинг цены
          let basePrice = 0;
          if (product.price !== undefined && product.price !== null && product.price !== '') {
            logger.debug(`Processing price for product ${i+1}`, 'admin/import/universal', { productIndex: i + 1, rawPrice: product.price, priceType: typeof product.price });
            
            // Конвертируем в строку и очищаем
            const priceString = product.price.toString().trim();
            logger.debug(`Price string after trim`, 'admin/import/universal', { priceString });
            
            // Удаляем все кроме цифр, точек и запятых
            const cleanedPrice = priceString.replace(/[^\d.,]/g, '').replace(',', '.');
            logger.debug(`Cleaned price`, 'admin/import/universal', { cleanedPrice });
            
            const parsedPrice = parseFloat(cleanedPrice);
            logger.debug(`Parsed price`, 'admin/import/universal', { parsedPrice, isNaN: isNaN(parsedPrice) });
            
            if (isNaN(parsedPrice)) {
              throw new Error(`Invalid price value: "${product.price}" -> "${cleanedPrice}" -> NaN`);
            }
            
            basePrice = parsedPrice;
          } else {
            logger.debug(`Product ${i+1}: price is empty/null/undefined`, 'admin/import/universal', { productIndex: i + 1 });
          }
          
          // Профессиональная валидация количества
          let stockQuantity = 0;
          if (product.stock !== undefined && product.stock !== null && product.stock !== '') {
            const parsedStock = parseInt(product.stock.toString());
            if (isNaN(parsedStock)) {
              throw new Error(`Invalid stock quantity: "${product.stock}"`);
            }
            stockQuantity = parsedStock;
          }
          
          // Генерируем SKU если его нет
          const productSku = product.sku || `SKU_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          
          // Профессиональная проверка на существование товара
          const existingProduct = await prisma.product.findFirst({
            where: {
              AND: [
                { catalog_category_id: category },
                { sku: productSku }
              ]
            }
          });
          
          let savedProduct;
          if (existingProduct) {
            // Обновляем существующий товар
            savedProduct = await prisma.product.update({
              where: { id: existingProduct.id },
              data: {
                name: product.name || 'Без названия',
                base_price: basePrice,
                stock_quantity: stockQuantity,
                brand: product.brand || '',
                model: product.model || '',
                description: product.description || '',
                specifications: JSON.stringify(product.properties_data || {}),
                properties_data: JSON.stringify(product.properties_data || {}),
                is_active: true,
                updated_at: new Date()
              }
            });
            logger.info(`Updated existing product`, 'admin/import/universal', { productSku });
          } else {
            // Создаем новый товар
            savedProduct = await prisma.product.create({
              data: {
                catalog_category_id: category,
                sku: productSku,
                name: product.name || 'Без названия',
                base_price: basePrice,
                stock_quantity: stockQuantity,
                brand: product.brand || '',
                model: product.model || '',
                description: product.description || '',
                specifications: JSON.stringify(product.properties_data || {}),
                properties_data: JSON.stringify(product.properties_data || {}),
                is_active: true
              }
            });
            logger.info(`Created new product`, 'admin/import/universal', { productSku });
          }
          
          savedProducts.push(savedProduct);
          if (i < 5) { // Логируем первые 5 товаров
            logger.debug(`Product ${i+1} saved`, 'admin/import/universal', { productId: savedProduct.id, productName: savedProduct.name });
          }
          
        } catch (productError) {
          const errorMessage = productError instanceof Error ? productError.message : 'Unknown error';
          const errorCode = (productError as { code?: string })?.code;
          
          // Собираем статистику ошибок
          const errorKey = errorCode || errorMessage;
          errorStats[errorKey] = (errorStats[errorKey] || 0) + 1;
          
          failedProducts.push({
            index: i + 1,
            product: {
              name: product.name,
              sku: product.sku,
              price: product.price
            },
            error: errorMessage,
            errorCode: errorCode
          });
          
          logger.error(`Product ${i+1} failed`, 'admin/import/universal', {
            name: product.name,
            sku: product.sku,
            error: errorMessage,
            errorCode: errorCode
          });
        }
      }
      
      logger.info('СТАТИСТИКА СОХРАНЕНИЯ', 'admin/import/universal', {
        totalProcessed: products.length,
        saved: savedProducts.length,
        failed: failedProducts.length,
        difference: products.length - savedProducts.length
      });
      
      if (failedProducts.length > 0) {
        logger.warn('СТАТИСТИКА ОШИБОК', 'admin/import/universal', {
          errorStats,
          firstFailedProducts: failedProducts.slice(0, 10)
        });
        
        // Анализ причин ошибок
        const emptyNames = failedProducts.filter((f: FailedProduct) => !f.product.name || f.product.name.trim() === '').length;
        const duplicateSkus = failedProducts.filter((f: FailedProduct) => f.errorCode === 'P2002').length;
        const validationErrors = failedProducts.filter((f: FailedProduct) => f.error.includes('validation')).length;
        
        logger.debug('Анализ ошибок', 'admin/import/universal', {
          emptyNames,
          duplicateSkus,
          validationErrors
        });
      }
      
      result.imported = savedProducts.length;
      result.database_saved = savedProducts.length;
      result.total_processed = products.length;
      result.failed_products = failedProducts.length;
      result.error_stats = errorStats;
      result.failed_products_sample = failedProducts.slice(0, 10);
      result.save_message = `Успешно сохранено ${savedProducts.length} из ${products.length} товаров в базу данных`;
      
    } catch (saveError) {
      logger.error('Error saving products directly', 'admin/import/universal', saveError instanceof Error ? { error: saveError.message, stack: saveError.stack } : { error: String(saveError) });
      result.save_message = 'Ошибка при сохранении в базу данных: ' + (saveError instanceof Error ? saveError.message : 'Неизвестная ошибка');
    }
    
    // Обновляем статистику
    try {
      // Получаем токен из запроса для передачи в внутренний запрос
      const authHeader = req.headers.get('authorization');
      const xAuthToken = req.headers.get('x-auth-token');
      const cookieToken = req.cookies.get('auth-token')?.value;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (xAuthToken || cookieToken);
      
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['x-auth-token'] = token;
      }
      
      await fetch(`${req.nextUrl.origin}/api/admin/stats`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          imported: products.length, 
          filename: file.name,
          category: category
        })
      });
    } catch (statsError) {
      logger.error('Error updating stats', 'admin/import/universal', statsError instanceof Error ? { error: statsError.message } : { error: String(statsError) });
    }
    
    // Добавляем в историю импортов
    try {
      // Получаем токен из запроса для передачи в внутренний запрос
      const authHeader = req.headers.get('authorization');
      const xAuthToken = req.headers.get('x-auth-token');
      const cookieToken = req.cookies.get('auth-token')?.value;
      const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : (xAuthToken || cookieToken);
      
      const headers: HeadersInit = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['x-auth-token'] = token;
      }
      
      await fetch(`${req.nextUrl.origin}/api/admin/import-history`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          category: category,
          filename: file.name,
          imported: savedProducts.length,
          status: failedProducts.length > 0 ? 'partial' : 'completed',
          error_message: failedProducts.length > 0 ? JSON.stringify(failedProducts.slice(0, 5)) : null
        })
      });
    } catch (historyError) {
      logger.error('Error updating import history', 'admin/import/universal', historyError instanceof Error ? { error: historyError.message } : { error: String(historyError) });
    }
    
    // Обновляем счетчики товаров в категориях
    try {
      await fetch(`${req.nextUrl.origin}/api/admin/categories/update-counts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      logger.debug('Product counts updated successfully', 'admin/import/universal');
    } catch (countsError) {
      logger.error('Error updating product counts', 'admin/import/universal', countsError instanceof Error ? { error: countsError.message } : { error: String(countsError) });
    }
    
    logger.info('Универсальный импорт завершен', 'admin/import/universal', { 
      userId: user.userId,
      savedProducts: savedProducts.length,
      failedProducts: failedProducts.length
    });
    
    return apiSuccess(result);
  } catch (error) {
    logger.error('Ошибка обработки файла', 'admin/import/universal', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка обработки файла', 500);
  }
}

export const POST = withErrorHandling(
  requireAuthAndPermission(postHandler, 'ADMIN'),
  'admin/import/universal/POST'
);
