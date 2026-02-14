import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { logger } from '../../../../../lib/logging/logger';

// ===================== Получение шаблона загрузки по ID =====================

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const templateId = params.id;

    if (!templateId) {
      return NextResponse.json(
        { error: 'Не указан ID шаблона' },
        { status: 400 }
      );
    }

    const template = await prisma.importTemplate.findUnique({
      where: { id: templateId },
      include: {
        catalog_category: {
          select: {
            id: true,
            name: true,
            path: true,
            level: true
          }
        },
        import_history: {
          orderBy: { created_at: 'desc' },
          take: 10
        }
      }
    });

    if (!template) {
      return NextResponse.json(
        { error: 'Шаблон загрузки не найден' },
        { status: 404 }
      );
    }

    const formattedTemplate = {
      id: template.id,
      name: template.name,
      description: template.description,
      frontendCategory: null as { id: string; name: string; slug: string; description: string | null } | null,
      catalogCategory: template.catalog_category ? {
        id: template.catalog_category.id,
        name: template.catalog_category.name,
        path: template.catalog_category.path,
        level: template.catalog_category.level
      } : null,
      templateConfig: JSON.parse(template.template_config || '{}'),
      fieldMappings: JSON.parse(template.field_mappings || '[]'),
      requiredFields: JSON.parse(template.required_fields || '[]'),
      validationRules: JSON.parse(template.validation_rules || '{}'),
      isActive: template.is_active,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
      importHistory: template.import_history.map((history: any) => ({
        id: history.id,
        filename: history.filename,
        importedCount: history.imported_count,
        errorCount: history.error_count,
        status: history.status,
        createdAt: history.created_at
      }))
    };

    return NextResponse.json({
      success: true,
      template: formattedTemplate
    });

  } catch (error) {
    logger.error('Import template fetch error', 'admin/import-templates/[id]', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return NextResponse.json(
      { error: 'Ошибка при получении шаблона загрузки' },
      { status: 500 }
    );
  }
}

// ===================== Обновление шаблона загрузки =====================

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const templateId = params.id;
    const { 
      name, 
      description, 
      template_config,
      field_mappings,
      required_fields,
      validation_rules,
      is_active
    } = await req.json();

    if (!templateId) {
      return NextResponse.json(
        { error: 'Не указан ID шаблона' },
        { status: 400 }
      );
    }

    // Проверяем существование шаблона
    const existingTemplate = await prisma.importTemplate.findUnique({
      where: { id: templateId }
    });

    if (!existingTemplate) {
      return NextResponse.json(
        { error: 'Шаблон загрузки не найден' },
        { status: 404 }
      );
    }

    // Подготавливаем данные для обновления
    const updateData: any = {
      updated_at: new Date()
    };

    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (template_config !== undefined) updateData.template_config = JSON.stringify(template_config);
    if (field_mappings !== undefined) updateData.field_mappings = JSON.stringify(field_mappings);
    if (required_fields !== undefined) updateData.required_fields = JSON.stringify(required_fields);
    if (validation_rules !== undefined) updateData.validation_rules = JSON.stringify(validation_rules);
    if (is_active !== undefined) updateData.is_active = is_active;

    // Обновляем шаблон
    const updatedTemplate = await prisma.importTemplate.update({
      where: { id: templateId },
      data: updateData
    });

    return NextResponse.json({
      success: true,
      template: {
        id: updatedTemplate.id,
        name: updatedTemplate.name,
        description: updatedTemplate.description,
        frontendCategoryId: null as string | null,
        catalogCategoryId: updatedTemplate.catalog_category_id,
        templateConfig: JSON.parse(updatedTemplate.template_config || '{}'),
        fieldMappings: JSON.parse(updatedTemplate.field_mappings || '[]'),
        requiredFields: JSON.parse(updatedTemplate.required_fields || '[]'),
        validationRules: JSON.parse(updatedTemplate.validation_rules || '{}'),
        isActive: updatedTemplate.is_active,
        createdAt: updatedTemplate.created_at,
        updatedAt: updatedTemplate.updated_at
      },
      message: 'Шаблон загрузки успешно обновлен'
    });

  } catch (error) {
    logger.error('Import template update error', 'admin/import-templates/[id]', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return NextResponse.json(
      { error: 'Ошибка при обновлении шаблона загрузки' },
      { status: 500 }
    );
  }
}

// ===================== Удаление шаблона загрузки =====================

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const templateId = params.id;

    if (!templateId) {
      return NextResponse.json(
        { error: 'Не указан ID шаблона' },
        { status: 400 }
      );
    }

    // Проверяем существование шаблона
    const existingTemplate = await prisma.importTemplate.findUnique({
      where: { id: templateId },
      include: {
        import_history: true
      }
    });

    if (!existingTemplate) {
      return NextResponse.json(
        { error: 'Шаблон загрузки не найден' },
        { status: 404 }
      );
    }

    // Проверяем, есть ли история импорта
    if (existingTemplate.import_history.length > 0) {
      return NextResponse.json(
        { error: 'Нельзя удалить шаблон, который имеет историю импорта' },
        { status: 400 }
      );
    }

    // Удаляем шаблон
    await prisma.importTemplate.delete({
      where: { id: templateId }
    });

    return NextResponse.json({
      success: true,
      message: 'Шаблон загрузки успешно удален'
    });

  } catch (error) {
    logger.error('Import template deletion error', 'admin/import-templates/[id]', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return NextResponse.json(
      { error: 'Ошибка при удалении шаблона загрузки' },
      { status: 500 }
    );
  }
}




