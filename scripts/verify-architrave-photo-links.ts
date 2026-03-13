/**
 * Проверка наличия файлов по ссылкам из листа «Наличники» (колонка «Наличник: Фото (ссылка)»).
 * Пути из Excel: /uploads/final-filled/Наличники/<подпапка>/<файл>.png
 * Файлы на диске: public/uploads/final-filled/Наличники/...
 *
 * Запуск: npx tsx scripts/verify-architrave-photo-links.ts
 */
import * as path from 'path';
import * as fs from 'fs';

const PUBLIC_ROOT = path.join(__dirname, '..', 'public');

/** Ссылки из скрина Excel (колонка «Наличник: Фото (ссылка)») */
const EXCEL_PHOTO_LINKS = [
  '/uploads/final-filled/Наличники/наличники фрамир/Прямой 70 мм.png',
  '/uploads/final-filled/Наличники/наличники фрамир/Прямой 80 мм.png',
  '/uploads/final-filled/Наличники/наличники фрамир/Прямой 90 мм.png',
  '/uploads/final-filled/Наличники/наличники фрамир/Прямой 100 мм.png',
  '/uploads/final-filled/Наличники/наличники фрамир/Компланар 90 мм.png',
  '/uploads/final-filled/Наличники/наличники фрамир/Альянс 80 мм.png',
  '/uploads/final-filled/Наличники/наличники фрамир/Альянс 100 мм.png',
  '/uploads/final-filled/Наличники/наличники фрамир/Верона 80 мм.png',
  '/uploads/final-filled/Наличники/наличники фрамир/Верона 100 мм.png',
  '/uploads/final-filled/Наличники/наличники фрамир/Верона компланар 80 мм.png',
  '/uploads/final-filled/Наличники/наличники фрамир/Эрте 100 мм.png',
  '/uploads/final-filled/Наличники/наличники вестстайл/Прямой 70 мм.png',
  '/uploads/final-filled/Наличники/наличники вестстайл/Прямой 85 мм.png',
  '/uploads/final-filled/Наличники/наличники вестстайл/Прямой 100 мм.png',
  '/uploads/final-filled/Наличники/портика_юркас/Прямой 70 мм.png',
  '/uploads/final-filled/Наличники/портика_юркас/Прямой 85 мм.png',
  '/uploads/final-filled/Наличники/портика_юркас/Прямой 100 мм.png',
];

function toFilePath(urlPath: string): string {
  const relative = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;
  return path.join(PUBLIC_ROOT, relative);
}

/** Разрешить путь: если по ссылке (NFC) файл не найден, ищем подпапку по совпадению имени в NFC (на диске папка может быть в NFD). */
function resolveFilePath(urlPath: string): { exists: boolean; direct: boolean } {
  const relative = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;
  const fullPath = path.join(PUBLIC_ROOT, relative);
  if (fs.existsSync(fullPath)) return { exists: true, direct: true };
  const parts = relative.split('/');
  if (parts.length < 2) return { exists: false, direct: false };
  const fileName = parts[parts.length - 1];
  const expectedDirName = parts[parts.length - 2];
  const grandParentRelative = parts.slice(0, -2).join(path.sep);
  const grandParentFull = path.join(PUBLIC_ROOT, grandParentRelative);
  if (!fs.existsSync(grandParentFull)) return { exists: false, direct: false };
  const dirs = fs.readdirSync(grandParentFull);
  const actualDir = dirs.find((d) => d.normalize('NFC') === expectedDirName.normalize('NFC'));
  if (!actualDir) return { exists: false, direct: false };
  const resolved = path.join(grandParentFull, actualDir, fileName);
  return { exists: fs.existsSync(resolved), direct: false };
}

function main() {
  console.log('Проверка ссылок на фото наличников (из Excel)\n');
  console.log('Корень public:', PUBLIC_ROOT);
  console.log('Существует public:', fs.existsSync(PUBLIC_ROOT));
  const baseDir = path.join(PUBLIC_ROOT, 'uploads', 'final-filled', 'Наличники');
  console.log('Папка Наличники:', baseDir);
  console.log('Существует:', fs.existsSync(baseDir));
  console.log('');

  let ok = 0;
  let miss = 0;
  let needNfcFix = false;
  const missing: string[] = [];

  for (const link of EXCEL_PHOTO_LINKS) {
    const { exists, direct } = resolveFilePath(link);
    if (exists) {
      ok++;
      if (!direct) needNfcFix = true;
      console.log('  OK:', link, direct ? '' : '(файл есть; папка на диске в NFD — при запросе по URL возможен 404)');
    } else {
      miss++;
      missing.push(link);
      console.log('  НЕТ:', link);
      console.log('       ожидаемый путь:', toFilePath(link));
    }
  }

  console.log('\n--- Итого ---');
  console.log('Найдено:', ok);
  console.log('Отсутствует:', miss);
  if (missing.length > 0) {
    console.log('\nОтсутствующие файлы (скопировать в public/):');
    missing.forEach((m) => console.log('  ', m));
  }
  if (needNfcFix) {
    console.log('\nРекомендация: папка «наличники вестстайл» на диске в NFD — при запросе по URL может быть 404.');
    console.log('Переименовать в NFC: npx tsx scripts/fix-architrave-folder-nfc.ts');
  }
}

main();
