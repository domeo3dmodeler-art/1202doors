/**
 * Переименование папки «наличники вестстайл» из NFD в NFC.
 * На диске папка может быть в NFD (буква «й» как и+бреве), ссылки в Excel и URL — в NFC.
 * После переименования запросы по URL будут находить файлы.
 *
 * Запуск: npx tsx scripts/fix-architrave-folder-nfc.ts [--dry-run]
 */
import * as path from 'path';
import * as fs from 'fs';

const PUBLIC_ROOT = path.join(__dirname, '..', 'public');
const NALICHNIKI_BASE = path.join(PUBLIC_ROOT, 'uploads', 'final-filled', 'Наличники');

function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!fs.existsSync(NALICHNIKI_BASE)) {
    console.error('Папка Наличники не найдена:', NALICHNIKI_BASE);
    process.exit(1);
  }
  const dirs = fs.readdirSync(NALICHNIKI_BASE);
  const targetNameNFC = 'наличники вестстайл';
  const actualDir = dirs.find((d) => d.normalize('NFC') === targetNameNFC && d !== targetNameNFC);
  if (!actualDir) {
    console.log('Папка «наличники вестстайл» уже в NFC или не найдена. Выход.');
    return;
  }
  const oldPath = path.join(NALICHNIKI_BASE, actualDir);
  const newPath = path.join(NALICHNIKI_BASE, targetNameNFC);
  if (fs.existsSync(newPath)) {
    console.error('Целевая папка уже существует:', newPath);
    process.exit(1);
  }
  console.log('Переименование (NFD → NFC):');
  console.log('  Из:', actualDir);
  console.log('  В: ', targetNameNFC);
  if (dryRun) {
    console.log('[dry-run] Выполните без --dry-run для применения.');
    return;
  }
  fs.renameSync(oldPath, newPath);
  console.log('Готово.');
}

main();
