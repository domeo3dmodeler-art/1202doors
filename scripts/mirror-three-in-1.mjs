/**
 * Отразить 3 файла в final-filled/1 по горизонтали (чтение через fs).
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, '..', 'public', 'uploads', 'final-filled', '1');

const FILES = [
  'handle_COLUMN_белыйчерный_никель_main.webp',
  'handle_FLOU_матовый_хром_main.jpg',
  'handle_MOSAIC_MH-11-ХРОМ_main.webp',
];

async function main() {
  for (const name of FILES) {
    const filePath = path.join(DIR, name);
    if (!fs.existsSync(filePath)) {
      console.log('Нет файла:', name);
      continue;
    }
    try {
      const inputBuf = fs.readFileSync(filePath);
      const outBuf = await sharp(inputBuf).flop().toBuffer();
      fs.writeFileSync(filePath, outBuf);
      console.log('OK:', name);
    } catch (e) {
      console.error('Ошибка:', name, e.message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
