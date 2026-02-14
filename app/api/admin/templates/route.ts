import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { fixFieldsEncoding, validateAndFixData, fixFieldEncoding, fixJSONEncoding } from '@/lib/encoding-utils';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api/response';
import { ValidationError, NotFoundError, ConflictError } from '@/lib/api/errors';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import type { AuthenticatedUser } from '@/lib/auth/request-helpers';
import { apiValidator } from '@/lib/api-validator';

// Временная реализация функции fixAllEncoding
function fixAllEncoding(data: any): any {
  if (typeof data === 'string') {
    return fixFieldEncoding(data);
  }
  
  if (Array.isArray(data)) {
    return data.map(fixAllEncoding);
  }
  
  if (typeof data === 'object' && data !== null) {
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      result[fixFieldEncoding(key)] = fixAllEncoding(value);
    }
    return result;
  }
  
  return data;
}

async function getHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { searchParams } = new URL(req.url);
  const catalogCategoryId = searchParams.get('catalogCategoryId');
  
  // Валидация параметров
  apiValidator.validateId(catalogCategoryId!, 'catalogCategoryId');

  // Получаем шаблон для категории
  logger.debug('Поиск шаблона для категории', 'admin/templates/GET', { catalogCategoryId }, loggingContext);
  const template = await prisma.importTemplate.findUnique({
    where: { catalog_category_id: catalogCategoryId! },
    include: {
      catalog_category: {
        select: { name: true }
      }
    }
  });
  
  logger.debug('Результат поиска шаблона', 'admin/templates/GET', {
    found: !!template,
    templateId: template?.id,
    templateName: template?.name
  }, loggingContext);

  if (!template) {
    throw new NotFoundError('Template not found for this category');
  }

  // Парсим поля шаблона с исправлением кодировки
  let requiredFields = JSON.parse(template.required_fields || '[]');
  let calculatorFields = JSON.parse(template.calculator_fields || '[]');
  let exportFields = JSON.parse(template.export_fields || '[]');
  let templateConfig = JSON.parse(template.template_config || '{}');
  
  // ИСПРАВЛЯЕМ КОДИРОВКУ - Prisma возвращает поврежденные данные
  requiredFields = fixFieldsEncoding(requiredFields);
  calculatorFields = fixFieldsEncoding(calculatorFields);
  exportFields = fixFieldsEncoding(exportFields);
  templateConfig = fixAllEncoding(templateConfig);
  
  // Исправляем название и описание шаблона
  const fixedName = fixFieldEncoding(template.name);
  const fixedDescription = fixFieldEncoding(template.description ?? '') ?? undefined;
  
  logger.debug('Поля после исправления кодировки', 'admin/templates/GET', {
    requiredFieldsCount: requiredFields.length,
    calculatorFieldsCount: calculatorFields.length,
    exportFieldsCount: exportFields.length
  }, loggingContext);

  return apiSuccess({
    template: {
      id: template.id,
      name: fixedName,
      description: fixedDescription,
      catalogCategoryId: template.catalog_category_id,
      catalogCategoryName: (template as { catalog_category?: { name: string } }).catalog_category?.name,
      requiredFields,
      calculatorFields,
      exportFields,
      templateConfig,
      createdAt: template.created_at,
      updatedAt: template.updated_at
    }
  });
}

export const GET = withErrorHandling(
  requireAuthAndPermission(getHandler, 'ADMIN'),
  'admin/templates/GET'
);

async function putHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const body = await req.json();
  const { 
    templateId, 
    name, 
    description, 
    requiredFields, 
    calculatorFields, 
    exportFields 
  } = body;

  if (!templateId) {
    throw new ValidationError('templateId is required');
  }

  // Проверяем существование шаблона
  const existingTemplate = await prisma.importTemplate.findUnique({
    where: { id: templateId }
  });

  if (!existingTemplate) {
    throw new NotFoundError('Template not found');
  }

  // Обновляем конфигурацию шаблона
  const templateConfig = {
    headers: requiredFields,
    requiredFields,
    fieldMappings: {} // Убираем маппинг, поля должны совпадать
  };

  // Валидируем и исправляем данные перед сохранением
  const validatedData = fixAllEncoding({
    name: name || existingTemplate.name,
    description: description || existingTemplate.description,
    requiredFields: fixFieldsEncoding(requiredFields),
    calculatorFields: fixFieldsEncoding(calculatorFields),
    exportFields: fixFieldsEncoding(exportFields),
    templateConfig: {
      headers: fixFieldsEncoding(requiredFields),
      requiredFields: fixFieldsEncoding(requiredFields),
      fieldMappings: {}
    }
  });

  // Обновляем шаблон
  const updatedTemplate = await prisma.importTemplate.update({
    where: { id: templateId },
    data: {
      name: validatedData.name,
      description: validatedData.description,
      required_fields: JSON.stringify(validatedData.requiredFields),
      calculator_fields: JSON.stringify(validatedData.calculatorFields),
      export_fields: JSON.stringify(validatedData.exportFields),
      template_config: JSON.stringify(validatedData.templateConfig),
      updated_at: new Date()
    }
  });

  logger.info('Шаблон обновлен', 'admin/templates/PUT', { templateId }, loggingContext);

  return apiSuccess({
    message: 'Template updated successfully',
    template: {
      id: updatedTemplate.id,
      name: updatedTemplate.name,
      description: updatedTemplate.description,
      requiredFields,
      calculatorFields,
      exportFields,
      updatedAt: updatedTemplate.updated_at
    }
  });
}

export const PUT = withErrorHandling(
  requireAuthAndPermission(putHandler, 'ADMIN'),
  'admin/templates/PUT'
);

async function postHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const body = await req.json();
  const { 
    catalogCategoryId, 
    name, 
    description, 
    requiredFields, 
    calculatorFields, 
    exportFields 
  } = body;

  if (!catalogCategoryId) {
    throw new ValidationError('catalogCategoryId is required');
  }

  // Проверяем, не существует ли уже шаблон для этой категории
  const existingTemplate = await prisma.importTemplate.findUnique({
    where: { catalog_category_id: catalogCategoryId }
  });

  if (existingTemplate) {
    throw new ConflictError('Template already exists for this category. Use PUT method to update.');
  }

  // Создаем конфигурацию шаблона
  const templateConfig = {
    headers: requiredFields,
    requiredFields,
    fieldMappings: {} // Убираем маппинг, поля должны совпадать
  };

  // Создаем новый шаблон
  const newTemplate = await prisma.importTemplate.create({
    data: {
      catalog_category_id: catalogCategoryId,
      name: name || 'Шаблон импорта',
      description: description || 'Шаблон для импорта товаров',
      required_fields: JSON.stringify(requiredFields),
      calculator_fields: JSON.stringify(calculatorFields),
      export_fields: JSON.stringify(exportFields),
      template_config: JSON.stringify(templateConfig),
      field_mappings: JSON.stringify({}) // Очищаем маппинг
    }
  });

  logger.info('Шаблон создан', 'admin/templates/POST', {
    templateId: newTemplate.id,
    catalogCategoryId
  }, loggingContext);

  return apiSuccess({
    message: 'Template created successfully',
    template: {
      id: newTemplate.id,
      name: newTemplate.name,
      description: newTemplate.description,
      catalogCategoryId: newTemplate.catalog_category_id,
      requiredFields,
      calculatorFields,
      exportFields,
      createdAt: newTemplate.created_at
    }
  });
}

export const POST = withErrorHandling(
  requireAuthAndPermission(postHandler, 'ADMIN'),
  'admin/templates/POST'
);
