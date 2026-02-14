/**
 * Зеркальное отражение по горизонтали точечно указанных файлов в папке Цвет.
 * Запуск: npx tsx scripts/mirror-color-photos-point.ts [--dry-run]
 */
import * as path from 'path';
import * as fs from 'fs';
import sharp from 'sharp';

const BASE_DIR = path.join(process.cwd(), 'public', 'uploads', 'final-filled', 'Цвет');

const FILES_TO_MIRROR = [
  'Pearl_6_Белоснежный.png',
  'Pearl_6_Кремово-белый.png',
  'Pearl_6_Телегрей (RAL 7047).png',
  'Pearl_7_Белоснежный.png',
  'Pearl_7_Кремово-белый.png',
  'Pearl_7_телегрей.png',
  'Quantum_6_Синий (NCS S 6010-B10G).PNG',
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

  console.log('=== Зеркальное отражение по горизонтали (точечно) ===\n');
  console.log('Папка:', BASE_DIR);
  console.log('Файлов к обработке:', FILES_TO_MIRROR.length);
  if (dryRun) console.log('Режим: --dry-run (файлы не изменяются)\n');

  let ok = 0;
  let missing = 0;
  let err = 0;

  for (const filename of FILES_TO_MIRROR) {
    const fullPath = path.join(BASE_DIR, filename);
    if (!fs.existsSync(fullPath)) {
      console.log('Пропуск (нет файла):', filename);
      missing++;
      continue;
    }

    if (dryRun) {
      console.log('[dry-run] отразить:', filename);
      ok++;
      continue;
    }

    try {
      const inputBuffer = await fs.promises.readFile(fullPath);
      const outputBuffer = await sharp(inputBuffer)
        .flop() // отражение по горизонтали
        .toBuffer();
      await fs.promises.writeFile(fullPath, outputBuffer);
      console.log('OK:', filename);
      ok++;
    } catch (e) {
      console.error('Ошибка:', filename, e instanceof Error ? e.message : e);
      err++;
    }
  }

  console.log('\n---');
  console.log('Отражено:', ok, '| Не найдено:', missing, '| Ошибки:', err);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
