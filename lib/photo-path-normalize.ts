/**
 * Единые правила для путей к фото: Unicode NFC и каноническое имя для сравнения.
 * Цель: в БД и на диске использовать одну форму (NFC); при сверке сравнивать по канону.
 */

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg)$/i;

/**
 * Приводит строку к форме Unicode NFC (композитная форма).
 * На диске (macOS/Linux) имена могут быть в NFD; в БД и URL — NFC.
 */
export function normalizeToNFC(s: string): string {
  if (typeof s !== 'string') return '';
  return s.normalize('NFC');
}

/**
 * Каноническая форма имени файла для сравнения:
 * - NFC
 * - trim
 * - пробелы заменяются на подчёркивание (как в именах файлов)
 * Регистр не меняем: имена файлов на Linux чувствительны к регистру.
 * Скобки оставляем как есть (RAL_9005 vs RAL 9005 нормализуются за счёт пробелов → _).
 */
export function canonicalFilenameForComparison(filename: string): string {
  if (typeof filename !== 'string') return '';
  let t = filename.trim().normalize('NFC');
  t = t.replace(/\s+/g, '_');
  return t;
}

/**
 * Из пути вида /uploads/final-filled/doors/Имя.png или final-filled/doors/Имя.png
 * возвращает только имя файла (последний сегмент).
 */
export function basenameOfPhotoPath(photoPath: string): string {
  if (typeof photoPath !== 'string') return '';
  const t = photoPath.trim().replace(/\\/g, '/');
  const idx = t.lastIndexOf('/');
  return idx === -1 ? t : t.slice(idx + 1);
}

/**
 * Приводит путь к виду /uploads/final-filled/doors/Имя.расширение
 * (без изменения имени файла — только префикс).
 */
export function normalizePhotoPathPrefix(photoPath: string): string {
  if (typeof photoPath !== 'string') return '';
  let t = photoPath.trim().replace(/\\/g, '/');
  if (t.startsWith('/uploads/')) return t;
  if (t.startsWith('uploads/')) return '/' + t;
  if (t.includes('final-filled/doors')) {
    const i = t.indexOf('final-filled/doors');
    return '/uploads/' + t.slice(i);
  }
  if (t.startsWith('/')) return t;
  return '/uploads/' + t.replace(/^uploads\//, '');
}

/**
 * Проверяет, что строка похожа на путь к фото дверей (final-filled/doors).
 */
export function isDoorsPhotoPath(photoPath: string): boolean {
  if (typeof photoPath !== 'string') return false;
  const lower = photoPath.toLowerCase();
  return (lower.includes('final-filled/doors') || lower.includes('final-filled\\doors')) && IMAGE_EXT.test(photoPath);
}
