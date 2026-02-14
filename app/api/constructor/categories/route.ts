import { NextRequest, NextResponse } from 'next/server';
import { catalogService } from '@/lib/services/catalog.service';
import { logger } from '@/lib/logging/logger';

interface CategoryNode {
  id: string;
  name: string;
  parent_id?: string | null;
  products_count?: number;
  image_url?: string | null;
  description?: string | null;
  is_active?: boolean;
  sort_order?: number;
  subcategories?: CategoryNode[];
}

interface FlatCategory {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  productCount: number;
  imageUrl: string | null;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
}

// GET /api/constructor/categories - Получить плоский список категорий для конструктора
export async function GET(request: NextRequest) {
  try {
    const treeResult = await catalogService.getCatalogTree();
    
    // Функция для преобразования дерева в плоский список с правильной иерархией
    const flattenCategories = (categories: CategoryNode[], level = 0): FlatCategory[] => {
      const result: FlatCategory[] = [];
      
      categories.forEach((category: CategoryNode) => {
        // Добавляем текущую категорию
        result.push({
          id: category.id,
          name: category.name,
          parentId: category.parent_id || null,
          level: level,
          productCount: category.products_count || 0,
          imageUrl: category.image_url || null,
          description: category.description || null,
          isActive: category.is_active ?? false,
          sortOrder: category.sort_order || 0
        });
        
        // Добавляем подкатегории рекурсивно
        if (category.subcategories && category.subcategories.length > 0) {
          result.push(...flattenCategories(category.subcategories, level + 1));
        }
      });
      
      return result;
    };
    
    const flatCategories = flattenCategories(treeResult.categories);
    
    // Явно устанавливаем кодировку UTF-8 для ответа
    const response = NextResponse.json(flatCategories);
    response.headers.set('Content-Type', 'application/json; charset=utf-8');
    
    return response;
  } catch (error) {
    logger.error('Error fetching constructor categories', 'constructor/categories', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return NextResponse.json(
      { error: 'Failed to fetch constructor categories' },
      { status: 500 }
    );
  }
}
