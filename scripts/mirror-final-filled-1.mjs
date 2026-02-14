/**
 * Отразить все фото в final-filled/1 по горизонтали.
 * Чтение через fs.readFileSync, чтобы обойти блокировки (все файлы обрабатываются так).
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', 'public', 'uploads', 'final-filled', '1');

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
  let ok = 0;
  let err = 0;
  for (const filePath of files) {
    try {
      const inputBuf = fs.readFileSync(filePath);
      const outBuf = await sharp(inputBuf).flop().toBuffer();
      fs.writeFileSync(filePath, outBuf);
      ok++;
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
