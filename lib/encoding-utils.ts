/**
 * Утилиты для работы с кодировкой UTF-8
 */

// Маппинг поврежденных полей на правильные
export const CORRUPTED_FIELD_MAPPINGS: Record<string, string> = {
  'SKU Ð²Ð½Ñ\x83Ñ\x82Ñ\x80ÐµÐ½Ð½ÐµÐµ': 'SKU внутреннее',
  'Domeo_Ð\x9DÐ°Ð·Ð²Ð°Ð½Ð¸Ðµ Ð¼Ð¾Ð´ÐµÐ»Ð¸ Ð´Ð»Ñ\x8F Web': 'Domeo_Название модели для Web',
  'Domeo_Ð½Ð°Ð¸Ð¼ÐµÐ½Ð¾Ð²Ð°Ð½Ð¸Ðµ Ð´Ð»Ñ\x8F Web': 'Domeo_наименование для Web',
  'Domeo_Ð½Ð°Ð¸Ð¼ÐµÐ½Ð¾Ð²Ð°Ð½Ð¸Ðµ Ñ\x80Ñ\x83Ñ\x87ÐºÐ¸_1Ð¡': 'Domeo_наименование ручки_1С',
  'Domeo_Ñ\x86ÐµÐ½Ð° Ð³Ñ\x80Ñ\x83Ð¿Ð¿Ñ\x8B Web': 'Domeo_цена группы Web',
  'Ð\x91Ñ\x80ÐµÐ½Ð´': 'Бренд',
  'Ð\x93Ñ\x80Ñ\x83Ð¿Ð¿Ð°': 'Группа',
  'Ð\x9DÐ°Ð»Ð¸Ñ\x87Ð¸Ðµ Ð² Ñ\x88Ð¾Ñ\x83Ñ\x80Ñ\x83Ð¼Ðµ': 'Наличие в шоуруме',
  'Ð\x9FÐ¾Ñ\x81Ñ\x82Ð°Ð²Ñ\x89Ð¸Ðº': 'Поставщик',
  'Ð¤Ð°Ð±Ñ\x80Ð¸ÐºÐ°_Ð°Ñ\x80Ñ\x82Ð¸ÐºÑ\x83Ð»': 'Фабрика_артикул',
  'Ð¤Ð°Ð±Ñ\x80Ð¸ÐºÐ°_Ð½Ð°Ð¸Ð¼ÐµÐ½Ð¾Ð²Ð°Ð½Ð¸Ðµ': 'Фабрика_наименование',
  'Ð¦ÐµÐ½Ð° Ð¾Ð¿Ñ\x82': 'Цена опт',
  'Ð¦ÐµÐ½Ð° Ñ\x80Ð¾Ð·Ð½Ð¸Ñ\x86Ð°': 'Цена розница',
  '??????? ??????????': 'Артикул поставщика',
  'Domeo_???????? ?????? ??? Web': 'Domeo_Название модели для Web',
  // Ширина и Высота обрабатываются специальной логикой в fixFieldsEncoding
  '???????/??': 'Толщина/мм',
  '?????_??? ????????': 'Тип покрытия',
  'Domeo_????': 'Цвет/Отделка',
  'Domeo_????? Web': 'Domeo_Стиль Web',
  '??? ???????????': 'Тип конструкции',
  '??? ??????????': 'Тип открывания',
  '?????????': 'Поставщик',
  '??.???.': 'Ед.изм.',
  '?????/?????': 'Склад/заказ',
  '???? ??? (??????? ???? ???????, ??????, ??????????, ???????)': 'Цена ррц (включая цену полотна, короба, наличников, доборов)',
  '???? ???': 'Цена опт',
  // Кромка и Стекло обрабатываются специальной логикой в fixFieldsEncoding
  '????????? ???????? ?? ??????': 'Стоимость надбавки за кромку',
  '???????': 'Молдинг',
  '???????_?????????': 'Фабрика_Коллекция',
  '???????_????/???????': 'Фабрика_Цвет/Отделка',
  'Domeo ??????? 1C (????????????? ????????????)': 'Domeo Артикул 1C (Проставляется атоматически)',
  
  // Специальные маппинги для поврежденных названий ручек
  'Ð\x9CÐ°Ñ\x82Ð¾Ð²Ñ\x8BÐ¹ Ñ\x85Ñ\x80Ð¾Ð¼': 'матовый хром',
  'Ð¼Ð°Ñ\x82Ð¾Ð²Ñ\x8BÐ¹ Ð½Ð¸ÐºÐµÐ»Ñ\x8C': 'матовый никель',
  'Ñ\x84Ð»Ð¾Ñ\x80ÐµÐ½Ñ\x82Ð¸Ð¹Ñ\x81ÐºÐ¾Ðµ Ð·Ð¾Ð»Ð¾Ñ\x82Ð¾': 'флорентийское золото',
  'Ð§ÐµÑ\x80Ð½Ñ\x8BÐ¹ Ð¼Ð°Ñ\x82Ð¾Ð²Ñ\x8BÐ¹': 'черный матовый',
  'Ñ\x87ÐµÑ\x80Ð½Ñ\x8BÐ¹': 'черный',
  'Ð\x9CÐ°Ñ\x82Ð¾Ð²Ñ\x8BÐ¹ Ð½Ð¸ÐºÐµÐ»Ñ\x8C': 'матовый никель',
  'Ð¼Ð°Ñ\x82Ð¾Ð²Ñ\x8BÐ¹ Ñ\x85Ñ\x80Ð¾Ð¼': 'матовый хром'
};

