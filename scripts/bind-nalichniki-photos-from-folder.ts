/**
 * Привязка фото наличников к товарам в БД по Excel и структуре папок.
 * Правило: Поставщик из Excel → папка (Фрамир → «наличники фрамир», ВестСтайл → «наличники вестстайл», Юркас → «портика_юркас»).
 * Имя из Excel «Прямой 70мм» соответствует файлу «Прямой 70 мм.png» (пробел перед «мм» в имени файла).
 *
 * Запуск: npx tsx scripts/bind-nalichniki-photos-from-folder.ts [--dry-run]
 */
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

const prisma = new PrismaClient();
const FILE_PATH = path.join(__dirname, '..', '1002', 'final_filled 30.01.xlsx');
const NAL_DIR = path.join(__dirname, '..', 'public', 'uploads', 'final-filled', 'Наличники');

function getColumn(row: Record<string, unknown>, logicalName: string): string {
  const need = logicalName.replace(/\s+/g, ' ').trim();
  for (const k of Object.keys(row)) {
    if (k.replace(/\s+/g, ' ').trim() === need) return String(row[k] ?? '').trim();
  }
  return String(row[logicalName] ?? '').trim();
}

function slug(str: string): string {
  return String(str)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\wа-яё_-]/gi, '')
    .slice(0, 80) || 'item';
}

