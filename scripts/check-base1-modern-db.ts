/**
 * Проверка: есть ли в БД для DomeoDoors_Base_1 + Современная все данные со скрина
 * (ПЭТ, ПВХ, Эмаль; размеры 800×2100 у всех покрытий).
 * Запуск: npx tsx scripts/check-base1-modern-db.ts
 */
import { prisma } from '../lib/prisma';
import { getDoorsCategoryId } from '../lib/catalog-categories';

const MODEL_CODE = 'DomeoDoors_Base_1';
const STYLE = 'Современная';

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
  const parsed: { id: string; sku: string | null; props: Props }[] = [];
  for (const p of products) {
    const props: Props =
      typeof p.properties_data === 'string'
        ? (JSON.parse(p.properties_data as string) as Props)
        : ((p.properties_data as Props) || {});
    const code = String(props['Код модели Domeo (Web)'] ?? '').trim();
    const style = String(props['Domeo_Стиль Web'] ?? '').trim();
    if (code !== MODEL_CODE || style !== STYLE) continue;
    parsed.push({ id: p.id, sku: p.sku, props });
  }

  console.log('=== Проверка БД: DomeoDoors_Base_1 + Современная ===\n');
  console.log('Всего товаров в категории дверей:', products.length);
  console.log('Товаров с Код модели Domeo (Web) =', MODEL_CODE, 'и Domeo_Стиль Web =', STYLE + ':', parsed.length);
  console.log('');

  if (parsed.length === 0) {
    console.log('Нет ни одного товара с такой парой код+стиль. Импорт или ключи в properties_data не совпадают.');
    await prisma.$disconnect();
    return;
  }

  const byFinish = new Map<string, typeof parsed>();
  const widths = new Set<number>();
  const heights = new Set<number>();
  const finishSet = new Set<string>();

  for (const item of parsed) {
    const { props } = item;
    const finish = String(props['Тип покрытия'] ?? '').trim();
    if (finish) {
      finishSet.add(finish);
      if (!byFinish.has(finish)) byFinish.set(finish, []);
      byFinish.get(finish)!.push(item);
    }
    const w = Number(props['Ширина/мм']);
    const h = Number(props['Высота/мм']);
    if (!Number.isNaN(w) && w > 0) widths.add(w);
    if (!Number.isNaN(h) && h > 0) heights.add(h);
  }

  console.log('--- По типу покрытия (Тип покрытия) ---');
  const sortedFinishes = [...finishSet].sort();
  for (const f of sortedFinishes) {
    const list = byFinish.get(f) ?? [];
    console.log('  ', f + ':', list.length, 'товаров');
  }
  console.log('');

  console.log('--- Уникальные Ширина/мм ---');
  console.log('  ', [...widths].sort((a, b) => a - b).join(', '));
  console.log('');

  console.log('--- Уникальные Высота/мм ---');
  console.log('  ', [...heights].sort((a, b) => a - b).join(', '));
  console.log('');

  const needWidth = 800;
  const needHeight = 2100;
  console.log('--- Наличие размера 800×2100 по покрытиям (Ширина/мм=800, Высота/мм=2100) ---');
  for (const f of sortedFinishes) {
    const list = byFinish.get(f) ?? [];
    const withSize = list.filter(
      (x) =>
        Number(x.props['Ширина/мм']) === needWidth && Number(x.props['Высота/мм']) === needHeight
    );
    console.log('  ', f + ':', withSize.length, 'товаров с 800×2100');
  }
  console.log('');

  console.log('--- Ожидалось со скрина ---');
  console.log('  ПЭТ, ПВХ, Эмаль — все с размерами 800×2100 (Ширины, мм: 600,700,800,900; Высота, мм: 2000, 2100, 2200, 2300).');
  console.log('  В БД ключи: Ширина/мм, Высота/мм, Тип покрытия.');
  console.log('');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