/**
 * Исправляет кодировку поля, заменяя поврежденные символы на правильные
 */
export function fixFieldEncoding(field: string): string {
  if (typeof field !== 'string') {
    return field;
  }
  
  // Сначала проверяем точные маппинги
  if (CORRUPTED_FIELD_MAPPINGS[field]) {
    return CORRUPTED_FIELD_MAPPINGS[field];
  }
  
  // Если поле содержит знаки вопроса, заменяем на правильные символы
  if (field.includes('?')) {
    // Специальная логика для полей с одинаковыми поврежденными символами
    if (field === '??????/??') {
      // Это может быть Ширина или Высота - определяем по контексту
      // Пока что возвращаем Ширина, так как это первое в списке
      return 'Ширина/мм';
    }
    
    if (field === '??????') {
      // Это может быть Кромка или Стекло - определяем по контексту
      // Пока что возвращаем Кромка, так как это первое в списке
      return 'Кромка';
    }
    
    // Специальные случаи для названия и описания шаблона
    if (field === '?????? ??? ???????????? ?????') {
      return 'Шаблон для Межкомнатные двери';
    }
    
    if (field === '??????????? ?????? ??? ??????? ???????????? ??????') {
      return 'Канонический шаблон для импорта межкомнатных дверей';
    }
    
    // Обычный маппинг для остальных полей
    return CORRUPTED_FIELD_MAPPINGS[field] || field;
  }
  
  return field;
}

/**
 * Исправляет кодировку массива полей с учетом порядка
 */
export function fixFieldsEncoding(fields: string[]): string[] {
  if (!Array.isArray(fields)) {
    return [];
  }
  
  const fixedFields: string[] = [];
  const seenFields = new Set<string>();
  
  fields.forEach(field => {
    let fixedField = fixFieldEncoding(field);
    
    // Если поле уже есть, добавляем суффикс
    if (seenFields.has(fixedField)) {
      if (fixedField === 'Ширина/мм') {
        fixedField = 'Высота/мм';
      } else if (fixedField === 'Кромка') {
        fixedField = 'Стекло';
      }
    }
    
    fixedFields.push(fixedField);
    seenFields.add(fixedField);
  });
  
  return fixedFields;
}

/**
 * Проверяет, содержит ли строка поврежденную кодировку
 */
export function hasCorruptedEncoding(text: string): boolean {
  if (typeof text !== 'string') {
    return false;
  }
  
  return text.includes('?') && /[а-яё]/i.test(text.replace(/\?/g, ''));
}

/**
 * Обеспечивает правильную кодировку UTF-8 для строки
 */
export function ensureUTF8Encoding(text: string): string {
  if (typeof text !== 'string') {
    return text;
  }
  
  try {
    // Проверяем, что строка корректно закодирована
    const encoded = Buffer.from(text, 'utf8').toString('utf8');
    return encoded;
  } catch (error) {
    // Используем logger если доступен (серверная среда)
    if (typeof window === 'undefined') {
      try {
        const { logger } = require('./logging/logger');
        logger.warn('Ошибка кодировки UTF-8', 'encoding-utils', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
      } catch {
        // Fallback для случаев, когда logger недоступен
        // В production коде это не должно происходить
      }
    }
    // В клиентской среде просто возвращаем исходный текст без логирования
    return text;
  }
}

/**
 * Валидирует и исправляет данные перед сохранением в базу
 */
export function validateAndFixData(data: unknown): unknown {
  if (typeof data === 'string') {
    return ensureUTF8Encoding(data);
  }
  
  if (Array.isArray(data)) {
    return data.map(item => validateAndFixData(item));
  }
  
  if (typeof data === 'object' && data !== null) {
    const fixed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      fixed[key] = validateAndFixData(value);
    }
    return fixed;
  }
  
  return data;
}

/**
 * Исправляет кодировку во всех текстовых полях объекта
 */
export function fixAllEncoding(data: unknown): unknown {
  if (typeof data === 'string') {
    return fixFieldEncoding(data);
  }
  
  if (Array.isArray(data)) {
    return data.map(fixAllEncoding);
  }
  
  if (typeof data === 'object' && data !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      result[fixFieldEncoding(key)] = fixAllEncoding(value);
    }
    return result;
  }
  
  return data;
}

/**
 * Исправляет кодировку в JSON строках
 */
export function fixJSONEncoding(jsonString: string): string {
  if (typeof jsonString !== 'string') {
    return jsonString;
  }
  
  try {
    const parsed = JSON.parse(jsonString);
    const fixed = fixAllEncoding(parsed);
    return JSON.stringify(fixed);
  } catch (error) {
    // Используем logger если доступен (серверная среда)
    if (typeof window === 'undefined') {
      try {
        const { logger } = require('./logging/logger');
        logger.warn('Ошибка парсинга JSON для исправления кодировки', 'encoding-utils', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
      } catch {
        // Fallback для случаев, когда logger недоступен
        // В production коде это не должно происходить
      }
    }
    // В клиентской среде просто возвращаем исходную строку без логирования
    return jsonString;
  }
}