// Система канонических названий свойств товаров DOMEO
// Единообразные названия для всей платформы

export const CANONICAL_PROPERTIES = {
  // === ОСНОВНЫЕ СВОЙСТВА ===
  SKU: 'sku',
  NAME: 'name',
  DESCRIPTION: 'description',
  BRAND: 'brand',
  MODEL: 'model',
  
  // === ЦЕНЫ И СТОИМОСТЬ ===
  BASE_PRICE: 'base_price',
  RETAIL_PRICE: 'retail_price',
  WHOLESALE_PRICE: 'wholesale_price',
  CURRENCY: 'currency',
  PRICE_GROUP: 'price_group',
  
  // === СКЛАД И НАЛИЧИЕ ===
  STOCK_QUANTITY: 'stock_quantity',
  AVAILABILITY: 'availability',
  SUPPLIER: 'supplier',
  SUPPLIER_SKU: 'supplier_sku',
  
  // === ФИЗИЧЕСКИЕ ХАРАКТЕРИСТИКИ ===
  WIDTH: 'width',
  HEIGHT: 'height',
  THICKNESS: 'thickness',
  WEIGHT: 'weight',
  DEPTH: 'depth',
  
  // === МАТЕРИАЛЫ И ПОКРЫТИЯ ===
  MATERIAL: 'material',
  COATING_TYPE: 'coating_type',
  COATING_COLOR: 'coating_color',
  FINISH: 'finish',
  
  // === СТИЛЬ И ДИЗАЙН ===
  STYLE: 'style',
  COLLECTION: 'collection',
  DESIGN_TYPE: 'design_type',
  
  // === КОНСТРУКЦИЯ ===
  CONSTRUCTION_TYPE: 'construction_type',
  OPENING_TYPE: 'opening_type',
  HANDLE_TYPE: 'handle_type',
  HARDWARE_KIT: 'hardware_kit',
  
  // === ДОПОЛНИТЕЛЬНЫЕ ОПЦИИ ===
  EDGE: 'edge',
  MOLDING: 'molding',
  GLASS: 'glass',
  GLASS_TYPE: 'glass_type',
  
  // === ФОТО И МЕДИА ===
  PHOTOS: 'photos',
  MAIN_PHOTO: 'main_photo',
  THUMBNAIL: 'thumbnail',
  
  // === КАТЕГОРИИ И КЛАССИФИКАЦИЯ ===
  CATEGORY: 'category',
  SUBCATEGORY: 'subcategory',
  TAGS: 'tags',
  
  // === СИСТЕМНЫЕ ПОЛЯ ===
  IS_ACTIVE: 'is_active',
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
  VALID_FROM: 'valid_from',
  VALID_TO: 'valid_to',
  
  // === СПЕЦИФИЧНЫЕ ДЛЯ ДВЕРЕЙ ===
  DOOR_TYPE: 'door_type',
  DOOR_SYSTEM: 'door_system',
  FRAME_TYPE: 'frame_type',
  TRIM_TYPE: 'trim_type',
  EXTENSION_TYPE: 'extension_type',
  
  // === СПЕЦИФИЧНЫЕ ДЛЯ ФУРНИТУРЫ ===
  HARDWARE_TYPE: 'hardware_type',
  HARDWARE_MATERIAL: 'hardware_material',
  HARDWARE_FINISH: 'hardware_finish',
  HARDWARE_FUNCTION: 'hardware_function'
} as const;

// Типы для TypeScript
export type CanonicalPropertyKey = keyof typeof CANONICAL_PROPERTIES;
export type CanonicalPropertyValue = typeof CANONICAL_PROPERTIES[CanonicalPropertyKey];

