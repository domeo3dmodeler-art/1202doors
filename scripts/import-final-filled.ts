/**
 * Импорт данных из final_filled 30.01.xlsx в Product и ProductImage.
 * Ожидает: дерево каталога создано (scripts/seed-catalog-tree.ts).
 * ID категорий берутся из scripts/catalog-tree-ids.json или из БД по имени.
 *
 * Опции:
 *   --dry-run     только показать, что будет сделано
 *   --no-doors           не импортировать двери (только наличники, фурнитура, ручки, ограничители)
 *   --only-nalichniki    импортировать только наличники (лист «Наличники»)
 *
 * Запуск: npx tsx scripts/import-final-filled.ts [--dry-run] [--no-doors] [--only-nalichniki]
 *
 * Лист «04 Ручки Завертки» — маппинг:
 *   Цена ручки  = колонка «Цена продажи (руб)» → base_price, Domeo_цена группы Web, Цена продажи (руб)
 *   Цена завертки = колонка «Завертка, цена РРЦ» → properties_data['Завертка, цена РРЦ'] (число)
 *   Ожидаемые колонки: см. scripts/audit-excel-sheets.ts → '04 Ручки Завертки'
 */
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import { DOOR_COLOR_PROPERTY, upsertPropertyPhoto } from '../lib/property-photos';

const prisma = new PrismaClient();

const FILE_PATH = path.join(__dirname, '..', '1002', 'final_filled 30.01.xlsx');
const IDS_PATH = path.join(__dirname, 'catalog-tree-ids.json');

function loadCategoryIds(): Record<string, string> {
  if (fs.existsSync(IDS_PATH)) {
    return JSON.parse(fs.readFileSync(IDS_PATH, 'utf8'));
  }
  throw new Error(
    `Файл ${IDS_PATH} не найден. Сначала выполните: npx tsx scripts/seed-catalog-tree.ts`
  );
}

async function getCategoryIdsFromDb(): Promise<Record<string, string>> {
  const names = [
    'Каталог',
    'Межкомнатные двери',
    'Наличники',
    'Комплекты фурнитуры',
    'Ручки и завертки',
    'Ограничители',
  ];
  const list = await prisma.catalogCategory.findMany({
    where: { name: { in: names } },
    select: { id: true, name: true },
  });
  const out: Record<string, string> = {};
  list.forEach((c) => {
    out[c.name] = c.id;
  });
  return out;
}

function slug(str: string): string {
  return String(str)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\wа-яё_-]/gi, '')
    .slice(0, 80) || 'item';
}

