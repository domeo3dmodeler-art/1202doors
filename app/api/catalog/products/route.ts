import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { validateAndFixData } from '@/lib/encoding-utils';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ConflictError, ValidationError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// GET /api/catalog/products - Получить все товары
async function getHandler(
  request: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  
  try {
    // Проверяем подключение к БД
    await prisma.$connect();
    
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get('categoryId') || searchParams.get('category');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: Record<string, unknown> = {};
    
    if (categoryId) {
      where.catalog_category_id = categoryId;
    }
    
    if (search) {
      // SQLite не поддерживает mode: 'insensitive', используем обычный contains
      where.OR = [
        { name: { contains: search } },
        { sku: { contains: search } },
        { description: { contains: search } }
      ];
    }

    const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: {
        id: true,
        sku: true,
        name: true,
        description: true,
        base_price: true,
        stock_quantity: true,
        brand: true,
        model: true,
        dimensions: true,
        tags: true,
        properties_data: true,
        catalog_category_id: true,
        created_at: true,
        updated_at: true,
        catalog_category: {
          select: {
            id: true,
            name: true,
            level: true,
            path: true
          }
        },
        images: {
          select: {
            id: true,
            url: true,
            alt_text: true,
            is_primary: true,
            sort_order: true
          },
          orderBy: {
            sort_order: 'asc'
          }
        }
      },
      orderBy: {
        name: 'asc'
      },
      take: limit,
      skip: offset
    }),
    prisma.product.count({ where })
  ]);

  // Парсим JSON поля для каждого товара с исправлением кодировки
  const processedProducts = products.map(product => {
    let propertiesData: Record<string, unknown> = {};
    let specifications: Record<string, unknown> = {};
    
    if (product.properties_data) {
      const parsed = typeof product.properties_data === 'string' ? JSON.parse(product.properties_data) : product.properties_data;
      // Исправляем кодировку в свойствах товара
      propertiesData = validateAndFixData(parsed) as Record<string, unknown>;
      
      specifications = propertiesData;
    }
    
    const dimensions = 'dimensions' in product && product.dimensions ? (typeof product.dimensions === 'string' ? JSON.parse(product.dimensions) : product.dimensions) : {};
    const tags = 'tags' in product && product.tags ? (typeof product.tags === 'string' ? JSON.parse(product.tags) : product.tags) : [];
    return {
      ...product,
      specifications,
      properties_data: propertiesData,
      dimensions,
      tags,
      images: product.images || []
    };
  });

    return apiSuccess({
      products: processedProducts,
      total,
      limit,
      offset
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorCode = error && typeof error === 'object' && 'code' in error ? String(error.code) : undefined;
    
    logger.error('Error fetching products', 'catalog/products/GET', { 
      error: errorMessage,
      code: errorCode,
      stack: error instanceof Error ? error.stack : undefined
    }, loggingContext);
    
    // В development возвращаем детали ошибки
    if (process.env.NODE_ENV === 'development') {
      return apiError(
        ApiErrorCode.INTERNAL_SERVER_ERROR,
        'Ошибка при получении товаров',
        500,
        {
          message: errorMessage,
          code: errorCode,
          stack: error instanceof Error ? error.stack : undefined,
          prismaMeta: error && typeof error === 'object' && 'meta' in error ? error.meta : undefined,
        }
      );
    }
    
    throw error;
  }
}

export const GET = withErrorHandling(
  requireAuth(getHandler),
  'catalog/products/GET'
);

// POST /api/catalog/products - Создать новый товар
async function postHandler(
  request: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const body = await request.json();
  const { 
    catalog_category_id, 
    sku, 
    name, 
    description, 
    brand, 
    model, 
    series, 
    price, 
    properties_data 
  } = body;

  if (!catalog_category_id || !sku || !name || !price) {
    throw new ValidationError('Не указаны обязательные поля: catalog_category_id, sku, name, price');
  }

  // Проверяем уникальность SKU
  const existingProduct = await prisma.product.findUnique({
    where: { sku }
  });

  if (existingProduct) {
    throw new ConflictError('Товар с таким SKU уже существует');
  }

  const product = await prisma.product.create({
    data: {
      catalog_category_id,
      sku,
      name,
      description,
      brand,
      model,
      series,
      base_price: parseFloat(price),
      properties_data: properties_data ? JSON.stringify(properties_data) : '{}'
    },
    include: {
      catalog_category: {
        select: {
          id: true,
          name: true,
          level: true,
          path: true
        }
      }
    }
  });

  return apiSuccess({ product }, 'Товар создан', 201);
}

export const POST = withErrorHandling(
  requireAuth(postHandler),
  'catalog/products/POST'
);