// Маппинг старых названий на канонические
export const PROPERTY_MAPPING: Record<string, CanonicalPropertyValue> = {
  // SKU варианты
  'Артикул поставщика': CANONICAL_PROPERTIES.SUPPLIER_SKU,
  'Артикул_поставщика': CANONICAL_PROPERTIES.SUPPLIER_SKU,
  'Артикул': CANONICAL_PROPERTIES.SKU,
  'SKU': CANONICAL_PROPERTIES.SKU,
  'sku': CANONICAL_PROPERTIES.SKU,
  'Supplier SKU': CANONICAL_PROPERTIES.SUPPLIER_SKU,
  'Supplier_sku': CANONICAL_PROPERTIES.SUPPLIER_SKU,
  
  // Названия
  'Название модели': CANONICAL_PROPERTIES.MODEL,
  'Модель': CANONICAL_PROPERTIES.MODEL,
  'Наименование': CANONICAL_PROPERTIES.NAME,
  'Название': CANONICAL_PROPERTIES.NAME,
  'Domeo_Название модели для Web': CANONICAL_PROPERTIES.MODEL,
  
  // Стили
  'Domeo_Стиль Web': CANONICAL_PROPERTIES.STYLE,
  'Стиль': CANONICAL_PROPERTIES.STYLE,
  'Style': CANONICAL_PROPERTIES.STYLE,
  
  // Цены
  'Цена': CANONICAL_PROPERTIES.BASE_PRICE,
  'Стоимость': CANONICAL_PROPERTIES.BASE_PRICE,
  'Цена ррц': CANONICAL_PROPERTIES.RETAIL_PRICE,
  'Цена опт': CANONICAL_PROPERTIES.WHOLESALE_PRICE,
  'Цена РРЦ': CANONICAL_PROPERTIES.RETAIL_PRICE,
  
  // Материалы
  'Тип покрытия': CANONICAL_PROPERTIES.COATING_TYPE,
  'Тип покрытия': CANONICAL_PROPERTIES.COATING_TYPE,
  'Покрытие': CANONICAL_PROPERTIES.COATING_TYPE,
  'Domeo_Покрытие Web': CANONICAL_PROPERTIES.COATING_TYPE,
  
  // Цвета (Цвет/Отделка — основной ключ; Domeo_Цвет устарел)
  'Цвет/Отделка': CANONICAL_PROPERTIES.COATING_COLOR,
  'Цвет': CANONICAL_PROPERTIES.COATING_COLOR,
  'Color': CANONICAL_PROPERTIES.COATING_COLOR,
  'Фабрика_Цвет/Отделка': CANONICAL_PROPERTIES.COATING_COLOR,
  
  // Размеры
  'Ширина/мм': CANONICAL_PROPERTIES.WIDTH,
  'Высота/мм': CANONICAL_PROPERTIES.HEIGHT,
  'Толщина/мм': CANONICAL_PROPERTIES.THICKNESS,
  'Ширина': CANONICAL_PROPERTIES.WIDTH,
  'Высота': CANONICAL_PROPERTIES.HEIGHT,
  'Толщина': CANONICAL_PROPERTIES.THICKNESS,
  'Domeo_Ширина Web': CANONICAL_PROPERTIES.WIDTH,
  'Domeo_Высота Web': CANONICAL_PROPERTIES.HEIGHT,
  
  // Категории
  'Категория': CANONICAL_PROPERTIES.CATEGORY,
  'Category': CANONICAL_PROPERTIES.CATEGORY,
  
  // Поставщики
  'Поставщик': CANONICAL_PROPERTIES.SUPPLIER,
  'Supplier': CANONICAL_PROPERTIES.SUPPLIER,
  'Производитель': CANONICAL_PROPERTIES.SUPPLIER,
  
  // Конструкция
  'Тип конструкции': CANONICAL_PROPERTIES.CONSTRUCTION_TYPE,
  'Тип открывания': CANONICAL_PROPERTIES.OPENING_TYPE,
  
  // Дополнительные опции
  'Кромка': CANONICAL_PROPERTIES.EDGE,
  'Молдинг': CANONICAL_PROPERTIES.MOLDING,
  'Стекло': CANONICAL_PROPERTIES.GLASS,
  
  // Коллекции
  'Фабрика_Коллекция': CANONICAL_PROPERTIES.COLLECTION,
  'Коллекция': CANONICAL_PROPERTIES.COLLECTION,
  
  // Фото
  'photos': CANONICAL_PROPERTIES.PHOTOS,
  'Фото': CANONICAL_PROPERTIES.PHOTOS,
  'Изображения': CANONICAL_PROPERTIES.PHOTOS,
  
  // Склад
  'Склад/заказ': CANONICAL_PROPERTIES.AVAILABILITY,
  'Наличие': CANONICAL_PROPERTIES.AVAILABILITY,
  
  // Единицы измерения
  'Ед.изм.': 'unit',
  'Единица измерения': 'unit',
  
  // Валюта
  'Валюта': CANONICAL_PROPERTIES.CURRENCY,
  'Currency': CANONICAL_PROPERTIES.CURRENCY
};