function parseNum(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(String(v).replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function buildDoorSku(
  code: string,
  modelName: string,
  width: number,
  height: number,
  coatingSlug: string
): string {
  return `door_${slug(code)}_${slug(modelName)}_${width}_${height}_${coatingSlug}`;
}

function buildLegacyDoorSku(
  code: string,
  width: number,
  height: number,
  coatingSlug: string
): string {
  return `door_${slug(code)}_${width}_${height}_${coatingSlug}`;
}

/** Получить значение ячейки по логическому имени столбца (совпадение после trim и схлопывания пробелов). */
function getColumn(row: Record<string, unknown>, logicalName: string): string {
  const need = logicalName.replace(/\s+/g, ' ').trim();
  for (const k of Object.keys(row)) {
    if (k.replace(/\s+/g, ' ').trim() === need) return String(row[k] ?? '').trim();
  }
  return String(row[logicalName] ?? '').trim();
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const noDoors = process.argv.includes('--no-doors');
  const onlyNalichniki = process.argv.includes('--only-nalichniki');

  if (!fs.existsSync(FILE_PATH)) {
    console.error('Файл не найден:', FILE_PATH);
    process.exit(1);
  }

  let ids: Record<string, string>;
  try {
    ids = loadCategoryIds();
  } catch {
    ids = await getCategoryIdsFromDb();
  }
  const doorsCatId = ids['Межкомнатные двери'];
  const nalichnikiCatId = ids['Наличники'];
  const furnituraCatId = ids['Комплекты фурнитуры'];
  const ruchkiCatId = ids['Ручки и завертки'];
  const limitersCatId = ids['Ограничители'];

  if (!nalichnikiCatId) {
    console.error('Не найден ID категории «Наличники». Запустите seed-catalog-tree.ts');
    process.exit(1);
  }
  if (!onlyNalichniki && (!furnituraCatId || !ruchkiCatId || !limitersCatId)) {
    console.error('Не найдены ID категорий (фурнитура/ручки/ограничители). Запустите seed-catalog-tree.ts');
    process.exit(1);
  }

  const workbook = XLSX.readFile(FILE_PATH, { cellDates: true, raw: false });
  const toJson = (sheetName: string) => {
    const ws = workbook.Sheets[sheetName];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
      defval: '',
      raw: false,
    });
  };

  let stats = { nalichniki: 0, furnitura: 0, ruchki: 0, limiters: 0, doors: 0, doorColors: 0, images: 0 };

  // ——— Наличники ———
  // SKU включает поставщика: у разных поставщиков бывают одинаковые названия (Прямой 70мм и т.д.), без поставщика один перезаписывал бы другого.
  const nalichnikiRows = toJson('Наличники');
  for (const row of nalichnikiRows) {
    const name = getColumn(row, 'Наличник: Название');
    const desc = String(row['Наличник: Описание'] ?? '').trim();
    const photoUrl = String(row['Наличник: Фото (ссылка)'] ?? '').trim();
    const supplier = String(row['Поставщик'] ?? '').trim();
    if (!name) continue;
    const sku = `nal_${slug(supplier || 'unknown')}_${slug(name)}`;
    if (dryRun) {
      console.log('[dry-run] Наличник:', sku, name);
      stats.nalichniki++;
      if (photoUrl) stats.images++;
      continue;
    }
    const product = await prisma.product.upsert({
      where: { sku },
      create: {
        catalog_category_id: nalichnikiCatId,
        sku,
        name,
        description: desc || null,
        base_price: 0,
        properties_data: JSON.stringify({
          Поставщик: supplier || null,
          'Наличник: Фото (ссылка)': photoUrl || null,
          'Фото (ссылка)': photoUrl || null,
        }),
        dimensions: '{}',
      },
      update: {
        name,
        description: desc || null,
        properties_data: JSON.stringify({
          Поставщик: supplier || null,
          'Наличник: Фото (ссылка)': photoUrl || null,
          'Фото (ссылка)': photoUrl || null,
        }),
      },
    });
    stats.nalichniki++;
    if (photoUrl) {
      const existing = await prisma.productImage.findFirst({
        where: { product_id: product.id },
      });
      if (!existing) {
        await prisma.productImage.create({
          data: {
            product_id: product.id,
            filename: `nal_${product.id}.jpg`,
            original_name: 'nalichnik.jpg',
            url: photoUrl,
            mime_type: 'image/jpeg',
            is_primary: true,
            sort_order: 0,
          },
        });
        stats.images++;
      }
    }
  }
  console.log('Наличники:', stats.nalichniki);

  if (onlyNalichniki) {
    console.log('Импорт только наличников завершён.');
    return;
  }

  // ——— Фурнитура ———
  const furnituraRows = toJson('Фурнитура');
  for (const row of furnituraRows) {
    const name = String(row['Комплект фурнитуры: Название'] ?? '').trim();
    const desc = String(row['Описание'] ?? '').trim();
    const price = parseNum(row['Цена']);
    if (!name) continue;
    const sku = `kit_${slug(name)}`;
    if (dryRun) {
      console.log('[dry-run] Фурнитура:', sku, name, price);
      stats.furnitura++;
      continue;
    }
    await prisma.product.upsert({
      where: { sku },
      create: {
        catalog_category_id: furnituraCatId,
        sku,
        name,
        description: desc || null,
        base_price: price,
        properties_data: '{}',
        dimensions: '{}',
      },
      update: { name, description: desc || null, base_price: price },
    });
    stats.furnitura++;
  }
  console.log('Фурнитура:', stats.furnitura);

  // ——— Ручки и завертки ———
  // Цена ручки = Цена продажи (руб). Цена завертки = Завертка, цена РРЦ.
  const ruchkiRows = toJson('04 Ручки Завертки');
  for (const row of ruchkiRows) {
    const name = String(row['Название (Domeo_наименование для Web)'] ?? '').trim();
    const desc = String(row['Описание'] ?? '').trim();
    const priceRrc = parseNum(row['Цена РРЦ (руб)']);
    const priceSale = parseNum(row['Цена продажи (руб)']);
    const pricePurchase = parseNum(row['Цена закупки (руб)']);
    const backplateRrc = parseNum(row['Завертка, цена РРЦ']);
    const sortOrder = parseInt(String(row['Порядок сортировки'] ?? '').trim(), 10);
    const photoUrl = String(row['Фото (ссылка)'] ?? '').trim();
    const photoZaverтка = String(row['Фото завертки (ссылка)'] ?? '').trim();
    const active = String(row['Активна (Да/Нет)'] ?? '').toLowerCase().includes('да');
    if (!name) continue;
    const sku = `handle_${slug(name)}`;
    if (dryRun) {
      console.log('[dry-run] Ручка:', sku, name, 'продажа:', priceSale, 'завертка:', backplateRrc);
      stats.ruchki++;
      if (photoUrl) stats.images++;
      if (photoZaverтка) stats.images++;
      continue;
    }
    const propsData = {
      'Тип (Ручка/Завертка)': row['Тип (Ручка/Завертка)'],
      Группа: row['Группа'],
      'Завертка, цена РРЦ': backplateRrc,
      'Цена продажи (руб)': priceSale,
      'Цена РРЦ (руб)': priceRrc,
      'Цена закупки (руб)': pricePurchase,
      'Порядок сортировки': Number.isNaN(sortOrder) ? null : sortOrder,
      'Domeo_цена группы Web': priceSale,
    };
    const product = await prisma.product.upsert({
      where: { sku },
      create: {
        catalog_category_id: ruchkiCatId,
        sku,
        name,
        description: desc || null,
        base_price: priceSale,
        is_active: active,
        properties_data: JSON.stringify(propsData),
        dimensions: '{}',
      },
      update: {
        name,
        description: desc || null,
        base_price: priceSale,
        is_active: active,
        properties_data: JSON.stringify(propsData),
      },
    });
    stats.ruchki++;
    const existingImages = await prisma.productImage.findMany({
      where: { product_id: product.id },
      orderBy: { sort_order: 'asc' },
    });
    if (photoUrl && !existingImages.some((i) => i.url === photoUrl)) {
      await prisma.productImage.create({
        data: {
          product_id: product.id,
          filename: `handle_${product.id}_main.jpg`,
          original_name: 'handle.jpg',
          url: photoUrl,
          mime_type: 'image/jpeg',
          is_primary: true,
          sort_order: 0,
        },
      });
      stats.images++;
    }
    if (photoZaverтка && !existingImages.some((i) => i.url === photoZaverтка)) {
      await prisma.productImage.create({
        data: {
          product_id: product.id,
          filename: `handle_${product.id}_zav.jpg`,
          original_name: 'zaverтка.jpg',
          url: photoZaverтка,
          mime_type: 'image/jpeg',
          is_primary: false,
          sort_order: 1,
        },
      });
      stats.images++;
    }
  }
  console.log('Ручки и завертки:', stats.ruchki);

  // ——— Ограничители ———
  const limitersRows = toJson('05 Ограничители');
  for (const row of limitersRows) {
    const name = String(row['Название'] ?? '').trim();
    const desc = String(row['Описание'] ?? '').trim();
    const priceRrc = parseNum(row['Цена РРЦ (руб)']);
    const priceOpt = parseNum(row['Цена опт (руб)']);
    const sourceId = String(row['ID товара'] ?? '').trim();
    const photoUrl = String(row['Фото (путь)'] ?? '').trim();
    if (!name) continue;
    const sku = `lim_${slug(name)}`;
    if (dryRun) {
      console.log('[dry-run] Ограничитель:', sku, name);
      stats.limiters++;
      if (photoUrl) stats.images++;
      continue;
    }
    const product = await prisma.product.upsert({
      where: { sku },
      create: {
        catalog_category_id: limitersCatId,
        sku,
        name,
        description: desc || null,
        base_price: priceRrc,
        properties_data: JSON.stringify({
          'ID товара': sourceId || null,
          'Цена опт (руб)': priceOpt,
          'Тип (магнитный врезной / напольный / настенный)':
            row['Тип (магнитный врезной / напольный / настенный)'],
        }),
        dimensions: '{}',
      },
      update: {
        name,
        description: desc || null,
        base_price: priceRrc,
        properties_data: JSON.stringify({
          'ID товара': sourceId || null,
          'Цена опт (руб)': priceOpt,
          'Тип (магнитный врезной / напольный / настенный)':
            row['Тип (магнитный врезной / напольный / настенный)'],
        }),
      },
    });
    stats.limiters++;
    if (photoUrl) {
      const exists = await prisma.productImage.findFirst({
        where: { product_id: product.id },
      });
      if (!exists) {
        await prisma.productImage.create({
          data: {
            product_id: product.id,
            filename: `lim_${product.id}.jpg`,
            original_name: 'limiter.jpg',
            url: photoUrl,
            mime_type: 'image/jpeg',
            is_primary: true,
            sort_order: 0,
          },
        });
        stats.images++;
      }
    }
  }
  console.log('Ограничители:', stats.limiters);

  // ——— Двери (Цены базовые, разворот по размерам) + Опции, Стекло, Кромка ———
  if (!noDoors && doorsCatId) {
    const pricesRows = toJson('Цены базовые');
    // Маппинг «Название модели» → «Код модели Domeo (Web)» для слияния по коду в листе «Цвет»
    const modelNameToCode = new Map<string, string>();
    for (const r of pricesRows) {
      const name = getColumn(r, 'Название модели');
      const code = String(r['Код модели Domeo (Web)'] ?? '').trim();
      if (name && code) modelNameToCode.set(name, code);
    }
    const parseList = (s: unknown): number[] => {
      const str = String(s ?? '').trim();
      if (!str) return [];
      return str
        .split(/[,;]/)
        .map((x) => parseInt(x.replace(/\s/g, ''), 10))
        .filter((n) => !isNaN(n) && n > 0);
    };

    // Карты по "Название модели" для слияния с товарами дверей
    const optionsByModel = new Map<string, Record<string, unknown>[]>();
    for (const row of toJson('Опции')) {
      const modelName = getColumn(row, 'Название модели');
      if (!modelName) continue;
      if (!optionsByModel.has(modelName)) optionsByModel.set(modelName, []);
      optionsByModel.get(modelName)!.push({ ...row });
    }
    const glassByModel = new Map<string, string[]>();
    const glassSuppliersByModel = new Map<string, Set<string>>();
    for (const row of toJson('Стекло_доступность')) {
      const modelName = getColumn(row, 'Название модели');
      const color = String(row['Доступные цвета стекол для модели'] ?? '').trim();
      const supplier = String(row['Поставщик'] ?? '').trim();
      if (!modelName || !color) continue;
      if (!glassByModel.has(modelName)) glassByModel.set(modelName, []);
      if (!glassByModel.get(modelName)!.includes(color)) glassByModel.get(modelName)!.push(color);
      if (supplier) {
        if (!glassSuppliersByModel.has(modelName)) glassSuppliersByModel.set(modelName, new Set<string>());
        glassSuppliersByModel.get(modelName)!.add(supplier);
      }
    }
    const optionsSupplierByModel = new Map<string, string>();
    for (const [modelName, rows] of optionsByModel.entries()) {
      const firstSupplier = String(rows[0]?.['Поставщик'] ?? '').trim();
      if (firstSupplier) optionsSupplierByModel.set(modelName, firstSupplier);
    }
    const colorSuppliersByModel = new Map<string, Set<string>>();
    for (const row of toJson('Цвет')) {
      const modelName = getColumn(row, 'Название модели');
      const supplier = String(row['Поставщик'] ?? '').trim();
      if (!modelName || !supplier) continue;
      if (!colorSuppliersByModel.has(modelName)) colorSuppliersByModel.set(modelName, new Set<string>());
      colorSuppliersByModel.get(modelName)!.add(supplier);
    }
    const edgeByModel = new Map<string, Record<string, unknown>>();
    for (const row of toJson('Наценка за кромку')) {
      const modelName = getColumn(row, 'Название модели');
      if (!modelName) continue;
      edgeByModel.set(modelName, { ...row });
    }

    for (const row of pricesRows) {
      const code = String(row['Код модели Domeo (Web)'] ?? '').trim();
      const modelName = getColumn(row, 'Название модели');
      const style = String(row['Стиль Domeo (Web)'] ?? '').trim();
      const heights = parseList(row['Высота, мм']);
      const widths = parseList(row['Ширины, мм']);
      const priceRrc = parseNum(row['Цена РРЦ']);
      const coatingType = String(row['Тип покрытия'] ?? '').trim();
      const coatingSlug = slug(coatingType || 'base');
      if (!code || (!heights.length && !widths.length)) continue;
      const heightList = heights.length ? heights : [2000];
      const widthList = widths.length ? widths : [800];

      const optionsRows = modelName ? optionsByModel.get(modelName) ?? [] : [];
      const firstOption = optionsRows[0] as Record<string, unknown> | undefined;
      const glassList = modelName ? glassByModel.get(modelName) ?? [] : [];
      const glassSuppliers = modelName ? Array.from(glassSuppliersByModel.get(modelName) ?? []) : [];
      const colorSuppliers = modelName ? Array.from(colorSuppliersByModel.get(modelName) ?? []) : [];
      const optionsSupplier = modelName ? optionsSupplierByModel.get(modelName) ?? '' : '';
      const edgeRow = modelName ? edgeByModel.get(modelName) : undefined;

      for (const h of heightList) {
        for (const w of widthList) {
          const sku = buildDoorSku(code, modelName, w, h, coatingSlug);
          const legacySku = buildLegacyDoorSku(code, w, h, coatingSlug);
          const name = `${modelName} ${w}×${h}`;
          const properties: Record<string, unknown> = {
            'Код модели Domeo (Web)': code,
            'Название модели': modelName,
            'Domeo_Название модели для Web': modelName,
            'Артикул поставщика': code,
            'Стиль Domeo (Web)': style,
            'Domeo_Стиль Web': style,
            'Ширина/мм': w,
            'Высота/мм': h,
            'Поставщик': row['Поставщик'],
            'Толщина, мм': row['Толщина, мм'],
            'Тип покрытия': row['Тип покрытия'],
            Стекло: row['Стекло'],
            'Кромка в базе': row['Кромка в базе'],
            'Цена опт': row['Цена опт'],
            'Цена РРЦ': row['Цена РРЦ'],
          };
          if (firstOption) {
            if (optionsSupplier) properties['Domeo_Опции_Поставщик'] = optionsSupplier;
            properties['Domeo_Опции_Название_наполнения'] = firstOption['Название наполнения'];
            properties['Domeo_Опции_Звукоизоляция_дБ'] = firstOption['Звукоизоляция (дБ)'];
            properties['Domeo_Опции_Надбавка_2301_2500_процент'] = firstOption['Надбавка 2301-2500мм (%) к высоте 2000'];
            properties['Domeo_Опции_Надбавка_2501_3000_процент'] = firstOption['Надбавка 2501-3000мм (%) к высоте 2000'];
            properties['Domeo_Опции_Реверс_доступен'] = firstOption['Реверс доступен (Да/Нет)'];
            properties['Domeo_Опции_Надбавка_реверс_руб'] = firstOption['Надбавка за реверс (руб)'];
            properties['Domeo_Опции_Порог_доступен'] = firstOption['Порог доступен (Да/Нет)'];
            properties['Domeo_Опции_Цена_порога_руб'] = firstOption['Цена порога (руб)'];
            properties['Domeo_Опции_Зеркало_доступно'] = firstOption['Зеркало доступно (Да/Нет)'];
            properties['Domeo_Опции_Зеркало_одна_сторона_руб'] = firstOption['Зеркало: Одна сторона (руб)'];
            properties['Domeo_Опции_Зеркало_две_стороны_руб'] = firstOption['Зеркало: Две стороны (руб)'];
            if (optionsRows.length > 0) properties['Domeo_Опции_список'] = optionsRows;
          }
          // Стекло: из листа Стекло_доступность; если модели нет в листе — стекло не доступно (пустой массив)
          if (glassList.length > 0) properties['Domeo_Стекло_доступность'] = glassList;
          else properties['Domeo_Стекло_доступность'] = [];
          if (glassSuppliers.length > 0) properties['Domeo_Стекло_Поставщики'] = glassSuppliers;
          if (colorSuppliers.length > 0) properties['Domeo_Цвет_Поставщики'] = colorSuppliers;

          // Кромка: из листа Наценка за кромку; если модели нет в листе — Кромка включена в базовую цену = Нет (правило ПО)
          if (edgeRow) {
            properties['Domeo_Кромка_в_базе_включена'] = edgeRow['Кромка включена в базовую цену (Да/Нет)'];
            properties['Domeo_Кромка_базовая_цвет'] = edgeRow['Базовая кромка (самая дешевая), Цвет'];
            properties['Domeo_Кромка_опции_доступны'] = edgeRow['Опции кромки доступны (Да/Нет)'];
            properties['Domeo_Кромка_наценка_как_опция'] = edgeRow['Наценка за кромку как за опцию'];
            properties['Domeo_Кромка_Цвет_2'] = edgeRow['Цвет 2'];
            properties['Domeo_Кромка_Наценка_Цвет_2'] = edgeRow['Наценка за Цвет 2'];
            properties['Domeo_Кромка_Цвет_3'] = edgeRow['Цвет 3'];
            properties['Domeo_Кромка_Наценка_Цвет_3'] = edgeRow['Наценка за Цвет 3'];
            properties['Domeo_Кромка_Цвет_4'] = edgeRow['Цвет 4'];
            properties['Domeo_Кромка_Наценка_Цвет_4'] = edgeRow['Наценка за Цвет 4'];
          } else {
            properties['Domeo_Кромка_в_базе_включена'] = 'Нет';
          }
          if (dryRun) {
            stats.doors++;
            continue;
          }
          const existingByNewSku = await prisma.product.findUnique({
            where: { sku },
            select: { id: true },
          });
          if (!existingByNewSku && legacySku !== sku) {
            const existingLegacy = await prisma.product.findUnique({
              where: { sku: legacySku },
              select: { id: true },
            });
            if (existingLegacy) {
              await prisma.product.update({
                where: { id: existingLegacy.id },
                data: {
                  sku,
                  name,
                  base_price: priceRrc,
                  properties_data: JSON.stringify(properties),
                  dimensions: JSON.stringify({ width: w, height: h }),
                },
              });
              stats.doors++;
              continue;
            }
          }
          await prisma.product.upsert({
            where: { sku },
            create: {
              catalog_category_id: doorsCatId,
              sku,
              name,
              base_price: priceRrc,
              properties_data: JSON.stringify(properties),
              dimensions: JSON.stringify({ width: w, height: h }),
            },
            update: {
              name,
              base_price: priceRrc,
              properties_data: JSON.stringify(properties),
            },
          });
          stats.doors++;
        }
      }
    }
    console.log('Двери (товары):', stats.doors);

    // ——— Цвет (фото и варианты цветов по модели для конфигуратора) ———
    // Связь с «Цены базовые» только по точному совпадению «Название модели» (должны совпадать на 100%)
    if (doorsCatId) {
      const pricesRowsForValidation = toJson('Цены базовые');
      const modelNamesInPrices = new Set(
        pricesRowsForValidation.map((r) => getColumn(r, 'Название модели')).filter(Boolean)
      );
      const colorRows = toJson('Цвет');
      const modelNamesInColor = new Set<string>();
      const modelNamesInColorNotInPrices: string[] = [];
      for (const row of colorRows) {
        const modelName = getColumn(row, 'Название модели');
        if (!modelName) continue;
        modelNamesInColor.add(modelName);
        if (!modelNamesInPrices.has(modelName)) {
          if (!modelNamesInColorNotInPrices.includes(modelName)) modelNamesInColorNotInPrices.push(modelName);
        }
        if (dryRun) continue;
        const coatingType = String(row['Тип покрытия'] ?? '').trim();
        const colorName = String(row['Цвет/отделка'] ?? '').trim();
        const coverUrl = String(row['Ссылка на обложку'] ?? '').trim();
        const galleryStr = String(row['Ссылки на галерею (через ;)'] ?? '').trim();
        const propertyValue = `${modelName}|${coatingType}|${colorName}`;
        if (coverUrl) {
          await upsertPropertyPhoto(doorsCatId, DOOR_COLOR_PROPERTY, propertyValue, coverUrl, 'cover');
          stats.doorColors++;
        }
        const galleryUrls = galleryStr ? galleryStr.split(';').map((s: string) => s.trim()).filter(Boolean) : [];
        for (let i = 0; i < galleryUrls.length; i++) {
          await upsertPropertyPhoto(doorsCatId, DOOR_COLOR_PROPERTY, propertyValue, galleryUrls[i], `gallery_${i + 1}`);
        }
        // Слияние по коду: дублируем привязку по «Код модели Domeo (Web)», чтобы complete-data находил цвета при расхождении названий
        const modelCode = modelName ? modelNameToCode.get(modelName) : undefined;
        if (modelCode) {
          const propertyValueByCode = `${modelCode}|${coatingType}|${colorName}`;
          if (coverUrl) {
            await upsertPropertyPhoto(doorsCatId, DOOR_COLOR_PROPERTY, propertyValueByCode, coverUrl, 'cover');
          }
          for (let i = 0; i < galleryUrls.length; i++) {
            await upsertPropertyPhoto(doorsCatId, DOOR_COLOR_PROPERTY, propertyValueByCode, galleryUrls[i], `gallery_${i + 1}`);
          }
        }
      }
      if (modelNamesInColorNotInPrices.length > 0) {
        console.warn(
          '⚠ «Цвет»: названия моделей, которых нет в «Цены базовые» (связь не сработает в конфигураторе):',
          modelNamesInColorNotInPrices.slice(0, 20)
        );
        if (modelNamesInColorNotInPrices.length > 20) {
          console.warn('   … и ещё', modelNamesInColorNotInPrices.length - 20);
        }
      }
      const modelsInPricesWithoutColor = [...modelNamesInPrices].filter((m) => !modelNamesInColor.has(m));
      if (modelsInPricesWithoutColor.length > 0) {
        console.warn(
          '⚠ «Цены базовые»: модели без строк в «Цвет» (в конфигураторе не будет фото/цветов):',
          modelsInPricesWithoutColor.slice(0, 15)
        );
        if (modelsInPricesWithoutColor.length > 15) {
          console.warn('   … и ещё', modelsInPricesWithoutColor.length - 15);
        }
      }
      console.log('Цвет (фото/варианты по модели):', stats.doorColors, 'записей');
    }
  }

  console.log('\nИтого:', { ...stats });
  if (dryRun) console.log('(dry-run — в БД ничего не записано)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
