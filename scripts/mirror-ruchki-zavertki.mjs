/**
 * Отразить все фото в final-filled/04_Ручки_Завертки по горизонтали.
 * Путь задан в коде из-за кириллицы в имени папки.
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', 'public', 'uploads', 'final-filled', '04_Ручки_Завертки');

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

async function processFile(filePath) {
  try {
    const inputBuf = fs.readFileSync(filePath);
    const outBuf = await sharp(inputBuf).flop().toBuffer();
    fs.writeFileSync(filePath, outBuf);
    return true;
  } catch (e) {
    console.error('Ошибка:', filePath, e.message);
    return false;
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
    if (await processFile(filePath)) ok++;
    else err++;
    if ((ok + err) % 50 === 0) console.log('Обработано:', ok + err);
  }
  console.log('Готово. Успешно:', ok, 'Ошибок:', err);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
