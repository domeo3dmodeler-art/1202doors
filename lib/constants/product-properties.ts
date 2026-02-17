/**
 * Константы для свойств товаров
 * Единый источник истины для всех названий свойств
 */

export const PRODUCT_PROPERTIES = {
  // Идентификация
  NUMBER: '#',
  ARTICLE_DOMEO: 'АРТИКУЛ_DOMEO',
  ARTICLE_1C: 'Domeo Артикул 1С',
  
  // Основные характеристики
  MODEL: 'МОДЕЛЬ',
  MODEL_WEB: 'Domeo_Название модели для Web',
  CONSTRUCTION_TYPE: 'ТИП КОНСТРУКЦИИ',
  STYLE: 'СТИЛЬ',
  STYLE_WEB: 'Domeo_Стиль Web',
  
  // Материалы и отделка
  FACTORY_COLLECTION: 'ФАБРИКА_КОЛЛЕКЦИЯ',
  COATING_TYPE: 'ТИП ПОКРЫТИЯ',
  COATING_GENERAL: 'Тип покрытия',
  
  // Цвета
  COLOR_DOMEO: 'ЦВЕТ_DOMEO',
  COLOR: 'ЦВЕТ',
  /** Цвет/отделка (Domeo_Цвет устарел) */
  COLOR_WEB: 'Цвет/Отделка',
  
  // Размеры
  WIDTH: 'Ширина/мм',
  HEIGHT: 'Высота/мм',
  THICKNESS: 'Толщина/мм',
  
  // Ценообразование
  RETAIL_PRICE: 'Цена РРЦ',
  RRC_PRICE: 'РРЦ',
  WHOLESALE_PRICE: 'Цена опт',
  
  // Дополнительные элементы
  EDGE: 'Кромка',
  MOLDING: 'Молдинг',
  GLASS: 'Стекло',
  
  // Поставщик и склад
  SUPPLIER: 'Поставщик',
  SUPPLIER_NAME: 'Наименование поставщика',
  WAREHOUSE_ORDER: 'Склад/заказ',
  
  // Технические
  PHOTOS: 'photos',
  CATEGORY: 'Категория',
  UNIT: 'Ед.изм.',
  
  // Ручки
  HANDLE_NAME: 'Domeo_наименование ручки_1С',
  HANDLE_PRICE: 'Domeo_цена группы Web',
  
  // Фурнитура
  GROUP: 'Группа',
  PRICE_GROUP: 'Ценовая группа',
  WEB_NAME: 'Наименование для Web'
} as const;

/**
 * Маппинг старых названий на новые для обратной совместимости
 */
export const PROPERTY_MAPPING = {
  // Старые названия → Новые названия
  'Domeo_Стиль Web': 'СТИЛЬ',
  'Domeo_Название модели для Web': 'МОДЕЛЬ',
  'Тип покрытия': 'ТИП ПОКРЫТИЯ',
  'Цвет/Отделка': 'ЦВЕТ',
  'Тип конструкции': 'ТИП КОНСТРУКЦИИ',
  'Ширина/мм': 'Ширина/мм',
  'Высота/мм': 'Высота/мм',
  'Цена РРЦ': 'Цена РРЦ',
  'Domeo Артикул 1С': 'АРТИКУЛ_DOMEO',
  'Domeo_наименование ручки_1С': 'Наименование ручки',
  'Domeo_цена группы Web': 'Цена ручки',
  
  // Новые названия → Старые названия (для fallback)
  'СТИЛЬ': 'Domeo_Стиль Web',
  'МОДЕЛЬ': 'Domeo_Название модели для Web',
  'ТИП ПОКРЫТИЯ': 'Тип покрытия',
  'ЦВЕТ': 'Цвет/Отделка',
  'ТИП КОНСТРУКЦИИ': 'Тип конструкции',
  'АРТИКУЛ_DOMEO': 'Domeo Артикул 1С'
} as const;

/**
 * Свойства для калькулятора дверей
 */
export const DOOR_CALCULATOR_PROPERTIES = {
  STYLE: 'СТИЛЬ',
  MODEL: 'МОДЕЛЬ',
  COATING_TYPE: 'ТИП ПОКРЫТИЯ',
  COLOR: 'ЦВЕТ',
  WIDTH: 'Ширина/мм',
  HEIGHT: 'Высота/мм',
  RETAIL_PRICE: 'Цена ррц (включая цену полотна, короба, наличников, доборов)'
} as const;

/**
 * Свойства для экспорта в Excel
 */
export const EXPORT_PROPERTIES = {
  NUMBER: '#',
  ARTICLE_DOMEO: 'АРТИКУЛ_DOMEO',
  MODEL: 'МОДЕЛЬ',
  CONSTRUCTION_TYPE: 'ТИП КОНСТРУКЦИИ',
  STYLE: 'СТИЛЬ',
  FACTORY_COLLECTION: 'ФАБРИКА_КОЛЛЕКЦИЯ',
  COATING_TYPE: 'ТИП ПОКРЫТИЯ',
  COLOR: 'ЦВЕТ',
  WIDTH: 'Ширина/мм',
  HEIGHT: 'Высота/мм',
  RETAIL_PRICE: 'Цена ррц (включая цену полотна, короба, наличников, доборов)'
} as const;

/**
 * Типы свойств для валидации
 */
export type ProductPropertyKey = keyof typeof PRODUCT_PROPERTIES;
export type DoorCalculatorPropertyKey = keyof typeof DOOR_CALCULATOR_PROPERTIES;
export type ExportPropertyKey = keyof typeof EXPORT_PROPERTIES;