// Обратный маппинг для экспорта (каноническое -> отображаемое название)
export const DISPLAY_NAMES: Record<CanonicalPropertyValue, string> = {
  [CANONICAL_PROPERTIES.SKU]: 'Артикул',
  [CANONICAL_PROPERTIES.NAME]: 'Название',
  [CANONICAL_PROPERTIES.DESCRIPTION]: 'Описание',
  [CANONICAL_PROPERTIES.BRAND]: 'Бренд',
  [CANONICAL_PROPERTIES.MODEL]: 'Модель',
  [CANONICAL_PROPERTIES.BASE_PRICE]: 'Базовая цена',
  [CANONICAL_PROPERTIES.RETAIL_PRICE]: 'Розничная цена',
  [CANONICAL_PROPERTIES.WHOLESALE_PRICE]: 'Оптовая цена',
  [CANONICAL_PROPERTIES.CURRENCY]: 'Валюта',
  [CANONICAL_PROPERTIES.PRICE_GROUP]: 'Ценовая группа',
  [CANONICAL_PROPERTIES.STOCK_QUANTITY]: 'Количество на складе',
  [CANONICAL_PROPERTIES.AVAILABILITY]: 'Наличие',
  [CANONICAL_PROPERTIES.SUPPLIER]: 'Поставщик',
  [CANONICAL_PROPERTIES.SUPPLIER_SKU]: 'Артикул поставщика',
  [CANONICAL_PROPERTIES.WIDTH]: 'Ширина (мм)',
  [CANONICAL_PROPERTIES.HEIGHT]: 'Высота (мм)',
  [CANONICAL_PROPERTIES.THICKNESS]: 'Толщина (мм)',
  [CANONICAL_PROPERTIES.WEIGHT]: 'Вес (кг)',
  [CANONICAL_PROPERTIES.DEPTH]: 'Глубина (мм)',
  [CANONICAL_PROPERTIES.MATERIAL]: 'Материал',
  [CANONICAL_PROPERTIES.COATING_TYPE]: 'Тип покрытия',
  [CANONICAL_PROPERTIES.COATING_COLOR]: 'Цвет покрытия',
  [CANONICAL_PROPERTIES.FINISH]: 'Отделка',
  [CANONICAL_PROPERTIES.STYLE]: 'Стиль',
  [CANONICAL_PROPERTIES.COLLECTION]: 'Коллекция',
  [CANONICAL_PROPERTIES.DESIGN_TYPE]: 'Тип дизайна',
  [CANONICAL_PROPERTIES.CONSTRUCTION_TYPE]: 'Тип конструкции',
  [CANONICAL_PROPERTIES.OPENING_TYPE]: 'Тип открывания',
  [CANONICAL_PROPERTIES.HANDLE_TYPE]: 'Тип ручки',
  [CANONICAL_PROPERTIES.HARDWARE_KIT]: 'Комплект фурнитуры',
  [CANONICAL_PROPERTIES.EDGE]: 'Кромка',
  [CANONICAL_PROPERTIES.MOLDING]: 'Молдинг',
  [CANONICAL_PROPERTIES.GLASS]: 'Стекло',
  [CANONICAL_PROPERTIES.GLASS_TYPE]: 'Тип стекла',
  [CANONICAL_PROPERTIES.PHOTOS]: 'Фотографии',
  [CANONICAL_PROPERTIES.MAIN_PHOTO]: 'Основное фото',
  [CANONICAL_PROPERTIES.THUMBNAIL]: 'Миниатюра',
  [CANONICAL_PROPERTIES.CATEGORY]: 'Категория',
  [CANONICAL_PROPERTIES.SUBCATEGORY]: 'Подкатегория',
  [CANONICAL_PROPERTIES.TAGS]: 'Теги',
  [CANONICAL_PROPERTIES.IS_ACTIVE]: 'Активен',
  [CANONICAL_PROPERTIES.CREATED_AT]: 'Дата создания',
  [CANONICAL_PROPERTIES.UPDATED_AT]: 'Дата обновления',
  [CANONICAL_PROPERTIES.VALID_FROM]: 'Действительно с',
  [CANONICAL_PROPERTIES.VALID_TO]: 'Действительно до',
  [CANONICAL_PROPERTIES.DOOR_TYPE]: 'Тип двери',
  [CANONICAL_PROPERTIES.DOOR_SYSTEM]: 'Система двери',
  [CANONICAL_PROPERTIES.FRAME_TYPE]: 'Тип короба',
  [CANONICAL_PROPERTIES.TRIM_TYPE]: 'Тип наличника',
  [CANONICAL_PROPERTIES.EXTENSION_TYPE]: 'Тип добора',
  [CANONICAL_PROPERTIES.HARDWARE_TYPE]: 'Тип фурнитуры',
  [CANONICAL_PROPERTIES.HARDWARE_MATERIAL]: 'Материал фурнитуры',
  [CANONICAL_PROPERTIES.HARDWARE_FINISH]: 'Отделка фурнитуры',
  [CANONICAL_PROPERTIES.HARDWARE_FUNCTION]: 'Функция фурнитуры'
};

