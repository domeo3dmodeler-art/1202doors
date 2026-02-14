import { NextRequest, NextResponse } from 'next/server';
import { catalogService } from '@/lib/services/catalog.service';
import { CreatePropertyAssignmentDto } from '@/lib/types/catalog';
import { logger } from '@/lib/logging/logger';

// POST /api/catalog/assignments - Назначить свойство категории
export async function POST(request: NextRequest) {
  let data: CreatePropertyAssignmentDto | null = null;
  try {
    data = await request.json() as CreatePropertyAssignmentDto;

    // Валидация
    if (!data.catalog_category_id) {
      return NextResponse.json(
        { error: 'Catalog category ID is required' },
        { status: 400 }
      );
    }

    if (!data.product_property_id) {
      return NextResponse.json(
        { error: 'Product property ID is required' },
        { status: 400 }
      );
    }

    const assignment = await catalogService.assignPropertyToCategory(data!);
    return NextResponse.json(assignment, { status: 201 });
  } catch (error) {
    logger.error('Error creating property assignment', 'catalog/assignments', error instanceof Error ? { error: error.message, stack: error.stack, catalogCategoryId: data?.catalog_category_id, productPropertyId: data?.product_property_id } : { error: String(error), catalogCategoryId: data?.catalog_category_id, productPropertyId: data?.product_property_id });
    
    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create property assignment' },
      { status: 500 }
    );
  }
}
