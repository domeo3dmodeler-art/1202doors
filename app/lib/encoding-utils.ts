/**
 * Утилиты для работы с кодировкой UTF-8
 */

// Маппинг поврежденных полей на правильные
// Примечание: '??????/??' и '??????' обрабатываются специальной логикой в fixFieldEncoding/fixFieldsEncoding
// так как они могут соответствовать разным значениям в зависимости от контекста
export const CORRUPTED_FIELD_MAPPINGS: Record<string, string> = {
  '??????? ??????????': 'Артикул поставщика',
  'Domeo_???????? ?????? ??? Web': 'Domeo_Название модели для Web',
  // '??????/??' обрабатывается специальной логикой (может быть 'Ширина/мм' или 'Высота/мм')
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
  // '??????' обрабатывается специальной логикой (может быть 'Кромка' или 'Стекло')
  '????????? ???????? ?? ??????': 'Стоимость надбавки за кромку',
  '???????': 'Молдинг',
  '???????_?????????': 'Фабрика_Коллекция',
  '???????_????/???????': 'Фабрика_Цвет/Отделка',
  'Domeo ??????? 1C (????????????? ????????????)': 'Domeo Артикул 1C (Проставляется атоматически)'
};

/**
 * Исправляет кодировку поля, заменяя поврежденные символы на правильные
 */
export function fixFieldEncoding(field: string): string {
  if (typeof field !== 'string') {
    return field;
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
    // Используем logger только если доступен (серверная среда)
    try {
      const { logger } = require('@/lib/logging/logger');
      logger.warn('Ошибка кодировки UTF-8', 'lib/encoding-utils', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    } catch {
      // Fallback для клиентской среды или если logger недоступен
      // В production коде это не должно происходить
    }
    return text;
  }
}

/**
 * Валидирует и исправляет данные перед сохранением в базу
 */
export function validateAndFixData(data: any): any {
  if (typeof data === 'string') {
    return ensureUTF8Encoding(data);
  }
  
  if (Array.isArray(data)) {
    return data.map(item => validateAndFixData(item));
  }
  
  if (typeof data === 'object' && data !== null) {
    const fixed: any = {};
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
export function fixAllEncoding(data: any): any {
  if (typeof data === 'string') {
    return fixFieldEncoding(data);
  }
  
  if (Array.isArray(data)) {
    return data.map(fixAllEncoding);
  }
  
  if (typeof data === 'object' && data !== null) {
    const result: any = {};
    for (const [key, value] of Object.entries(data)) {
      result[fixFieldEncoding(key)] = fixAllEncoding(value);
    }
    return result;
  }
  
  return data;
}