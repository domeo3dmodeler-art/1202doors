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

export async function POST(request: NextRequest) {
  let categoryId: string | undefined;
  try {
    const formData = await request.formData();
    const raw = formData.get('categoryId');
    categoryId = typeof raw === 'string' ? raw : undefined;
    if (!categoryId) {
      return NextResponse.json({ error: 'categoryId is required' }, { status: 400 });
    }
    const catId: string = categoryId;
    const folderUrl = formData.get('folderUrl') as string;
    const photos = formData.getAll('photos') as File[];

    logger.info('Uploading photos for category', 'categories/photos/upload', { categoryId, folderUrl, photosCount: photos.length });

    // В реальном приложении здесь будет:
    // 1. Сохранение файлов на сервер или в облачное хранилище
    // 2. Обработка ссылки на папку (скачивание всех фото из папки)
    // 3. Сохранение метаданных в базу данных

    // Mock обработка
    const newPhotos: Photo[] = [];

    // Обработка загруженных файлов
    photos.forEach((photo, index) => {
      const photoId = `photo_${Date.now()}_${index}`;
      newPhotos.push({
        id: photoId,
        url: `/uploads/${catId}/${photo.name}`,
        alt: photo.name,
        category_id: catId
      });
    });

    // Обработка ссылки на папку
    if (folderUrl) {
      // В реальном приложении здесь будет скачивание всех фото из папки
      const folderPhotoId = `folder_${Date.now()}`;
      newPhotos.push({
        id: folderPhotoId,
        url: folderUrl,
        alt: 'Фото из папки',
        category_id: catId
      });
    }

    // Добавляем новые фото к существующим
    if (!mockPhotos[catId]) {
      mockPhotos[catId] = [];
    }
    mockPhotos[catId].push(...newPhotos);

    return NextResponse.json({ 
      success: true, 
      message: `Загружено ${newPhotos.length} фото`,
      photos: newPhotos
    });
  } catch (error) {
    logger.error('Error uploading photos', 'categories/photos/upload', error instanceof Error ? { error: error.message, stack: error.stack, categoryId: categoryId ?? undefined } : { error: String(error), categoryId: categoryId ?? undefined });
    return NextResponse.json({ error: 'Ошибка при загрузке фото' }, { status: 500 });
  }
}
