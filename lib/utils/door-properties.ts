/**
 * Утилиты для работы со свойствами межкомнатных дверей
 * 
 * Эти функции обеспечивают единообразный доступ к свойствам товаров
 * и автоматическую обработку данных из базы данных.
 */

import { DOOR_PROPERTIES, TECHNICAL_PROPERTIES, type DoorPropertyKey } from '../constants/door-properties';
import { logger } from '../logging/logger';

/**
 * Парсит properties_data из базы данных
 * @param propertiesData - Строка JSON или объект с данными свойств
 * @returns Объект с распарсенными свойствами
 */
export function parseProductProperties(propertiesData: string | object): Record<string, unknown> {
  if (!propertiesData) return {};
  
  if (typeof propertiesData === 'string') {
    try {
      return JSON.parse(propertiesData);
    } catch (error) {
      logger.warn('Failed to parse properties_data', 'door-properties', { error: error instanceof Error ? error.message : String(error) });
      return {};
    }
  }
  
  return propertiesData as Record<string, unknown>;
}

/**
 * Получает значение свойства двери по ключу
 * @param properties - Объект со свойствами товара
 * @param key - Ключ свойства из DOOR_PROPERTIES
 * @returns Значение свойства или undefined
 */
export function getDoorProperty(properties: Record<string, unknown>, key: DoorPropertyKey): unknown {
  const propertyKey = DOOR_PROPERTIES[key];
  return properties[propertyKey];
}

/**
 * Получает значение свойства (теперь использует только канонические названия)
 * @param properties - Объект со свойствами товара
 * @param key - Ключ свойства из DOOR_PROPERTIES
 * @returns Значение свойства или undefined
 */
export function getDoorPropertyWithFallback(properties: Record<string, unknown>, key: DoorPropertyKey): unknown {
  // Используем только канонические названия после миграции
  return getDoorProperty(properties, key);
}

// ===================== Специализированные функции =====================

/**
 * Название модели из полей товара (properties_data).
 * @param properties - Объект со свойствами товара (properties_data)
 * @returns Название модели или undefined
 */
export function getModelNameFromProps(properties: Record<string, unknown>): string | undefined {
  const v = properties['Название модели'];
  return typeof v === 'string' ? (v.trim() || undefined) : undefined;
}

/**
 * Получает название модели двери («Название модели»).
 * @param properties - Объект со свойствами товара
 * @returns Название модели или undefined
 */
export function getDoorModel(properties: Record<string, unknown>): string | undefined {
  return getModelNameFromProps(properties);
}

/**
 * Получает стиль двери
 * @param properties - Объект со свойствами товара
 * @returns Стиль двери или undefined
 */
export function getDoorStyle(properties: Record<string, unknown>): string | undefined {
  const value = getDoorPropertyWithFallback(properties, 'STYLE');
  return typeof value === 'string' ? value : undefined;
}

/**
 * Получает цвет двери
 * @param properties - Объект со свойствами товара
 * @returns Цвет двери или undefined
 */
export function getDoorColor(properties: Record<string, unknown>): string | undefined {
  const value = getDoorPropertyWithFallback(properties, 'COLOR');
  return typeof value === 'string' ? value : undefined;
}

/**
 * Получает тип покрытия двери
 * @param properties - Объект со свойствами товара
 * @returns Тип покрытия или undefined
 */
export function getDoorFinish(properties: Record<string, unknown>): string | undefined {
  const value = getDoorPropertyWithFallback(properties, 'COATING_TYPE');
  return typeof value === 'string' ? value : undefined;
}

/**
 * Получает тип конструкции двери
 * @param properties - Объект со свойствами товара
 * @returns Тип конструкции или undefined
 */
export function getDoorConstructionType(properties: Record<string, unknown>): string | undefined {
  const value = getDoorPropertyWithFallback(properties, 'CONSTRUCTION_TYPE');
  return typeof value === 'string' ? value : undefined;
}

/**
 * Получает ширину двери в миллиметрах
 * @param properties - Объект со свойствами товара
 * @returns Ширина в мм или undefined
 */
export function getDoorWidth(properties: Record<string, unknown>): number | undefined {
  const width = getDoorPropertyWithFallback(properties, 'WIDTH_MM');
  return width ? Number(width) : undefined;
}