// Функция для нормализации названий свойств
export function normalizePropertyName(propertyName: string): CanonicalPropertyValue | null {
  const trimmed = propertyName.trim();
  
  // Прямое совпадение с каноническими названиями
  if (Object.values(CANONICAL_PROPERTIES).includes(trimmed as CanonicalPropertyValue)) {
    return trimmed as CanonicalPropertyValue;
  }
  
  // Поиск в маппинге
  const normalized = PROPERTY_MAPPING[trimmed];
  if (normalized) {
    return normalized;
  }
  
  // Поиск по частичному совпадению (регистронезависимо)
  const lowerTrimmed = trimmed.toLowerCase();
  for (const [key, value] of Object.entries(PROPERTY_MAPPING)) {
    if (key.toLowerCase() === lowerTrimmed) {
      return value;
    }
  }
  
  return null;
}

// Функция для получения отображаемого названия
export function getDisplayName(canonicalName: CanonicalPropertyValue): string {
  return DISPLAY_NAMES[canonicalName] || canonicalName;
}

// Функция для создания объекта с каноническими названиями
export function normalizeProperties(properties: Record<string, any>): Record<CanonicalPropertyValue, any> {
  const normalized: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(properties)) {
    const canonicalKey = normalizePropertyName(key);
    if (canonicalKey) {
      normalized[canonicalKey] = value;
    } else {
      // Если не удалось нормализовать, сохраняем с префиксом
      normalized[`unknown_${key}`] = value;
    }
  }
  
  return normalized as Record<CanonicalPropertyValue, any>;
}

// Типы для частичного обновления
export interface PartialUpdateOptions {
  updateMode: 'replace' | 'merge' | 'selective';
  selectedProperties?: CanonicalPropertyValue[];
  skipEmptyValues?: boolean;
  validateBeforeUpdate?: boolean;
}

// Режимы обновления
export const UPDATE_MODES = {
  REPLACE: 'replace',     // Полная замена properties_data
  MERGE: 'merge',         // Слияние с существующими свойствами
  SELECTIVE: 'selective'  // Обновление только выбранных свойств
} as const;
