import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as XLSX from 'xlsx';
import { validateDocumentFile } from '../../../../../lib/validation/file-validation';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api/response';
import { ValidationError, NotFoundError } from '@/lib/api/errors';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import type { AuthenticatedUser } from '@/lib/auth/request-helpers';

// ===================== Импорт товаров по шаблону =====================

async function postHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const formData = await req.formData();
  const file = formData.get("file") as File;
  const categoryId = formData.get("categoryId") as string;
  const templateId = formData.get("templateId") as string;
  const mode = formData.get("mode") as string || 'preview'; // 'preview' или 'import'

  if (!file) {
    throw new ValidationError('Файл не предоставлен');
  }

  if (!categoryId) {
    throw new ValidationError('Категория не указана');
  }

  // Валидация файла
  const validation = validateDocumentFile(file);
  if (!validation.isValid) {
    throw new ValidationError(validation.error || 'Неверный формат файла');
  }

  logger.debug('Импорт товаров по шаблону', 'admin/import-templates/import/POST', {
    fileName: file.name,
    fileSize: file.size,
    categoryId,
    templateId,
    mode
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
    throw new NotFoundError('Шаблон не найден для данной категории');
  }

  // Парсим поля шаблона
  let requiredFields = [];
  let calculatorFields = [];
  let exportFields = [];

  try {
    requiredFields = template.required_fields ? JSON.parse(template.required_fields) : [];
    calculatorFields = template.calculator_fields ? JSON.parse(template.calculator_fields) : [];
    exportFields = template.export_fields ? JSON.parse(template.export_fields) : [];
  } catch (error) {
    logger.error('Ошибка парсинга полей шаблона', 'admin/import-templates/import/POST', { error }, loggingContext);
    throw new ValidationError('Ошибка при чтении полей шаблона');
  }

    // Читаем Excel файл
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (jsonData.length === 0) {
      return NextResponse.json(
        { error: "Файл пустой или не содержит данных" },
        { status: 400 }
      );
    }

    // Первая строка - заголовки
    const headers = jsonData[0] as string[];
    const rows = jsonData.slice(1) as any[][];

    // Создаем маппинг полей шаблона на заголовки файла
    const allTemplateFields = [...requiredFields, ...calculatorFields, ...exportFields];
    const fieldMapping: Record<string, number> = {};

    allTemplateFields.forEach(field => {
      const fieldName = field.displayName || field.fieldName || field;
      const headerIndex = headers.findIndex(header => 
        header && header.toString().trim() === fieldName.toString().trim()
      );
      if (headerIndex !== -1) {
        fieldMapping[field.fieldName || field] = headerIndex;
      }
    });

    logger.debug('Маппинг полей', 'admin/import-templates/import/POST', {
      fieldMapping,
      headersCount: headers.length,
      templateFieldsCount: allTemplateFields.length
    }, loggingContext);

    // Обрабатываем строки данных
    const products = [];
    const errors = [];
    const warnings = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      if (!row || row.every(cell => !cell)) {
        continue; // Пропускаем пустые строки
      }

      const product: any = {
        rowNumber: i + 2, // +2 потому что первая строка - заголовки, а индексация с 0
        specifications: {},
        errors: [],
        warnings: []
      };

      // Заполняем спецификации на основе маппинга
      allTemplateFields.forEach(field => {
        const fieldName = field.fieldName || field;
        const headerIndex = fieldMapping[fieldName];
        
        if (headerIndex !== undefined && row[headerIndex] !== undefined && row[headerIndex] !== '') {
          let value = row[headerIndex];
          
          // Преобразуем значение в зависимости от типа поля
          if (field.type === 'number') {
            const numValue = parseFloat(String(value).replace(',', '.'));
            if (!isNaN(numValue)) {
              value = numValue;
            } else {
              product.warnings.push(`Поле "${field.displayName || fieldName}" должно быть числом`);
            }
          } else if (field.type === 'boolean') {
            value = String(value).toLowerCase() === 'да' || String(value).toLowerCase() === 'true' || String(value) === '1';
          } else if (field.type === 'date') {
            // Пытаемся распарсить дату
            const dateValue = new Date(String(value));
            if (!isNaN(dateValue.getTime())) {
              value = dateValue.toISOString().split('T')[0];
            } else {
              product.warnings.push(`Поле "${field.displayName || fieldName}" должно быть датой`);
            }
          }
          
          product.specifications[fieldName] = value;
        } else if (field.isRequired || requiredFields.includes(field)) {
          product.errors.push(`Обязательное поле "${field.displayName || fieldName}" не заполнено`);
        }
      });

      // Проверяем обязательные поля
      const missingRequiredFields = requiredFields.filter((field: any) => {
        const fieldName = field.fieldName || field;
        return !product.specifications[fieldName] || product.specifications[fieldName] === '';
      });

      if (missingRequiredFields.length > 0) {
        product.errors.push(`Отсутствуют обязательные поля: ${missingRequiredFields.map((f: { displayName?: string; fieldName?: string }) => f.displayName || f.fieldName || String(f)).join(', ')}`);
      }

      // Добавляем продукт в результат
      if (product.errors.length === 0) {
        products.push(product);
      } else {
        errors.push({
          rowNumber: product.rowNumber,
          errors: product.errors,
          warnings: product.warnings,
          data: product.specifications
        });
      }
    }

    // Если режим предварительного просмотра, возвращаем результат без сохранения
    if (mode === 'preview') {
      logger.info('Режим предварительного просмотра', 'admin/import-templates/import/POST', {
        total: rows.length,
        valid: products.length,
        invalid: errors.length
      }, loggingContext);

      return apiSuccess({
        mode: 'preview',
        total: rows.length,
        valid: products.length,
        invalid: errors.length,
        products: products.slice(0, 10), // Показываем только первые 10 товаров
        errors: errors.slice(0, 20), // Показываем только первые 20 ошибок
        template: {
          id: template.id,
          name: template.name,
          requiredFields: requiredFields.length,
          calculatorFields: calculatorFields.length,
          exportFields: exportFields.length
        },
        fieldMapping
      });
    }

    // Режим импорта - сохраняем товары в базу данных
    if (mode === 'import') {
      let importedCount = 0;
      const importErrors = [];

      for (const product of products) {
        try {
          // Создаем или обновляем товар
          const skuVal = product.specifications.sku || product.specifications.Артикул || `imported_${Date.now()}_${importedCount}`;
          const existingProduct = await prisma.product.findFirst({
            where: {
              catalog_category_id: categoryId,
              sku: skuVal
            }
          });

          const productData = {
            catalog_category_id: categoryId,
            sku: skuVal,
            name: String(product.specifications.name || product.specifications.Название || 'Импортированный товар'),
            base_price: parseFloat(String(product.specifications.price || product.specifications.Цена || '0')) || 0,
            currency: 'RUB',
            properties_data: JSON.stringify(product.specifications),
            is_active: true,
            stock_quantity: parseInt(String(product.specifications.stock || product.specifications.Остаток || '0'), 10) || 0
          };

          if (existingProduct) {
            await prisma.product.update({
              where: { id: existingProduct.id },
              data: productData
            });
          } else {
            await prisma.product.create({
              data: productData
            });
          }

          importedCount++;
        } catch (error) {
          logger.warn('Ошибка импорта товара', 'admin/import-templates/import/POST', {
            rowNumber: product.rowNumber,
            error
          }, loggingContext);
          importErrors.push({
            rowNumber: product.rowNumber,
            error: 'Ошибка при сохранении в базу данных',
            data: product.specifications
          });
        }
      }

      // Обновляем счетчики товаров в категории
      try {
        await prisma.catalogCategory.update({
          where: { id: categoryId },
          data: {
            products_count: {
              increment: importedCount
            }
          }
        });
      } catch (error) {
        logger.warn('Ошибка обновления счетчика товаров в категории', 'admin/import-templates/import/POST', { error }, loggingContext);
      }

      logger.info('Импорт завершен', 'admin/import-templates/import/POST', {
        total: rows.length,
        imported: importedCount,
        errors: errors.length + importErrors.length
      }, loggingContext);

      return apiSuccess({
        mode: 'import',
        total: rows.length,
        imported: importedCount,
        errors: errors.length + importErrors.length,
        importErrors: importErrors,
        validationErrors: errors,
        template: {
          id: template.id,
          name: template.name
        }
      });
    }

    throw new ValidationError('Неверный режим импорта');
}

export const POST = withErrorHandling(
  requireAuthAndPermission(postHandler, 'ADMIN'),
  'admin/import-templates/import/POST'
);
