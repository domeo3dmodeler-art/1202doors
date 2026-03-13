/**
 * Нормализация имён файлов в public/uploads в Unicode NFC.
 * После запуска и последующей синхронизации uploads на ВМ Nginx try_files будет находить файлы по путям из API (NFC) — раздача с диска без Node, без OOM.
 *
 * Запуск локально (до синхронизации на ВМ):
 *   npx tsx scripts/normalize-uploads-nfc.ts
 * Затем: .\scripts\sync-uploads-to-vm.ps1 (или sync-final-filled-to-vm.ps1).
 */
import { readdirSync, renameSync, statSync } from 'fs';
import { join, dirname, basename } from 'path';

const UPLOADS = join(process.cwd(), 'public', 'uploads');
const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|svg|ico)$/i;

function walkDir(dir: string): string[] {
  const out: string[] = [];
  try {
    if (!statSync(dir).isDirectory()) return out;
  } catch {
    return out;
  }
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, name.name);
    if (name.isDirectory()) {
      out.push(...walkDir(full));
    } else if (name.isFile() && IMAGE_EXT.test(name.name)) {
      out.push(full);
    }
  }
  return out;
}

function main(): void {
  console.log('Normalizing filenames in public/uploads to NFC...');
  const files = walkDir(UPLOADS);
  let renamed = 0;
  for (const full of files) {
    const dir = dirname(full);
    const name = basename(full);
    const nfc = name.normalize('NFC');
    if (nfc !== name) {
      const dest = join(dir, nfc);
      try {
        renameSync(full, dest);
        renamed++;
        console.log(`  ${name} -> ${nfc}`);
      } catch (e) {
        console.error(`  FAIL: ${full}`, e);
      }
    }
  }
  console.log(`Done. Renamed ${renamed} of ${files.length} files.`);
}

main();