/**
 * Получает высоту двери в миллиметрах
 * @param properties - Объект со свойствами товара
 * @returns Высота в мм или undefined
 */
export function getDoorHeight(properties: Record<string, unknown>): number | undefined {
  const height = getDoorPropertyWithFallback(properties, 'HEIGHT_MM');
  return height ? Number(height) : undefined;
}

/**
 * Получает толщину двери в миллиметрах
 * @param properties - Объект со свойствами товара
 * @returns Толщина в мм или undefined
 */
export function getDoorThickness(properties: Record<string, unknown>): number | undefined {
  const thickness = getDoorPropertyWithFallback(properties, 'THICKNESS_MM');
  return thickness ? Number(thickness) : undefined;
}

/**
 * Получает розничную цену двери
 * @param properties - Объект со свойствами товара
 * @returns Розничная цена или undefined
 */
export function getDoorRetailPrice(properties: Record<string, unknown>): number | undefined {
  const price = getDoorPropertyWithFallback(properties, 'RETAIL_PRICE');
  return price ? parseFloat(String(price)) : undefined;
}

/**
 * Получает оптовую цену двери
 * @param properties - Объект со свойствами товара
 * @returns Оптовая цена или undefined
 */
export function getDoorWholesalePrice(properties: Record<string, unknown>): number | undefined {
  const price = getDoorPropertyWithFallback(properties, 'WHOLESALE_PRICE');
  return price ? parseFloat(String(price)) : undefined;
}

/**
 * Получает артикул поставщика
 * @param properties - Объект со свойствами товара
 * @returns Артикул поставщика или undefined
 */
export function getDoorSupplierArticle(properties: Record<string, unknown>): string | undefined {
  const value = getDoorPropertyWithFallback(properties, 'SUPPLIER_ARTICLE');
  return typeof value === 'string' ? value : undefined;
}

/**
 * Получает название поставщика
 * @param properties - Объект со свойствами товара
 * @returns Название поставщика или undefined
 */
export function getDoorSupplier(properties: Record<string, unknown>): string | undefined {
  const value = getDoorPropertyWithFallback(properties, 'SUPPLIER');
  return typeof value === 'string' ? value : undefined;
}

/**
 * Получает фабрику/коллекцию
 * @param properties - Объект со свойствами товара
 * @returns Фабрика/коллекция или undefined
 */
export function getDoorFactoryCollection(properties: Record<string, unknown>): string | undefined {
  const value = getDoorPropertyWithFallback(properties, 'FACTORY_COLLECTION');
  return typeof value === 'string' ? value : undefined;
}

// ===================== Утилиты для фильтрации =====================

/**
 * Проверяет, соответствует ли товар фильтру по стилю
 * @param properties - Объект со свойствами товара
 * @param style - Искомый стиль
 * @returns true если соответствует
 */
export function matchesDoorStyle(properties: Record<string, unknown>, style?: string): boolean {
  if (!style) return true;
  const doorStyle = getDoorStyle(properties);
  return doorStyle === style;
}

/**
 * Проверяет, соответствует ли товар фильтру по модели
 * @param properties - Объект со свойствами товара
 * @param model - Искомая модель
 * @returns true если соответствует
 */
export function matchesDoorModel(properties: Record<string, unknown>, model?: string): boolean {
  if (!model) return true;
  const doorModel = getDoorModel(properties);
  return doorModel?.includes(model) || false;
}

/**
 * Проверяет, соответствует ли товар фильтру по покрытию
 * @param properties - Объект со свойствами товара
 * @param finish - Искомое покрытие
 * @returns true если соответствует
 */
export function matchesDoorFinish(properties: Record<string, unknown>, finish?: string): boolean {
  if (!finish) return true;
  const doorFinish = getDoorFinish(properties);
  return doorFinish === finish;
}

/**
 * Проверяет, соответствует ли товар фильтру по цвету
 * @param properties - Объект со свойствами товара
 * @param color - Искомый цвет
 * @returns true если соответствует
 */
export function matchesDoorColor(properties: Record<string, unknown>, color?: string): boolean {
  if (!color) return true;
  const doorColor = getDoorColor(properties);
  return doorColor === color;
}