/** Нормализовать имя для сравнения с папкой/файлом: Unicode NFC, нижний регистр, схлопнуть пробелы, убрать кавычки */
function norm(s: string): string {
  return (
    (typeof s.normalize === 'function' ? s.normalize('NFC') : s)
    .replace(/\u00a0/g, ' ')
    .replace(/\\"/g, '')
    .replace(/^["'\u201c\u201d\s]+|["'\u201c\u201d\s]+$/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  );
}

/** Нормализовать название наличника для сопоставления с именем файла (мм без пробела/с пробелом) */
function normName(s: string): string {
  return norm(s)
    .replace(/\s*мм\s*/gi, ' мм ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Поставщик из Excel → имя папки на диске (как в структуре пользователя) */
function supplierToFolderName(excelSupplier: string): string {
  const s = norm(excelSupplier);
  if (/юркас|портика/i.test(s)) return 'портика_юркас';
  return 'наличники ' + s;
}

/** Найти подпапку по поставщику: сначала точное совпадение по правилу, затем по списку существующих папок */
function findSupplierSubdir(excelSupplier: string, subdirs: string[]): string | null {
  const expected = supplierToFolderName(excelSupplier);
  if (subdirs.includes(expected)) return expected;
  const n = norm(excelSupplier);
  if (!n) return null;
  for (const d of subdirs) {
    const dn = norm(d);
    if (dn === n || dn.includes(n) || n.includes(dn)) return d;
    if (dn.replace(/^наличники\s+/i, '').replace(/\s/g, '') === n.replace(/\s/g, '')) return d;
    const dnLetters = dn.replace(/[^\wа-яё]/gi, '');
    const nLetters = n.replace(/[^\wа-яё]/gi, '');
    if (dnLetters.includes(nLetters) || nLetters.includes(dnLetters)) return d;
  }
  return null;
}

/** Нормализовать для сравнения названия: убрать пробелы вокруг "мм", схлопнуть все пробелы в один */
function normNameForMatch(s: string): string {
  return norm(s)
    .replace(/\s*мм\s*/gi, 'мм')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Жёсткая нормализация для сравнения: только буквы, цифры, без пробелов (латинскую m приравниваем к кириллической м) */
function normStrict(s: string): string {
  return normNameForMatch(s)
    .replace(/\s/g, '')
    .replace(/\u006d/g, '\u043c')
    .replace(/[^\wа-яё0-9]/gi, '');
}

/** Варианты названия для сопоставления (Ерте ↔ Эрте в Excel и в имени файла) */
function nameVariants(s: string): string[] {
  const n = normNameForMatch(s);
  const out = [n];
  if (n.includes('ерте') && !n.includes('эрте')) out.push(n.replace(/ерте/gi, 'эрте'));
  if (n.includes('эрте') && !n.includes('ерте')) out.push(n.replace(/эрте/gi, 'ерте'));
  return out;
}

/** Найти файл по названию наличника. Excel «Прямой 70мм» ↔ файл «Прямой 70 мм.png»; «Ерте 100мм» ↔ «Эрте 100 мм.png». */
function findPhotoFile(dirPath: string, name: string): string | null {
  if (!fs.existsSync(dirPath)) return null;
  const variants = nameVariants(name);
  const nStrict = normStrict(name);
  const files = fs.readdirSync(dirPath);
  for (const f of files) {
    const base = path.basename(f, path.extname(f));
    const baseKey = normNameForMatch(base);
    const baseStrict = normStrict(base);
    if (variants.some((v) => v === baseKey) || baseStrict === nStrict) return f;
    if (norm(base) === norm(name)) return f;
    if (nameVariants(base).some((v) => variants.includes(v))) return f;
  }
  return null;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (!fs.existsSync(FILE_PATH)) {
    console.error('Файл не найден:', FILE_PATH);
    process.exit(1);
  }
  if (!fs.existsSync(NAL_DIR)) {
    console.error('Папка не найдена:', NAL_DIR);
    process.exit(1);
  }

  const workbook = XLSX.readFile(FILE_PATH, { raw: false });
  const ws = workbook.Sheets['Наличники'];
  if (!ws) {
    console.error('Лист «Наличники» не найден');
    process.exit(1);
  }
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
  const subdirs = fs.readdirSync(NAL_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

  const nalichnikiCatId = await prisma.catalogCategory.findFirst({ where: { name: 'Наличники' }, select: { id: true } });
  if (!nalichnikiCatId) {
    console.error('Категория «Наличники» не найдена в БД');
    process.exit(1);
  }

  let bound = 0;
  let skip = 0;
  for (const row of rows) {
    const name = getColumn(row, 'Наличник: Название');
    let supplier = getColumn(row, 'Поставщик');
    supplier = supplier.replace(/^[\s"\u201c\u201d\u00ab\u00bb]+|[\s"\u201c\u201d\u00ab\u00bb]+$/g, '');
    if (!name) continue;

    let supplierDir = findSupplierSubdir(supplier, subdirs);
    let dirPath = '';
    let fileName: string | null = null;
    if (supplierDir) {
      dirPath = path.join(NAL_DIR, supplierDir);
      fileName = findPhotoFile(dirPath, name);
    }
    if (!fileName) {
      for (const d of subdirs) {
        const dp = path.join(NAL_DIR, d);
        fileName = findPhotoFile(dp, name);
        if (fileName) {
          supplierDir = d;
          dirPath = dp;
          break;
        }
      }
    } else if (supplierDir) {
      dirPath = path.join(NAL_DIR, supplierDir);
    }
    if (!fileName) {
      console.warn('Пропуск (нет файла):', supplierDir || supplier, '—', name);
      skip++;
      continue;
    }
    if (!supplierDir && dirPath) supplierDir = path.basename(dirPath);
    const relPath = `Наличники/${supplierDir}/${fileName}`.replace(/\\/g, '/');
    const photoUrl = `/uploads/final-filled/${relPath}`;

    // SKU как в import-final-filled: nal_<поставщик>_<название>
    const sku = `nal_${slug(supplier || 'unknown')}_${slug(name)}`;
    let product = await prisma.product.findFirst({
      where: { sku, catalog_category_id: nalichnikiCatId.id },
      select: { id: true },
    });
    if (!product) {
      const byName = await prisma.product.findFirst({
        where: { name, catalog_category_id: nalichnikiCatId.id },
        select: { id: true },
      });
      if (byName) product = byName;
    }
    if (!product) {
      const variants = nameVariants(name);
      const allNal = await prisma.product.findMany({
        where: { catalog_category_id: nalichnikiCatId.id },
        select: { id: true, name: true, sku: true },
      });
      product = allNal.find((p) => p.sku === sku || variants.includes(normNameForMatch(p.name))) ?? null;
    }
    if (!product) {
      console.warn('Товар не найден в БД:', sku, name);
      skip++;
      continue;
    }

    if (dryRun) {
      console.log('[dry-run]', sku, '→', photoUrl);
      bound++;
      continue;
    }

    const existing = await prisma.productImage.findFirst({ where: { product_id: product.id } });
    if (existing) {
      await prisma.productImage.update({ where: { id: existing.id }, data: { url: photoUrl } });
    } else {
      await prisma.productImage.create({
        data: {
          product_id: product.id,
          filename: fileName,
          original_name: fileName,
          url: photoUrl,
          mime_type: 'image/png',
          is_primary: true,
          sort_order: 0,
        },
      });
    }
    bound++;
    console.log('OK:', name, '→', relPath);
  }

  console.log('\nИтого: привязано', bound, 'пропущено', skip);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
