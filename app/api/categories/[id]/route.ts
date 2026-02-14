import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logging/logger';

// Mock данные для демонстрации
const mockCategories = {
  'doors': {
    id: 'doors',
    name: 'Двери',
    description: 'Межкомнатные и входные двери',
    icon: '🚪',
    properties: [
      { key: 'material', name: 'Материал', type: 'select', required: true },
      { key: 'color', name: 'Цвет', type: 'select', required: true },
      { key: 'size', name: 'Размер', type: 'text', required: true },
      { key: 'price', name: 'Цена', type: 'number', required: true }
    ],
    import_mapping: {
      'Material': 'material',
      'Color': 'color',
      'Size': 'size',
      'Price': 'price'
    },
    is_main: true,
    parent_id: null,
    subcategories: [
      {
        id: 'door-handles',
        name: 'Ручки',
        description: 'Ручки для дверей',
        icon: '🔘',
        properties: [],
        import_mapping: {},
        is_main: false,
        parent_id: 'doors'
      },
      {
        id: 'door-kits',
        name: 'Комплекты фурнитуры',
        description: 'Комплекты фурнитуры для дверей',
        icon: '🔧',
        properties: [],
        import_mapping: {},
        is_main: false,
        parent_id: 'doors'
      }
    ]
  }
};

const mockPhotos = {
  'doors': [
    {
      id: '1',
      url: '/assets/doors/door_base_1.jpg',
      alt: 'Дверь PO Base 1/1',
      category_id: 'doors'
    }
  ]
};

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const categoryId = params.id;
    const category = mockCategories[categoryId as keyof typeof mockCategories];

    if (!category) {
      return NextResponse.json({ error: 'Категория не найдена' }, { status: 404 });
    }

    return NextResponse.json(category);
  } catch (error) {
    logger.error('Error fetching category', 'categories/[id]', error instanceof Error ? { error: error.message, stack: error.stack, id: params.id } : { error: String(error), id: params.id });
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const categoryId = params.id;
  try {
    const data = await request.json();

    // В реальном приложении здесь будет обновление в базе данных
    logger.debug('Updating category', 'categories/[id]', { categoryId: params.id, hasData: !!data });

    // Обновляем mock данные
    if (mockCategories[categoryId as keyof typeof mockCategories]) {
      mockCategories[categoryId as keyof typeof mockCategories] = {
        ...mockCategories[categoryId as keyof typeof mockCategories],
        ...data
      };
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error updating category', 'categories/[id]', error instanceof Error ? { error: error.message, stack: error.stack, id: categoryId } : { error: String(error), id: categoryId });
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
