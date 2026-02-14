import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import * as XLSX from 'xlsx';

interface ImportRow {
  id?: string;
  ID?: string;
  name?: string;
  Name?: string;
  название?: string;
  parent_id?: string;
  parentId?: string;
  parent_ID?: string;
  level?: string | number;
  Level?: string | number;
  уровень?: string | number;
  description?: string;
  Description?: string;
  описание?: string;
  slug?: string;
  Slug?: string;
  isActive?: boolean;
  active?: boolean;
  sortOrder?: string | number;
  sort_order?: string | number;
  порядок?: string | number;
  [key: string]: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    if (!Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { error: 'No data found in file' },
        { status: 400 }
      );
    }

    // Ожидаем структуру: id, name, parent_id, level
    const categories = (data as ImportRow[]).map((row) => ({
      id: String(row.id || row.ID || ''),
      name: String(row.name || row.Name || row.название || ''),
      parentId: row.parent_id ?? row.parentId ?? row.parent_ID ?? null,
      level: parseInt(String(row.level ?? row.Level ?? row.уровень ?? '1'), 10),
      slug: String(row.slug || row.Slug || ''),
      isActive: row.isActive !== false && row.active !== false,
      sortOrder: parseInt(String(row.sortOrder ?? row.sort_order ?? row.порядок ?? '0'), 10)
    })).filter(cat => cat.id && cat.name);

    // Создаем категории каталога
    const createdCategories = [];
    
    for (const category of categories) {
      try {
        const created = await prisma.catalogCategory.create({
          data: {
            id: category.id,
            name: category.name,
            parent_id: category.parentId,
            level: category.level,
            path: category.slug || category.name.toLowerCase().replace(/\s+/g, '-'),
            is_active: category.isActive,
            sort_order: category.sortOrder
          }
        });
        
        createdCategories.push(created);
      } catch (error) {
        logger.error(`Error creating category`, 'admin/catalog/import', { categoryId: category.id, error: error instanceof Error ? error.message : String(error) });
        // Продолжаем с другими категориями
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully imported ${createdCategories.length} categories`,
      categories: createdCategories,
      total: categories.length,
      imported: createdCategories.length
    });

  } catch (error) {
    logger.error('Error importing catalog', 'admin/catalog/import', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return NextResponse.json(
      { error: 'Failed to import catalog' },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const categories = await prisma.catalogCategory.findMany({
      orderBy: [
        { level: 'asc' },
        { sort_order: 'asc' },
        { name: 'asc' }
      ],
      include: {
        subcategories: {
          orderBy: { sort_order: 'asc' }
        },
        _count: {
          select: {
            products: true,
            subcategories: true
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      categories
    });

  } catch (error) {
    logger.error('Error fetching catalog', 'admin/catalog/import', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return NextResponse.json(
      { error: 'Failed to fetch catalog' },
      { status: 500 }
    );
  }
}

