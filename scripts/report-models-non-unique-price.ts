/**
 * Отчёт: модели (код + параметры калькулятора), для которых при одинаковых параметрах
 * в БД находится больше одного товара с разной ценой.
 * Ожидается: при фиксированных модель, стиль, размер, покрытие, цвет — цена одна.
 *
 * Запуск: npx tsx scripts/report-models-non-unique-price.ts
 */
import { PrismaClient } from '@prisma/client';
import * as path from 'path';
import * as fs from 'fs';
import { getDoorsCategoryId } from '../lib/catalog-categories';

const prisma = new PrismaClient();

function key(
  code: string,
  style: string,
  width: number,
  height: number,
  finish: string,
  color: string
): string {
  return [code, style, width, height, finish, color].join('|');
}

async function main() {
  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    console.error('Категория «Межкомнатные двери» не найдена.');
    process.exit(1);
  }

  const products = await prisma.product.findMany({
    where: { catalog_category_id: doorsCategoryId },
    select: { id: true, sku: true, base_price: true, properties_data: true },
  });

  type Row = {
    code: string;
    style: string;
    width: number;
    height: number;
    finish: string;
    color: string;
    price: number;
    sku: string;
    modelName: string;
  };

  const byKey = new Map<string, Row[]>();

  for (const p of products) {
    const props =
      typeof p.properties_data === 'string'
        ? (JSON.parse(p.properties_data) as Record<string, unknown>)
        : (p.properties_data as Record<string, unknown>) || {};
    const code = String(props['Код модели Domeo (Web)'] ?? props['Артикул поставщика'] ?? '').trim();
    const style = String(props['Domeo_Стиль Web'] ?? '').trim() || '—';
    const width = Number(props['Ширина/мм']) || 0;
    const height = Number(props['Высота/мм']) || 0;
    const finish = String(props['Тип покрытия'] ?? '').trim() || '—';
    const color = String(props['Цвет/Отделка'] ?? '').trim() || '—';
    const price = Number(props['Цена РРЦ']) || p.base_price || 0;
    const modelName = String(props['Domeo_Название модели для Web'] ?? '').trim();

    if (!code) continue;

    const k = key(code, style, width, height, finish, color);
    const row: Row = { code, style, width, height, finish, color, price, sku: p.sku, modelName };
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(row);
  }

  const nonUnique: Array<{ key: string; rows: Row[] }> = [];
  for (const [k, rows] of byKey) {
    if (rows.length <= 1) continue;
    const prices = new Set(rows.map((r) => r.price));
    if (prices.size <= 1) continue;
    nonUnique.push({ key: k, rows });
  }

  const reportDir = path.join(__dirname, '..', 'docs');
  const reportPath = path.join(reportDir, 'MODELS_NON_UNIQUE_PRICE.md');
  const lines: string[] = [
    '# Модели с неединственной ценой при одинаковых параметрах',
    '',
    'Файл создаётся скриптом `scripts/report-models-non-unique-price.ts`.',
    'Запуск: `npx tsx scripts/report-models-non-unique-price.ts`',
    '',
    'Ожидаемая логика: при одинаковых параметрах в калькуляторе (модель, стиль, размер, покрытие, цвет) цена должна быть одна. Ниже — комбинации, по которым в БД найдено несколько товаров с разными ценами.',
    '',
    '---',
    '',
    `**Всего таких комбинаций:** ${nonUnique.length}`,
    '',
  ];

  if (nonUnique.length > 0) {
    lines.push('| Код модели | Стиль | Ш×В | Покрытие | Цвет | Цены (РРЦ) | SKU |');
    lines.push('|------------|-------|-----|----------|------|------------|-----|');
    for (const { key: k, rows } of nonUnique) {
      const [code, style, width, height, finish, color] = k.split('|');
      const prices = [...new Set(rows.map((r) => r.price))].sort((a, b) => a - b).join(', ');
      const skus = rows.map((r) => r.sku).join('; ');
      lines.push(`| ${code} | ${style} | ${width}×${height} | ${finish} | ${color} | ${prices} | ${skus} |`);
    }
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('Рекомендация: привести к одному товару на комбинацию (код, размер, покрытие) или развести по разным кодам/опциям.');
  } else {
    lines.push('Нарушений не найдено: по каждой комбинации параметров в БД не более одного товара или одна цена.');
  }

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportPath, lines.join('\n'), 'utf8');

  console.log('Проверено товаров:', products.length);
  console.log('Уникальных комбинаций (код, стиль, размер, покрытие, цвет):', byKey.size);
  console.log('Комбинаций с разными ценами:', nonUnique.length);
  console.log('Отчёт записан:', reportPath);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