/**
 * Проверяет, соответствует ли товар фильтру по ширине
 * @param properties - Объект со свойствами товара
 * @param width - Искомая ширина
 * @returns true если соответствует
 */
export function matchesDoorWidth(properties: Record<string, unknown>, width?: number): boolean {
  if (!width) return true;
  const doorWidth = getDoorWidth(properties);
  return doorWidth === width;
}

/**
 * Проверяет, соответствует ли товар фильтру по высоте
 * @param properties - Объект со свойствами товара
 * @param height - Искомая высота
 * @returns true если соответствует
 */
export function matchesDoorHeight(properties: Record<string, unknown>, height?: number): boolean {
  if (!height) return true;
  const doorHeight = getDoorHeight(properties);
  return doorHeight === height;
}

/**
 * Проверяет, соответствует ли товар фильтру по типу конструкции
 * @param properties - Объект со свойствами товара
 * @param type - Искомый тип конструкции
 * @returns true если соответствует
 */
export function matchesDoorConstructionType(properties: Record<string, unknown>, type?: string): boolean {
  if (!type) return true;
  const doorType = getDoorConstructionType(properties);
  return doorType === type;
}

// ===================== Утилиты для экспорта =====================

/**
 * Получает все не-технические свойства для экспорта
 * @param properties - Объект со свойствами товара
 * @returns Объект с отфильтрованными свойствами
 */
export function getExportableProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const exportable: Record<string, unknown> = {};
  
  Object.entries(properties).forEach(([key, value]) => {
    // Исключаем технические свойства
    if (!TECHNICAL_PROPERTIES.includes(key as any) && 
        !key.includes('_id') && 
        !key.includes('photo') && 
        !key.includes('url') &&
        !key.includes('path') &&
        !key.includes('image') &&
        key.length > 2) {
      exportable[key] = value;
    }
  });
  
  return exportable;
}

/**
 * Получает все уникальные значения для свойства
 * @param products - Массив товаров
 * @param propertyKey - Ключ свойства
 * @returns Массив уникальных значений
 */
export function getUniquePropertyValues(products: Array<{ properties_data: string | object }>, propertyKey: DoorPropertyKey): string[] {
  const values = new Set<string>();
  
  products.forEach(product => {
    const properties = parseProductProperties(product.properties_data);
    const value = getDoorPropertyWithFallback(properties, propertyKey);
    
    if (value && typeof value === 'string' && value.trim()) {
      values.add(value.trim());
    }
  });
  
  return Array.from(values).sort();
}

/**
 * Получает все уникальные числовые значения для свойства
 * @param products - Массив товаров
 * @param propertyKey - Ключ свойства
 * @returns Массив уникальных числовых значений
 */
export function getUniqueNumericPropertyValues(products: Array<{ properties_data: string | object }>, propertyKey: DoorPropertyKey): number[] {
  const values = new Set<number>();
  
  products.forEach(product => {
    const properties = parseProductProperties(product.properties_data);
    const value = getDoorPropertyWithFallback(properties, propertyKey);
    
    if (value) {
      const numericValue = Number(value);
      if (!isNaN(numericValue)) {
        values.add(numericValue);
      }
    }
  });
  
  return Array.from(values).sort((a, b) => a - b);
}

// ===================== Утилиты для валидации =====================

/**
 * Проверяет, есть ли у товара все необходимые свойства для калькулятора
 * @param properties - Объект со свойствами товара
 * @returns true если все свойства присутствуют
 */
export function hasRequiredCalculatorProperties(properties: Record<string, unknown>): boolean {
  return !!(
    getDoorStyle(properties) &&
    getDoorModel(properties) &&
    getDoorFinish(properties) &&
    getDoorColor(properties) &&
    getDoorWidth(properties) &&
    getDoorHeight(properties) &&
    getDoorRetailPrice(properties)
  );
}

/**
 * Проверяет, есть ли у товара базовые свойства
 * @param properties - Объект со свойствами товара
 * @returns true если базовые свойства присутствуют
 */
export function hasBasicProperties(properties: Record<string, unknown>): boolean {
  return !!(
    getDoorModel(properties) &&
    getDoorRetailPrice(properties)
  );
}

