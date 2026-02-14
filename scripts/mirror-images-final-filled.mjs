/**
 * Зеркальное отражение всех фото в public/uploads/final-filled по горизонтали.
 * Использует sharp. Запуск: node scripts/mirror-images-final-filled.mjs
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.join(__dirname, '..', 'public', 'uploads', 'final-filled');
// Можно передать путь: node script.mjs  или  node script.mjs public/uploads/final-filled/1
const ROOT = process.argv[2]
  ? path.isAbsolute(process.argv[2])
    ? process.argv[2]
    : path.join(__dirname, '..', process.argv[2])
  : defaultRoot;

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.tif']);

function* walkDir(dir) {
  if (!fs.existsSync(dir)) {
    console.error('Папка не найдена:', dir);
    return;
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      yield* walkDir(full);
    } else if (e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase())) {
      yield full;
    }
  }
}

async function main() {
  const files = [...walkDir(ROOT)];
  console.log('Найдено изображений:', files.length);
  if (files.length === 0) {
    console.log('Нечего обрабатывать.');
    return;
  }

  let ok = 0;
  let err = 0;
  for (const filePath of files) {
    try {
      const buf = await sharp(filePath)
        .flop() // отражение по горизонтали
        .toBuffer();
      fs.writeFileSync(filePath, buf);
      ok++;
      if (ok % 100 === 0) console.log('Обработано:', ok);
    } catch (e) {
      err++;
      console.error('Ошибка:', filePath, e.message);
    }
  }
  console.log('Готово. Успешно:', ok, 'Ошибок:', err);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
