/**
 * Зеркальное отражение по горизонтали 6 файлов Rimini_12 и Molis_1 в папке Цвет.
 * Запуск: npx tsx scripts/mirror-rimini-molis-cover.ts [--dry-run]
 */
import * as path from 'path';
import * as fs from 'fs';
import sharp from 'sharp';

const BASE_DIR = path.join(process.cwd(), 'public', 'uploads', 'final-filled', 'Цвет');

const FILES = [
  'Дверное_полотно_Rimini_12_ПГ_кр._Эмаль_Белоснежный_cover.png',
  'Дверное_полотно_Rimini_12_ПГ_кр._Эмаль_Кремово-белый_cover.png',
  'Дверное_полотно_Rimini_12_ПГ_кр._Эмаль_Телегрей_(RAL_7047)_cover.png',
  'Дверь_Molis_1_эмаль_ДГ_Исполнение_Эмаль_Агат_(Ral_7038)_cover.png',
  'Дверь_Molis_1_эмаль_ДГ_Исполнение_Эмаль_Белый_(RAL_9003)_cover.png',
  'Дверь_Molis_1_эмаль_ДГ_Исполнение_Эмаль_Белый_(RAL_9010)_cover.png',
];

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!fs.existsSync(BASE_DIR)) {
    console.error('Папка не найдена:', BASE_DIR);
    process.exit(1);
  }
  console.log('Отразить по горизонтали:', FILES.length, 'файлов\n');
  for (const filename of FILES) {
    const fullPath = path.join(BASE_DIR, filename);
    if (!fs.existsSync(fullPath)) {
      console.log('Пропуск (нет файла):', filename);
      continue;
    }
    if (dryRun) {
      console.log('[dry-run]', filename);
      continue;
    }
    try {
      const inputBuffer = await fs.promises.readFile(fullPath);
      const outputBuffer = await sharp(inputBuffer).flop().toBuffer();
      await fs.promises.writeFile(fullPath, outputBuffer);
      console.log('OK:', filename);
    } catch (e) {
      console.error('Ошибка:', filename, e instanceof Error ? e.message : e);
    }
  }
  console.log('\nГотово.');
}

main().catch((e) => { console.error(e); process.exit(1); });
