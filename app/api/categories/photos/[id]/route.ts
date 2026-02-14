import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logging/logger';

interface Photo {
  id: string;
  url: string;
  alt: string;
  category_id: string;
}

// Mock данные для фото
let mockPhotos: Record<string, Photo[]> = {
  'doors': [
    {
      id: '1',
      url: '/assets/doors/door_base_1.jpg',
      alt: 'Дверь PO Base 1/1',
      category_id: 'doors'
    }
  ]
};

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const photoId = params.id;

    logger.debug('Deleting photo', 'categories/photos/[id]', { photoId });

    // В реальном приложении здесь будет:
    // 1. Удаление файла с сервера
    // 2. Удаление записи из базы данных

    // Mock удаление
    for (const categoryId in mockPhotos) {
      mockPhotos[categoryId] = mockPhotos[categoryId].filter(photo => photo.id !== photoId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('Error deleting photo', 'categories/photos/[id]', error instanceof Error ? { error: error.message, stack: error.stack, photoId: params.id } : { error: String(error), photoId: params.id });
    return NextResponse.json({ error: 'Ошибка при удалении фото' }, { status: 500 });
  }
}
