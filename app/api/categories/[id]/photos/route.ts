import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logging/logger';

interface Photo {
  id: string;
  url: string;
  alt: string;
  category_id: string;
}

// Mock данные для фото
const mockPhotos: Record<string, Photo[]> = {
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
    const photos = mockPhotos[categoryId] || [];

    return NextResponse.json({ photos });
  } catch (error) {
    logger.error('Error fetching photos', 'categories/[id]/photos', error instanceof Error ? { error: error.message, stack: error.stack, categoryId: params.id } : { error: String(error), categoryId: params.id });
    return NextResponse.json({ error: 'Ошибка сервера' }, { status: 500 });
  }
}
