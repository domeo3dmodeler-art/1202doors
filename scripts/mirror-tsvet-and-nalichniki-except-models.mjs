/**
 * Зеркальное отражение по горизонтали всех фото в двух папках:
 *   public/uploads/final-filled/Цвет
 *   public/uploads/final-filled/Наличники
 * КРОМЕ фото моделей из списка (по скрину):
 *   - Дверное полотно Rimini 12 ПО
 *   - Дверное полотно Rimini 2 ПО
 *   - Дверь Enigma 2 ДГ
 *   - Дверь Molis 1 эмаль ДГ
 * Запуск: node scripts/mirror-tsvet-and-nalichniki-except-models.mjs
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.join(__dirname, '..', 'public', 'uploads', 'final-filled');

/** Папки для обработки: Цвет и Наличники — отдельно */
const FOLDERS = ['Цвет', 'Наличники'];

/**
 * Подстроки в имени файла, при наличии любой из которых файл НЕ отражаем.
 * Соответствие списку: Rimini 12 ПО, Rimini 2 ПО, Enigma 2 ДГ, Molis 1 эмаль ДГ.
 */
const EXCLUDE_PATTERNS = [
  'rimini 12',
  'rimini_12',
  'rimini12',
  'rimini 2 по',
  'rimini_2_по',
  'enigma 2 дг',
  'enigma_2_дг',
  'molis 1 эмаль дг',
  'molis_1_эмаль_дг',
  'molis 1 эмаль',
  'molis_1_эмаль',
];

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.tif']);

function shouldSkipMirror(fileName) {
  const normalized = fileName.toLowerCase().replace(/[-_]/g, ' ');
  return EXCLUDE_PATTERNS.some((p) => normalized.includes(p.toLowerCase()));
}

function* walkDir(dir) {
  if (!fs.existsSync(dir)) return;
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
  let totalOk = 0;
  let totalSkipped = 0;
  let totalErr = 0;

  for (const folderName of FOLDERS) {
    const dir = path.join(BASE, folderName);
    if (!fs.existsSync(dir)) {
      console.log('Папка не найдена, пропуск:', dir);
      continue;
    }
    const files = [...walkDir(dir)];
    console.log('\n---', folderName, '---');
    console.log('Найдено изображений:', files.length);

    for (const filePath of files) {
      const fileName = path.basename(filePath);
      if (shouldSkipMirror(fileName)) {
        totalSkipped++;
        console.log('Пропуск (модель из списка):', fileName);
        continue;
      }
      try {
        const inputBuf = fs.readFileSync(filePath);
        const outBuf = await sharp(inputBuf).flop().toBuffer();
        fs.writeFileSync(filePath, outBuf);
        totalOk++;
        if (totalOk % 50 === 0) console.log('Отражено:', totalOk);
      } catch (e) {
        totalErr++;
        console.error('Ошибка:', filePath, e.message);
      }
    }
  }

  console.log('\nГотово. Отражено:', totalOk, 'Пропущено (модели из списка):', totalSkipped, 'Ошибок:', totalErr);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
