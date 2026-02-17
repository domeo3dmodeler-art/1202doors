/**
 * Единая настройка путей к фото дверей (обложки, галерея по цветам).
 * Меняйте только здесь — complete-data, API раздачи и скрипты используют эти константы.
 *
 * Физическое расположение: public/uploads/{DOOR_PHOTOS_SUBFOLDER}/
 * Пример: public/uploads/final-filled/doors/
 */

/** Подпапка в public/uploads/ для фото дверей (обложки по модели/покрытию/цвету). */
export const DOOR_PHOTOS_SUBFOLDER = 'final-filled/doors';

/** Префикс URL для фото дверей: /uploads/final-filled/doors/ */
export const DOOR_PHOTOS_UPLOAD_PREFIX = `/uploads/${DOOR_PHOTOS_SUBFOLDER}/`;

/**
 * Собирает путь к файлу фото двери по подпапке и имени файла.
 * Используется в complete-data (fallbackLocalPathForColor) и скриптах привязки.
 */
export function doorPhotoPath(filename: string): string {
  const name = filename.replace(/^\/+/, '').replace(/^uploads\/final-filled\/[^/]+\//, '');
  return `${DOOR_PHOTOS_UPLOAD_PREFIX}${name}`;
}
