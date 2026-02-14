import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma } from '../../../../lib/prisma';
import { logger } from '../../../../lib/logging/logger';

// GET /api/catalog/properties - Получить все свойства
export async function GET(request: NextRequest) {
  let categoryId: string | null = null;
  try {
    const { searchParams } = new URL(request.url);
    categoryId = searchParams.get('categoryId');
    const showAll = searchParams.get('showAll') === 'true';

    // Формируем условия для фильтрации
    const whereCondition: Prisma.ProductPropertyWhereInput = {};
    
    if (!showAll) {
      // По умолчанию показываем только активные свойства
      whereCondition.is_active = true;
    }

    // Если указана категория, фильтруем по ней
    if (categoryId) {
      whereCondition.category_assignments = {
        some: {
          catalog_category_id: categoryId
        }
      };
    }

    const properties = await prisma.productProperty.findMany({
      where: whereCondition,
      include: {
        category_assignments: {
          include: {
            catalog_category: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    const formattedProperties = properties.map(property => ({
      id: property.id,
      name: property.name,
      type: property.type,
      description: property.description,
      options: property.options ? JSON.parse(property.options) : null,
      is_required: property.is_required,
      is_active: property.is_active,
      created_at: property.created_at,
      updated_at: property.updated_at,
      categories: property.category_assignments.map(assignment => ({
        id: assignment.catalog_category_id,
        name: assignment.catalog_category.name,
        is_required: assignment.is_required,
        is_for_calculator: assignment.is_for_calculator,
        is_for_export: assignment.is_for_export
      }))
    }));

    return NextResponse.json({
      success: true,
      properties: formattedProperties,
      filters: {
        categoryId: categoryId || null,
        showAll: showAll,
        totalCount: formattedProperties.length,
        activeCount: formattedProperties.filter(p => p.is_active).length
      }
    }, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8'
      }
    });

  } catch (error) {
    logger.error('Error fetching properties', 'catalog/properties', error instanceof Error ? { error: error.message, stack: error.stack, categoryId: categoryId ?? undefined } : { error: String(error), categoryId: categoryId ?? undefined });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/catalog/properties - Создать новое свойство
export async function POST(request: NextRequest) {
  try {
    const { name, type, description, options, is_required, is_active } = await request.json();

    // Валидация
    if (!name || !type) {
      return NextResponse.json(
        { error: 'Name and type are required' },
        { status: 400 }
      );
    }

    const validTypes = ['text', 'number', 'select', 'boolean', 'date', 'file'];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: 'Invalid property type' },
        { status: 400 }
      );
    }

    // Для select полей нужны опции
    if (type === 'select' && (!options || options.length === 0)) {
      return NextResponse.json(
        { error: 'Options are required for select type' },
        { status: 400 }
      );
    }

    // Проверяем, не существует ли уже свойство с таким именем
    const existingProperty = await prisma.productProperty.findUnique({
      where: { name }
    });

    if (existingProperty) {
      return NextResponse.json(
        { error: 'Property with this name already exists' },
        { status: 400 }
      );
    }

    // Создаем свойство
    const property = await prisma.productProperty.create({
      data: {
        name,
        type,
        description: description || null,
        options: options ? JSON.stringify(options) : null,
        is_required: is_required || false,
        is_active: is_active !== undefined ? is_active : true
      }
    });

    return NextResponse.json({
      success: true,
      property: {
        id: property.id,
        name: property.name,
        type: property.type,
        description: property.description,
        options: property.options ? JSON.parse(property.options) : null,
        is_required: property.is_required,
        is_active: property.is_active,
        created_at: property.created_at,
        updated_at: property.updated_at
      }
    });

  } catch (error) {
    logger.error('Error creating property', 'catalog/properties', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}