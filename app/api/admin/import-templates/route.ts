import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError, NotFoundError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';
import { fixAllEncoding } from '@/lib/encoding-utils';

// ===================== Создание шаблона загрузки =====================

async function postHandler(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const rawData = (await req.json()) as Record<string, unknown>;
    
    // Исправляем кодировку входящих данных
    const encoded = fixAllEncoding(rawData) as Record<string, unknown>;
    const name = encoded.name as string | undefined;
    const description = encoded.description as string | undefined;
    const catalog_category_id = encoded.catalog_category_id as string | undefined;
    const template_config = encoded.template_config;
    const field_mappings = encoded.field_mappings;
    const required_fields = encoded.required_fields;
    const calculator_fields = encoded.calculator_fields;
    const export_fields = encoded.export_fields;
    const validation_rules = encoded.validation_rules;

    if (!name || !catalog_category_id) {
      throw new ValidationError('Не указаны обязательные поля: name, catalog_category_id');
    }

    logger.info('Создание шаблона импорта', 'admin/import-templates', { userId: user.userId, name, catalog_category_id });

    // Проверяем существование категории каталога
    const catalogCategory = await prisma.catalogCategory.findUnique({ 
      where: { id: catalog_category_id } 
    });

    if (!catalogCategory) {
      throw new NotFoundError('Catalog категория не найдена');
    }

    // Проверяем, существует ли уже шаблон для этой категории
    let importTemplate;
    
    const existingTemplate = await prisma.importTemplate.findUnique({
      where: { catalog_category_id }
    });
    
    if (existingTemplate) {
      // Если шаблон уже существует, НЕ обновляем его - используем существующий
      logger.info('Шаблон уже существует, используем существующий', 'admin/import-templates', { templateId: existingTemplate.id });
      importTemplate = existingTemplate;
    } else {
      // Если шаблона нет, создаем новый
      importTemplate = await prisma.importTemplate.create({
        data: {
          name,
          description: description || '',
          catalog_category_id,
          template_config: template_config ? JSON.stringify(template_config) : '{}',
          field_mappings: field_mappings ? JSON.stringify(field_mappings) : '[]',
          required_fields: required_fields ? JSON.stringify(required_fields) : '[]',
          calculator_fields: calculator_fields ? JSON.stringify(calculator_fields) : '[]',
          export_fields: export_fields ? JSON.stringify(export_fields) : '[]',
          validation_rules: validation_rules ? JSON.stringify(validation_rules) : '{}',
          is_active: true
        }
      });
      logger.info('Создан новый шаблон', 'admin/import-templates', { templateId: importTemplate.id });
    }

    logger.info('Шаблон импорта создан', 'admin/import-templates', { templateId: importTemplate.id });

    return apiSuccess({
      template: {
        id: importTemplate.id,
        name: importTemplate.name,
        description: importTemplate.description,
        catalogCategoryId: importTemplate.catalog_category_id,
        templateConfig: JSON.parse(importTemplate.template_config || '{}'),
        fieldMappings: JSON.parse(importTemplate.field_mappings || '[]'),
        requiredFields: JSON.parse(importTemplate.required_fields || '[]'),
        calculatorFields: JSON.parse(importTemplate.calculator_fields || '[]'),
        exportFields: JSON.parse(importTemplate.export_fields || '[]'),
        validationRules: JSON.parse(importTemplate.validation_rules || '{}'),
        isActive: importTemplate.is_active,
        createdAt: importTemplate.created_at,
        updatedAt: importTemplate.updated_at
      },
      message: 'Шаблон загрузки успешно создан'
    });

  } catch (error) {
    logger.error('Import template creation error', 'admin/import-templates', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка при создании шаблона загрузки', 500);
  }
}

export const POST = withErrorHandling(
  requireAuthAndPermission(postHandler, 'ADMIN'),
  'admin/import-templates/POST'
);

// ===================== Получение шаблонов загрузки =====================

async function getHandler(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const catalogCategoryId = searchParams.get('catalog_category_id');

    logger.info('Получение шаблонов импорта', 'admin/import-templates', { userId: user.userId, catalogCategoryId });

    let whereClause: Record<string, unknown> = { is_active: true };

    if (catalogCategoryId) {
      whereClause.catalog_category_id = catalogCategoryId;
    }

    const templates = await prisma.importTemplate.findMany({
      where: whereClause,
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

    const formattedTemplates = templates.map(template => ({
      id: template.id,
      name: template.name,
      description: template.description,
      catalogCategory: template.catalog_category ? {
        id: template.catalog_category.id,
        name: template.catalog_category.name,
        path: template.catalog_category.path
      } : null,
      templateConfig: (() => {
        if (typeof template.template_config === 'string') {
          try {
            const parsed = JSON.parse(template.template_config);
            return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
          } catch {
            return {};
          }
        }
        return template.template_config || {};
      })(),
      fieldMappings: (() => {
        if (typeof template.field_mappings === 'string') {
          try {
            const parsed = JSON.parse(template.field_mappings);
            return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
          } catch {
            return [];
          }
        }
        return template.field_mappings || [];
      })(),
      requiredFields: (() => {
        if (typeof template.required_fields === 'string') {
          try {
            const parsed = JSON.parse(template.required_fields);
            return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
          } catch {
            return [];
          }
        }
        return template.required_fields || [];
      })(),
      calculatorFields: (() => {
        if (typeof template.calculator_fields === 'string') {
          try {
            const parsed = JSON.parse(template.calculator_fields);
            return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
          } catch {
            return [];
          }
        }
        return template.calculator_fields || [];
      })(),
      exportFields: (() => {
        if (typeof template.export_fields === 'string') {
          try {
            const parsed = JSON.parse(template.export_fields);
            return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
          } catch {
            return [];
          }
        }
        return template.export_fields || [];
      })(),
      validationRules: (() => {
        if (typeof template.validation_rules === 'string') {
          try {
            const parsed = JSON.parse(template.validation_rules);
            return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
          } catch {
            return {};
          }
        }
        return template.validation_rules || {};
      })(),
      isActive: template.is_active,
      createdAt: template.created_at,
      updatedAt: template.updated_at
    }));

    logger.info('Шаблоны импорта получены', 'admin/import-templates', { count: formattedTemplates.length });

    return apiSuccess({
      templates: formattedTemplates,
      count: formattedTemplates.length
    });

  } catch (error) {
    logger.error('Import templates fetch error', 'admin/import-templates', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка при получении шаблонов загрузки', 500);
  }
}

export const GET = withErrorHandling(
  requireAuthAndPermission(getHandler, 'ADMIN'),
  'admin/import-templates/GET'
);
