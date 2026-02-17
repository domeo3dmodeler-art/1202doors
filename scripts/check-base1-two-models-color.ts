/**
 * Проверка: подходит ли выбранный цвет обеим подмоделям Base 1
 * (Дверное полотно BASE 1 ПГ иск.п. и Дверь Гладкое эмаль ДГ).
 * Для Эмаль, 800×2100 выводим все товары и их Цвет/Отделка.
 *
 * Запуск: npx tsx scripts/check-base1-two-models-color.ts
 */
import { prisma } from '../lib/prisma';
import { getDoorsCategoryId } from '../lib/catalog-categories';

const MODEL_NAMES = ['Дверное полотно BASE 1 ПГ иск.п.', 'Дверь Гладкое эмаль ДГ'];
const FINISH = 'Эмаль';
const WIDTH = 800;
const HEIGHT = 2100;

async function main() {
  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    console.log('Категория "Межкомнатные двери" не найдена.');
    process.exit(1);
  }

  const products = await prisma.product.findMany({
    where: {
      catalog_category_id: doorsCategoryId,
      is_active: true,
    },
    select: { id: true, sku: true, properties_data: true },
  });

  type Props = Record<string, unknown>;
  const rows: { modelName: string; color: string; width: number; height: number; sku: string | null }[] = [];

  for (const p of products) {
    const props: Props =
      typeof p.properties_data === 'string'
        ? (JSON.parse(p.properties_data as string) as Props)
        : ((p.properties_data as Props) || {});
    const modelName = String(props['Название модели'] ?? '').trim();
    const finish = String(props['Тип покрытия'] ?? '').trim();
    const width = Number(props['Ширина/мм']);
    const height = Number(props['Высота/мм']);
    if (!MODEL_NAMES.includes(modelName) || finish !== FINISH) continue;
    if (width !== WIDTH || height !== HEIGHT) continue;
    const color = String(props['Цвет/Отделка'] ?? '').trim();
    rows.push({
      modelName,
      color,
      width,
      height,
      sku: p.sku,
    });
  }

  console.log('=== Цвета для двух подмоделей Base 1 (Эмаль, 800×2100) ===\n');
  console.log('Уникальные значения Цвет/Отделка по подмодели:\n');

  const byModel = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!byModel.has(r.modelName)) byModel.set(r.modelName, new Set());
    if (r.color) byModel.get(r.modelName)!.add(r.color);
  }

  for (const name of MODEL_NAMES) {
    const colors = byModel.get(name);
    console.log('  ', name);
    console.log('    Цвет/Отделка:', colors?.size ? [...colors].sort().join(' | ') : '(нет)');
    console.log('');
  }

  const commonColor = [...byModel.get(MODEL_NAMES[0]) ?? []].filter((c) =>
    (byModel.get(MODEL_NAMES[1]) ?? new Set()).has(c)
  );
  console.log('--- Общие цвета (есть у обеих подмоделей) ---');
  console.log('  Цвет/Отделка:', commonColor.length ? commonColor.sort().join(' | ') : 'нет общих');
  console.log('');
  console.log('Всего товаров (Эмаль, 800×2100):', rows.length);
  console.log('  По подмоделям:', MODEL_NAMES.map((n) => `${n}: ${rows.filter((r) => r.modelName === n).length}`).join('; '));

  // Если передан цвет аргументом — проверяем, есть ли он у обеих подмоделей
  const checkColor = process.argv[2];
  if (checkColor) {
    const decoded = decodeURIComponent(checkColor);
    console.log('\n--- Проверка выбранного цвета:', decoded, '---');
    for (const name of MODEL_NAMES) {
      const hasColor = rows.some((r) => r.modelName === name && r.color === decoded);
      console.log('  ', name, ':', hasColor ? 'ДА (есть товар с Цвет/Отделка = этот цвет)' : 'НЕТ');
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
