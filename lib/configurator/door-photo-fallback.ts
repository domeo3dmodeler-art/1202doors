/**
 * Поиск файла фото двери в папке final-filled/doors по «запрошенному» имени.
 * Логика совпадает с GET /api/uploads/[...path] (findDoorPhotoFallback), чтобы
 * скрипты сопоставления и API находили один и тот же файл.
 */
import { join } from 'path';
import { existsSync, readdirSync } from 'fs';

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg)$/i;

/**
 * Ищет файл в doorsDir по имени (без пути).
 * Пробует: точное имя; с/без _cover; расширения .png/.jpg/.jpeg/.webp;
 * префиксы Дверь_, Дверное_полотно_; поиск по префиксу модели (1–2 сегмента).
 * @param doorsDir полный путь к папке public/uploads/final-filled/doors
 * @param requestedFileName имя файла, например base1_ПВХ_Крем_софт_cover.png
 * @returns полный путь к найденному файлу или null
 */
export function findDoorPhotoFile(doorsDir: string, requestedFileName: string): string | null {
  if (!existsSync(doorsDir)) return null;

  const baseName = requestedFileName.replace(/\.(jpg|jpeg|png|gif|webp|svg)$/i, '');
  const hasCover = baseName.endsWith('_cover');
  const nameWithoutCover = hasCover ? baseName.slice(0, -6) : baseName;

  const tryFile = (name: string): string | null => {
    for (const ext of ['.png', '.jpg', '.jpeg', '.webp']) {
      const p = join(doorsDir, name + ext);
      if (existsSync(p)) return p;
    }
    return null;
  };

  let found = tryFile(baseName);
  if (found) return found;
  if (!hasCover) {
    found = tryFile(baseName + '_cover');
    if (found) return found;
  }

  const withDoorPrefix = nameWithoutCover.startsWith('Дверь_') ? null : tryFile('Дверь_' + nameWithoutCover + (hasCover ? '_cover' : ''));
  if (withDoorPrefix) return withDoorPrefix;

  const withPolotnoPrefix = nameWithoutCover.startsWith('Дверное_полотно_') ? null : tryFile('Дверное_полотно_' + nameWithoutCover + (hasCover ? '_cover' : ''));
  if (withPolotnoPrefix) return withPolotnoPrefix;

  const files = readdirSync(doorsDir, { withFileTypes: true }).filter((d) => d.isFile() && IMAGE_EXT.test(d.name));
  const segments = nameWithoutCover.split('_').filter(Boolean);
  const tail = segments.length >= 2 ? segments.slice(-2).join('_') : nameWithoutCover;
  const tailLong = segments.length >= 3 ? segments.slice(-3).join('_') : tail;
  const tailLower = tail.toLowerCase();
  const tailLongLower = tailLong.toLowerCase();
  // Префикс = модель + покрытие (все сегменты кроме последних 2 — цвет), чтобы разным кодам не подставлять одно фото
  if (segments.length >= 3) {
    const modelCoatingPrefix = segments.slice(0, -2).join('_') + '_';
    const withCover = files.find(
      (f) =>
        f.name.startsWith(modelCoatingPrefix) &&
        f.name.toLowerCase().includes('cover') &&
        (f.name.toLowerCase().includes(tailLongLower) || f.name.toLowerCase().includes(tailLower))
    );
    if (withCover) return join(doorsDir, withCover.name);
    const anyMatch = files.find(
      (f) =>
        f.name.startsWith(modelCoatingPrefix) &&
        (f.name.toLowerCase().includes(tailLongLower) || f.name.toLowerCase().includes(tailLower))
    );
    if (anyMatch) return join(doorsDir, anyMatch.name);
    return null; // не подставляем фото другой модели по короткому префиксу
  }
  for (let len = Math.min(2, segments.length); len >= 1; len--) {
    const prefix = segments.slice(0, len).join('_') + '_';
    const withCover = files.find(
      (f) =>
        f.name.startsWith(prefix) &&
        f.name.toLowerCase().includes('cover') &&
        (f.name.toLowerCase().includes(tailLongLower) || f.name.toLowerCase().includes(tailLower))
    );
    if (withCover) return join(doorsDir, withCover.name);
    const anyMatch = files.find(
      (f) => f.name.startsWith(prefix) && (f.name.toLowerCase().includes(tailLongLower) || f.name.toLowerCase().includes(tailLower))
    );
    if (anyMatch) return join(doorsDir, anyMatch.name);
  }

  const segs = nameWithoutCover.split('_').filter(Boolean);
  const suffixOne = (segs.pop() || '').toLowerCase();
  const suffixTwo = segs.length >= 1 ? (segs[segs.length - 1] + '_' + suffixOne).toLowerCase() : '';
  if (suffixTwo && suffixOne !== 'cover') {
    const match = files.find(
      (f) =>
        (f.name.toLowerCase().includes('_' + suffixTwo + '_cover') || f.name.toLowerCase().endsWith('_' + suffixTwo + '_cover.png')) &&
        (f.name.toLowerCase().endsWith('_cover.png') || f.name.toLowerCase().endsWith('_cover.jpg'))
    );
    if (match) return join(doorsDir, match.name);
  }
  if (suffixOne && suffixOne !== 'cover') {
    const match = files.find((f) => f.name.toLowerCase().endsWith('_' + suffixOne + '_cover.png') || f.name.toLowerCase().endsWith('_' + suffixOne + '_cover.jpg'));
    if (match) return join(doorsDir, match.name);
  }

  return null;
}
