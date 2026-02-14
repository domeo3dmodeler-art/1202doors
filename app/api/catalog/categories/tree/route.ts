import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { logger } from '../../../../../lib/logging/logger';
import { apiSuccess, withErrorHandling } from '@/lib/api/response';

async function getHandler(request: NextRequest) {
  try {
    // Получаем все категории
    const categories = await prisma.catalogCategory.findMany({
      where: {
        is_active: true
      },
      orderBy: [
        { level: 'asc' },
        { sort_order: 'asc' },
        { name: 'asc' }
      ]
    });

    // Подсчитываем товары для каждой категории отдельно (более надежно)
    const categoriesWithCounts = await Promise.all(
      categories.map(async (category) => {
        const productsCount = await prisma.product.count({
          where: {
            catalog_category_id: category.id,
            is_active: true
          }
        });

        return {
          id: category.id,
          name: category.name,
          parent_id: category.parent_id,
          level: category.level,
          path: category.path,
          products_count: productsCount
        };
      })
    );

    // Строим дерево
    interface CategoryNode {
      id: string;
      name: string;
      parent_id: string | null;
      level: number;
      path: string;
      products_count: number;
      children: CategoryNode[];
    }

    const categoryMap = new Map<string, CategoryNode>();
    const rootCategories: CategoryNode[] = [];

    // Создаем карту категорий
    categoriesWithCounts.forEach(category => {
      categoryMap.set(category.id, {
        ...category,
        children: []
      });
    });

    // Строим иерархию
    categoriesWithCounts.forEach(category => {
      const categoryNode = categoryMap.get(category.id);
      if (!categoryNode) return;
      
      if (category.parent_id) {
        const parent = categoryMap.get(category.parent_id);
        if (parent) {
          parent.children.push(categoryNode);
        }
      } else {
        rootCategories.push(categoryNode);
      }
    });

    return apiSuccess({
      categories: rootCategories,
      totalCategories: categoriesWithCounts.length,
      totalRootCategories: rootCategories.length
    });

  } catch (error) {
    logger.error('Error fetching category tree', 'catalog/categories/tree', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    throw error;
  }
}

export const GET = withErrorHandling(
  getHandler,
  'catalog/categories/tree/GET'
);
