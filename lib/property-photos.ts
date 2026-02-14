import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';

export interface PropertyPhotoInfo {
  id: string;
  categoryId: string;
  propertyName: string;
  propertyValue: string;
  photoPath: string;
  photoType: string;
  originalFilename?: string;
  fileSize?: number;
  mimeType?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PhotoStructure {
  cover: string | null;
  gallery: string[];
}

/**
 * Получает фото для конкретного значения свойства
 */
export async function getPropertyPhotos(
  categoryId: string,
  propertyName: string,
  propertyValue: string
): Promise<PropertyPhotoInfo[]> {
  try {
    const photos = await prisma.propertyPhoto.findMany({
      where: {
        categoryId,
        propertyName
      },
      orderBy: {
        photoType: 'asc'
      }
    });

    // Применяем то же преобразование, что и при импорте:
    // Убираем последнюю цифру после буквы и добавляем подчеркивание
    const normalizeModelName = (name: string) => {
      return name.toLowerCase();
    };

    const normalizedValue = normalizeModelName(propertyValue);

    // Фильтруем по нормализованному значению (без учета регистра)
    const filteredPhotos = photos.filter(photo => {
      const photoValue = normalizeModelName(photo.propertyValue);
      return photoValue === normalizedValue;
    });

    return filteredPhotos;
  } catch (error) {
    logger.error('Ошибка получения фото свойства', 'lib/property-photos', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return [];
  }
}

/** Ключ свойства для фото/цветов из листа "Цвет" (формат propertyValue: "Название модели|Тип покрытия|Цвет/отделка") */
export const DOOR_COLOR_PROPERTY = 'Domeo_Модель_Цвет';

/**
 * Свойство для обложек моделей дверей по коду модели (актуальное).
 * Устаревший вариант — «Артикул поставщика» (хранил тот же код в propertyValue).
 */
export const DOOR_MODEL_CODE_PROPERTY = 'Код модели Domeo (Web)';

/**
 * Получает фото по префиксу значения свойства (для списка цветов/покрытий по модели)
 */
export async function getPropertyPhotosByValuePrefix(
  categoryId: string,
  propertyName: string,
  valuePrefix: string
): Promise<PropertyPhotoInfo[]> {
  try {
    const photos = await prisma.propertyPhoto.findMany({
      where: {
        categoryId,
        propertyName,
        propertyValue: { startsWith: valuePrefix }
      },
      orderBy: [{ propertyValue: 'asc' }, { photoType: 'asc' }]
    });
    return photos;
  } catch (error) {
    logger.error('Ошибка getPropertyPhotosByValuePrefix', 'lib/property-photos', error instanceof Error ? { error: error.message } : { error: String(error) });
    return [];
  }
}

/**
 * Структурирует фото в обложку и галерею
 */
export function structurePropertyPhotos(photos: PropertyPhotoInfo[]): PhotoStructure {
  if (photos.length === 0) {
    return {
      cover: null,
      gallery: []
    };
  }

  // Сначала ищем фото с явным типом "cover"
  const coverPhoto = photos.find(photo => photo.photoType === 'cover');
  
  // Сортируем фото галереи по номеру (gallery_1, gallery_2, ...)
  const galleryPhotos = photos
    .filter(photo => photo.photoType.startsWith('gallery_'))
    .sort((a, b) => {
      // Извлекаем номер из photoType: "gallery_1" -> 1, "gallery_2" -> 2
      const numA = parseInt(a.photoType.replace('gallery_', '')) || 0;
      const numB = parseInt(b.photoType.replace('gallery_', '')) || 0;
      return numA - numB;
    });
  
  if (coverPhoto) {
    // Если есть явная обложка, остальные фото - галерея
    const gallery = galleryPhotos.map(photo => photo.photoPath);
    
    return {
      cover: coverPhoto.photoPath,
      gallery
    };
  }
  
  // Если нет явной обложки, но есть фото галереи - первое фото галереи становится обложкой
  if (galleryPhotos.length > 0) {
    const cover = galleryPhotos[0].photoPath;
    const gallery = galleryPhotos.slice(1).map(photo => photo.photoPath);
    
    return {
      cover,
      gallery
    };
  }
  
  // Если остались фото без типа (legacy), используем старую логику
  const otherPhotos = photos.filter(photo => 
    photo.photoType !== 'cover' && !photo.photoType.startsWith('gallery_')
  );
  
  if (otherPhotos.length > 0) {
    // Сортируем по длине имени файла (короткое = обложка)
    const sortedPhotos = [...otherPhotos].sort((a, b) => {
      const filenameA = a.photoPath.split('/').pop() || '';
      const filenameB = b.photoPath.split('/').pop() || '';
      
    if (filenameA.length !== filenameB.length) {
      return filenameA.length - filenameB.length;
    }
    
    return filenameA.localeCompare(filenameB);
  });

  const cover = sortedPhotos.length > 0 ? sortedPhotos[0].photoPath : null;
  const gallery = sortedPhotos.length > 1 
    ? sortedPhotos.slice(1).map(photo => photo.photoPath) 
    : [];

  return {
    cover,
    gallery
    };
  }

  // Если ничего не найдено
  return {
    cover: null,
    gallery: []
  };
}

/**
 * Добавляет или обновляет фото для свойства
 */
export async function upsertPropertyPhoto(
  categoryId: string,
  propertyName: string,
  propertyValue: string,
  photoPath: string,
  photoType: string = 'cover',
  metadata?: {
    originalFilename?: string;
    fileSize?: number;
    mimeType?: string;
  }
): Promise<PropertyPhotoInfo | null> {
  try {
    const photo = await prisma.propertyPhoto.upsert({
      where: {
        categoryId_propertyName_propertyValue_photoType: {
          categoryId,
          propertyName,
          propertyValue,
          photoType
        }
      },
      update: {
        photoPath,
        originalFilename: metadata?.originalFilename,
        fileSize: metadata?.fileSize,
        mimeType: metadata?.mimeType,
        updatedAt: new Date()
      },
      create: {
        categoryId,
        propertyName,
        propertyValue,
        photoPath,
        photoType,
        originalFilename: metadata?.originalFilename,
        fileSize: metadata?.fileSize,
        mimeType: metadata?.mimeType
      }
    });

    return photo;
  } catch (error) {
    logger.error('Ошибка добавления фото свойства', 'lib/property-photos', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return null;
  }
}

/**
 * Удаляет фото для свойства
 */
export async function deletePropertyPhotos(
  categoryId: string,
  propertyName: string,
  propertyValue: string,
  photoType?: string
): Promise<number> {
  try {
    const where: any = {
      categoryId,
      propertyName,
      propertyValue
    };

    if (photoType) {
      where.photoType = photoType;
    }

    const result = await prisma.propertyPhoto.deleteMany({
      where
    });

    return result.count;
  } catch (error) {
    logger.error('Ошибка удаления фото свойства', 'lib/property-photos', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return 0;
  }
}

/**
 * Все фото по свойству (например Domeo_Модель_Цвет), сгруппированные по (тип покрытия, цвет).
 * propertyValue в БД: "Название модели|Тип покрытия|Цвет/отделка".
 * Возвращает: по каждому coatingType — массив { colorName, photos }.
 * Нужно для конфигуратора, когда названия моделей в листе "Цвет" не совпадают с "Цены базовые".
 */
export async function getPropertyPhotosGroupedByCoatingAndColor(
  categoryId: string,
  propertyName: string
): Promise<Map<string, Array<{ colorName: string; photos: PropertyPhotoInfo[] }>>> {
  try {
    const photos = await prisma.propertyPhoto.findMany({
      where: {
        categoryId,
        propertyName
      },
      orderBy: [{ propertyValue: 'asc' }, { photoType: 'asc' }]
    });

    const byCoating = new Map<string, Map<string, PropertyPhotoInfo[]>>();
    for (const p of photos) {
      const parts = p.propertyValue.split('|');
      const coatingType = (parts[1] ?? '').trim();
      const colorName = (parts[2] ?? '').trim();
      if (!coatingType && !colorName) continue;
      if (!byCoating.has(coatingType)) byCoating.set(coatingType, new Map());
      const byColor = byCoating.get(coatingType)!;
      if (!byColor.has(colorName)) byColor.set(colorName, []);
      byColor.get(colorName)!.push(p);
    }

    const result = new Map<string, Array<{ colorName: string; photos: PropertyPhotoInfo[] }>>();
    byCoating.forEach((byColor, coatingType) => {
      const list = Array.from(byColor.entries()).map(([colorName, photos]) => ({ colorName, photos }));
      result.set(coatingType, list);
    });
    return result;
  } catch (error) {
    logger.error('Ошибка getPropertyPhotosGroupedByCoatingAndColor', 'lib/property-photos', error instanceof Error ? { error: error.message } : { error: String(error) });
    return new Map();
  }
}

/**
 * Получает все уникальные значения свойства с фото
 */
export async function getPropertyValuesWithPhotos(
  categoryId: string,
  propertyName: string
): Promise<string[]> {
  try {
    const photos = await prisma.propertyPhoto.findMany({
      where: {
        categoryId,
        propertyName
      },
      select: {
        propertyValue: true
      },
      distinct: ['propertyValue']
    });

    return photos.map(photo => photo.propertyValue);
  } catch (error) {
    logger.error('Ошибка получения значений свойства с фото', 'lib/property-photos', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return [];
  }
}

/**
 * Получает статистику фото для категории
 */
export async function getCategoryPhotosStats(categoryId: string) {
  try {
    const stats = await prisma.propertyPhoto.groupBy({
      by: ['propertyName'],
      where: {
        categoryId
      },
      _count: {
        id: true
      }
    });

    const totalPhotos = await prisma.propertyPhoto.count({
      where: {
        categoryId
      }
    });

    return {
      totalPhotos,
      byProperty: stats.map(stat => ({
        propertyName: stat.propertyName,
        count: stat._count.id
      }))
    };
  } catch (error) {
    logger.error('Ошибка получения статистики фото', 'lib/property-photos', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return {
      totalPhotos: 0,
      byProperty: []
    };
  }
}
