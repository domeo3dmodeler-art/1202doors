/**
 * Точечное отражение по горизонтали только фото двух моделей:
 *   DomeoDoors_Quantum_2
 *   DomeoDoors_Meteor_1
 * Ищет в папках Цвет и Наличники (и при необходимости во всём final-filled).
 * Запуск: node scripts/mirror-quantum-meteor-only.mjs
 */

import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = path.join(__dirname, '..', 'public', 'uploads', 'final-filled');

const FOLDERS = ['Цвет', 'Наличники'];

/** Отражаем только файлы, в имени которых есть одна из этих подстрок (в папках имена без префикса DomeoDoors_) */
const INCLUDE_PATTERNS = ['Quantum_2', 'Meteor_1'];

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.tif']);

function shouldMirror(fileName) {
  return INCLUDE_PATTERNS.some((p) => fileName.includes(p));
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
  let totalErr = 0;

  for (const folderName of FOLDERS) {
    const dir = path.join(BASE, folderName);
    if (!fs.existsSync(dir)) continue;
    for (const filePath of walkDir(dir)) {
      const fileName = path.basename(filePath);
      if (!shouldMirror(fileName)) continue;
      try {
        const inputBuf = fs.readFileSync(filePath);
        const outBuf = await sharp(inputBuf).flop().toBuffer();
        fs.writeFileSync(filePath, outBuf);
        totalOk++;
        console.log('Отражено:', fileName);
      } catch (e) {
        totalErr++;
        console.error('Ошибка:', filePath, e.message);
      }
    }
  }

  console.log('\nГотово. Отражено:', totalOk, 'Ошибок:', totalErr);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
