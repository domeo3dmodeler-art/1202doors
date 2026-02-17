/**
 * Выводит коды моделей дверей, у которых при одной и той же конфигурации
 * (модель, покрытие, цвет, ширина, высота) в БД есть несколько товаров от разных поставщиков.
 * Такую дверь стоит добавить в заказ, чтобы в Excel «Заказ из БД» увидеть несколько вариантов.
 *
 * Запуск: npx tsx scripts/list-models-with-multiple-suppliers.ts
 */
import { PrismaClient } from '@prisma/client';
import { getDoorsCategoryId } from '../lib/catalog-categories';

const prisma = new PrismaClient();

function configKey(
  code: string,
  width: number,
  height: number,
  finish: string,
  color: string
): string {
  return [code, width, height, finish, color].join('|');
}

async function main() {
  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    console.error('Категория «Межкомнатные двери» не найдена.');
    process.exit(1);
  }

  const products = await prisma.product.findMany({
    where: { catalog_category_id: doorsCategoryId, is_active: true },
    select: { id: true, sku: true, properties_data: true },
  });

  // Группируем по (код, размер, покрытие, цвет) — как при поиске в экспорте заказа
  const byConfig = new Map<
    string,
    Array<{ sku: string; supplier: string; priceOpt?: number; priceRrc?: number }>
  >();

  for (const p of products) {
    const props =
      typeof p.properties_data === 'string'
        ? (JSON.parse(p.properties_data) as Record<string, unknown>)
        : (p.properties_data as Record<string, unknown>) || {};
    const code = String(props['Код модели Domeo (Web)'] ?? '').trim();
    const width = Number(props['Ширина/мм']) || 0;
    const height = Number(props['Высота/мм']) || 0;
    const finish = String(props['Тип покрытия'] ?? props['Материал/Покрытие'] ?? '').trim() || '—';
    const color = String(props['Цвет/Отделка'] ?? '').trim() || '—';
    const supplier = String(props['Поставщик'] ?? '').trim() || '—';
    const priceOpt = props['Цена опт'] != null ? Number(props['Цена опт']) : undefined;
    const priceRrc = props['Цена РРЦ'] != null ? Number(props['Цена РРЦ']) : undefined;

    if (!code) continue;

    const k = configKey(code, width, height, finish, color);
    if (!byConfig.has(k)) byConfig.set(k, []);
    byConfig.get(k)!.push({ sku: p.sku, supplier, priceOpt, priceRrc });
  }

  // Оставляем только конфигурации, где 2+ товара и хотя бы 2 разных поставщика
  const multiSupplier: Array<{
    code: string;
    width: number;
    height: number;
    finish: string;
    color: string;
    variants: Array<{ sku: string; supplier: string; priceOpt?: number; priceRrc?: number }>;
  }> = [];

  for (const [k, variants] of byConfig) {
    if (variants.length < 2) continue;
    const suppliers = new Set(variants.map((v) => v.supplier));
    if (suppliers.size < 2) continue;
    const [code, w, h, finish, color] = k.split('|');
    multiSupplier.push({
      code,
      width: Number(w),
      height: Number(h),
      finish,
      color,
      variants,
    });
  }

  if (multiSupplier.length === 0) {
    console.log(
      'В каталоге нет ни одной конфигурации двери (модель + размер + покрытие + цвет),\n' +
        'у которой было бы несколько товаров от разных поставщиков.\n\n' +
        'Чтобы увидеть несколько вариантов в заказе, в БД должны быть минимум два Product\n' +
        'с одинаковыми Код модели Domeo (Web), Ширина/мм, Высота/мм, Тип покрытия, Цвет/Отделка\n' +
        'и разными значениями Поставщик (импорт из разных листов/фабрик).'
    );
    return;
  }

  const first = multiSupplier[0];
  console.log('=== Код двери для проверки «несколько вариантов поставщиков» в заказе ===\n');
  console.log(
    `Выберите в конфигураторе дверь с кодом модели:\n  ${first.code}\n` +
      `Размер: ${first.width} × ${first.height} мм\n` +
      `Покрытие: ${first.finish}\n` +
      `Цвет: ${first.color}\n`
  );
  console.log('В БД по этой конфигурации найдено вариантов:', first.variants.length);
  first.variants.forEach((v, i) => {
    console.log(
      `  ${i + 1}. Поставщик: ${v.supplier}, SKU: ${v.sku}` +
        (v.priceOpt != null ? `, Цена опт: ${v.priceOpt}` : '') +
        (v.priceRrc != null ? `, Цена РРЦ: ${v.priceRrc}` : '')
    );
  });
  console.log(
    '\nДобавьте эту дверь в корзину, оформите заказ и нажмите «Заказ из БД» — в Excel будет несколько строк по одному на каждого поставщика.\n'
  );

  if (multiSupplier.length > 1) {
    console.log(`Всего конфигураций с несколькими поставщиками: ${multiSupplier.length}`);
    console.log('Другие примеры (код | размер | покрытие | цвет | кол-во вариантов):');
    multiSupplier.slice(1, 6).forEach((c) => {
      console.log(
        `  ${c.code} | ${c.width}×${c.height} | ${c.finish} | ${c.color} | ${c.variants.length} вариантов`
      );
    });
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
