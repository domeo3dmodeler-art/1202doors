/**
 * Утилиты для работы с фото моделей
 * Система привязки фото к свойству "Название модели"
 */

export interface ModelPhoto {
  id: string;
  modelName: string; // "Название модели"
  photoPath: string;
  isCover: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModelPhotosStructure {
  [modelName: string]: {
    cover: string | null;
    gallery: string[];
    allPhotos: string[];
  };
}

/**
 * Структурирует фото модели из массива путей
 * Новая логика: если есть фото с суффиксами _N, то это галерея
 * Иначе - все фото считаются уникальными и показываются как галерея
 */
export function structureModelPhotos(photos: string[]): ModelPhotosStructure[string] {
  if (photos.length === 0) {
    return { cover: null, gallery: [], allPhotos: [] };
  }

  // Убираем дубликаты по полному пути
  const uniquePhotos = [...new Set(photos)];

  // Проверяем, есть ли фото с суффиксами _N (галерея)
  const hasGalleryPhotos = uniquePhotos.some(photo => {
    const fileName = photo.split('/').pop() || photo;
    const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
    const parts = nameWithoutExt.split('_');
    const lastPart = parts[parts.length - 1];
    return /^\d+$/.test(lastPart); // Последняя часть - это число
  });

  if (hasGalleryPhotos) {
    // Есть фото с суффиксами _N - используем старую логику
    const galleryBaseNames = new Set();
    uniquePhotos.forEach(photo => {
      const fileName = photo.split('/').pop() || photo;
      const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
      const parts = nameWithoutExt.split('_');
      const lastPart = parts[parts.length - 1];
      
      if (/^\d+$/.test(lastPart)) {
        const baseName = parts[parts.length - 2];
        galleryBaseNames.add(baseName);
      }
    });

    const coverPhotos = uniquePhotos.filter(photo => {
      const fileName = photo.split('/').pop() || photo;
      const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
      const parts = nameWithoutExt.split('_');
      const lastPart = parts[parts.length - 1];
      
      if (/^\d+$/.test(lastPart)) {
        return false;
      }
      
      const baseName = parts[parts.length - 1];
      return !galleryBaseNames.has(baseName);
    });

    const galleryPhotos = uniquePhotos.filter(photo => {
      const fileName = photo.split('/').pop() || photo;
      const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
      const parts = nameWithoutExt.split('_');
      const lastPart = parts[parts.length - 1];
      
      if (/^\d+$/.test(lastPart)) {
        return true;
      }
      
      const baseName = parts[parts.length - 1];
      return galleryBaseNames.has(baseName);
    });

    return {
      cover: galleryPhotos[0] || null,
      gallery: galleryPhotos.slice(1),
      allPhotos: uniquePhotos
    };
  }

  // НОВАЯ ЛОГИКА: Если нет фото с суффиксами _N, все фото считаются уникальными
  // Показываем их как галерею (первое фото - обложка, остальные - галерея)
  return {
    cover: uniquePhotos[0] || null,
    gallery: uniquePhotos.slice(1),
    allPhotos: uniquePhotos
  };
}

/**
 * Получает фото модели по имени модели
 * @param modelName Имя модели
 * @param allProducts Все товары
 * @param photoProperty Свойство для хранения фото (по умолчанию 'photos')
 */
export function getModelPhotos(modelName: string, allProducts: any[], photoProperty: string = 'photos'): ModelPhotosStructure[string] {
  // Находим все товары с данной моделью
  const modelProducts = allProducts.filter(product => {
    try {
      const properties = JSON.parse(product.properties_data || '{}');
      return properties['Название модели'] === modelName;
    } catch {
      return false;
    }
  });

  if (modelProducts.length === 0) {
    return { cover: null, gallery: [], allPhotos: [] };
  }

  // Собираем все фото со всех товаров модели из указанного свойства
  const allPhotos: string[] = [];
  modelProducts.forEach(product => {
    try {
      const properties = JSON.parse(product.properties_data || '{}');
      if (properties[photoProperty] && Array.isArray(properties[photoProperty])) {
        allPhotos.push(...properties[photoProperty]);
      }
    } catch {
      // Игнорируем ошибки парсинга
    }
  });

  return structureModelPhotos(allPhotos);
}

/**
 * Проверяет, есть ли у модели галерея фото
 */
export function hasModelGallery(modelPhotos: ModelPhotosStructure[string]): boolean {
  return modelPhotos.gallery.length > 0;
}

/**
 * Получает обложку модели
 */
export function getModelCover(modelPhotos: ModelPhotosStructure[string]): string | null {
  return modelPhotos.cover;
}

/**
 * Получает все фото модели
 */
export function getAllModelPhotos(modelPhotos: ModelPhotosStructure[string]): string[] {
  return modelPhotos.allPhotos;
}
