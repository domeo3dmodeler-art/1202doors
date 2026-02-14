import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import * as XLSX from 'xlsx';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api/response';
import { ValidationError, NotFoundError } from '@/lib/api/errors';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import type { AuthenticatedUser } from '@/lib/auth/request-helpers';

// ===================== Экспорт шаблона в Excel =====================

async function getHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { searchParams } = new URL(req.url);
  const templateId = searchParams.get('templateId');
  const categoryId = searchParams.get('categoryId');

  if (!templateId && !categoryId) {
    throw new ValidationError('Необходимо указать templateId или categoryId');
  }

  logger.debug('Экспорт шаблона', 'admin/import-templates/export/GET', {
    templateId,
    categoryId
  }, loggingContext);

  let template;

  if (templateId) {
    // Получаем шаблон по ID
    template = await prisma.importTemplate.findUnique({
      where: { id: templateId },
      include: {
        catalog_category: {
          select: {
            id: true,
            name: true,
            path: true
          }
        }
      }
    });
  } else if (categoryId) {
    // Получаем шаблон по категории
    template = await prisma.importTemplate.findFirst({
      where: { 
        catalog_category_id: categoryId,
        is_active: true 
      },
      include: {
        catalog_category: {
          select: {
            id: true,
            name: true,
            path: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });
  }

  if (!template) {
    throw new NotFoundError('Шаблон не найден');
  }

    // Парсим поля шаблона - используем fieldMappings как основной источник
    let fieldMappings = [];
    let requiredFields = [];
    let calculatorFields = [];
    let exportFields = [];

    try {
      // Сначала пробуем получить fieldMappings
      if (template.field_mappings) {
        if (typeof template.field_mappings === 'string') {
          try {
            const parsed = JSON.parse(template.field_mappings);
            fieldMappings = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
          } catch {
            fieldMappings = [];
          }
        } else if (Array.isArray(template.field_mappings)) {
          fieldMappings = template.field_mappings;
        }
      }
      
      // Если есть fieldMappings, фильтруем их по категориям
      if (Array.isArray(fieldMappings) && fieldMappings.length > 0) {
        requiredFields = fieldMappings.filter(f => f.isRequired);
        calculatorFields = fieldMappings.filter(f => f.isCalculator || f.calculator_fields);
        exportFields = fieldMappings.filter(f => f.isExport || f.export_fields);
        
        // Если категории не определены, используем все как requiredFields
        if (requiredFields.length === 0 && calculatorFields.length === 0 && exportFields.length === 0) {
          requiredFields = fieldMappings;
        }
      } else {
        // Fallback к старому формату
        // Обрабатываем requiredFields
        if (template.required_fields) {
          if (typeof template.required_fields === 'string') {
            try {
              const parsed = JSON.parse(template.required_fields);
              requiredFields = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
            } catch {
              requiredFields = [];
            }
          } else if (Array.isArray(template.required_fields)) {
            requiredFields = template.required_fields;
          }
        }
        
        // Обрабатываем calculatorFields
        if (template.calculator_fields) {
          if (typeof template.calculator_fields === 'string') {
            try {
              const parsed = JSON.parse(template.calculator_fields);
              calculatorFields = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
            } catch {
              calculatorFields = [];
            }
          } else if (Array.isArray(template.calculator_fields)) {
            calculatorFields = template.calculator_fields;
          }
        }
        
        // Обрабатываем exportFields
        if (template.export_fields) {
          if (typeof template.export_fields === 'string') {
            try {
              const parsed = JSON.parse(template.export_fields);
              exportFields = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
            } catch {
              exportFields = [];
            }
          } else if (Array.isArray(template.export_fields)) {
            exportFields = template.export_fields;
          }
        }
      }
      
      // Проверяем, что все поля - массивы
      if (!Array.isArray(requiredFields)) requiredFields = [];
      if (!Array.isArray(calculatorFields)) calculatorFields = [];
      if (!Array.isArray(exportFields)) exportFields = [];
      
    } catch (error) {
      logger.error('Ошибка парсинга полей шаблона', 'admin/import-templates/export/GET', { error }, loggingContext);
      throw new ValidationError('Ошибка при чтении полей шаблона');
    }

    // Используем fieldMappings если есть, иначе объединяем все поля
    const allFields = fieldMappings.length > 0 ? fieldMappings : [...requiredFields, ...calculatorFields, ...exportFields];
    
    
    if (allFields.length === 0) {
      throw new ValidationError('Шаблон не содержит полей для экспорта');
    }

    // Создаем заголовки для Excel
    const headers = allFields.map((field: any) => {
      if (typeof field === 'string') {
        return field;
      }
      return field?.displayName || field?.fieldName || field || '';
    });

    // Создаем данные для Excel (заголовки + 5 пустых строк для заполнения)
    const worksheetData = [
      headers, // Заголовки
      ...Array(5).fill(null).map(() => headers.map(() => '')) // 5 пустых строк
    ];

    // Создаем рабочую книгу Excel
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

    // Настраиваем ширину колонок
    const columnWidths = headers.map((header: any) => ({ 
      wch: Math.max(15, Math.min(30, String(header).length + 5)) 
    }));
    worksheet['!cols'] = columnWidths;

    // Добавляем лист в книгу
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Шаблон');

    // Создаем второй лист с инструкциями
    const instructionsData = [
      ['ИНСТРУКЦИЯ ПО ЗАПОЛНЕНИЮ ШАБЛОНА'],
      [''],
      ['1. Заполните все обязательные поля (отмечены красным)'],
      ['2. Поля калькулятора используются для расчета цен'],
      ['3. Поля экспорта включаются в итоговый каталог'],
      [''],
      ['ОБЯЗАТЕЛЬНЫЕ ПОЛЯ:'],
      ...(Array.isArray(requiredFields) ? requiredFields.map(field => [
        `• ${field.displayName || field.fieldName || field} (${field.type || field.dataType || 'text'})`
      ]) : []),
      [''],
      ['ПОЛЯ КАЛЬКУЛЯТОРА:'],
      ...(Array.isArray(calculatorFields) ? calculatorFields.map(field => [
        `• ${field.displayName || field.fieldName || field} (${field.type || field.dataType || 'text'})`
      ]) : []),
      [''],
      ['ПОЛЯ ЭКСПОРТА:'],
      ...(Array.isArray(exportFields) ? exportFields.map(field => [
        `• ${field.displayName || field.fieldName || field} (${field.type || field.dataType || 'text'})`
      ]) : []),
      [''],
      ['ПРИМЕЧАНИЯ:'],
      ['• Не изменяйте названия колонок'],
      ['• Используйте точку как разделитель десятичных дробей'],
      ['• Даты указывайте в формате ДД.ММ.ГГГГ'],
      ['• Для полей типа "список" используйте только указанные варианты'],
      ['• Пустые строки будут проигнорированы при импорте']
    ];

    const instructionsWorksheet = XLSX.utils.aoa_to_sheet(instructionsData);
    instructionsWorksheet['!cols'] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(workbook, instructionsWorksheet, 'Инструкция');

    // Генерируем Excel файл
    const excelBuffer = XLSX.write(workbook, { 
      bookType: 'xlsx', 
      type: 'buffer',
      compression: true
    });

    // Создаем имя файла
    const categoryName = template.catalog_category?.name || 'category';
    const templateName = template.name || 'template';
    const fileName = `template_${categoryName}_${templateName}_${new Date().toISOString().split('T')[0]}.xlsx`;

    logger.info('Шаблон экспортирован', 'admin/import-templates/export/GET', {
      templateId: template.id,
      fileName,
      fieldsCount: allFields.length
    }, loggingContext);

    // Возвращаем файл
    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': (excelBuffer?.length || 0).toString(),
      },
    });
}

export const GET = withErrorHandling(
  requireAuthAndPermission(getHandler, 'ADMIN'),
  'admin/import-templates/export/GET'
);
