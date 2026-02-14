/**
 * Отразить 3 файла, которые не удалось переименовать (запись через буфер).
 * Запуск: node scripts/mirror-three-remaining.mjs
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', 'public', 'uploads', 'final-filled');

const REMAINING = [
  path.join(ROOT, '04_Ручки_Завертки', 'handle_COLUMN_белыйчерный_никель_main.webp'),
  path.join(ROOT, '04_Ручки_Завертки', 'handle_MOSAIC_MH-11-ХРОМ_main.webp'),
  path.join(ROOT, 'Цвет', 'Дверь_Se16_ДО_ПВХ_Облачная_завеса_cover.webp'),
];

async function main() {
  for (const filePath of REMAINING) {
    if (!fs.existsSync(filePath)) {
      console.log('Нет файла:', filePath);
      continue;
    }
    try {
      const buf = await sharp(filePath).flop().toBuffer();
      fs.writeFileSync(filePath, buf);
      console.log('OK:', path.basename(filePath));
    } catch (e) {
      console.error('Ошибка:', filePath, e.message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
