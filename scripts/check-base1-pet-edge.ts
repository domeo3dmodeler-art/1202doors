/**
 * Проверка: Base 1 (DomeoDoors_Base_1) объединяет 4 модели.
 * При фильтре Покрытие ПЭТ должна оставаться только одна: ДПГ Флекс Эмаль Порта ПТА-50 B, у которой кромки в базе нет.
 * Запуск: npx tsx scripts/check-base1-pet-edge.ts
 */
import { prisma } from '../lib/prisma';
import { getDoorsCategoryId } from '../lib/catalog-categories';

const MODEL_CODE = 'DomeoDoors_Base_1';
const STYLE = 'Современная';
const FINISH_PET = 'ПЭТ';

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
  const byModelName = new Map<
    string,
    { count: number; edgeInBase: string[]; kromka: string[]; samples: { sku: string | null; edgeInBase: string; kromka: string }[] }
  >();

  for (const p of products) {
    const props: Props =
      typeof p.properties_data === 'string'
        ? (JSON.parse(p.properties_data as string) as Props)
        : ((p.properties_data as Props) || {});
    const code = String(props['Код модели Domeo (Web)'] ?? '').trim();
    const style = String(props['Domeo_Стиль Web'] ?? '').trim();
    const finish = String(props['Тип покрытия'] ?? '').trim();
    if (code !== MODEL_CODE || style !== STYLE || finish !== FINISH_PET) continue;

    const modelName =
      String(props['Domeo_Название модели для Web'] ?? props['Название модели'] ?? '').trim() || '(пусто)';
    const edgeInBase = String(props['Domeo_Кромка_в_базе_включена'] ?? '').trim();
    const kromka = String(props['Кромка'] ?? '').trim();

    if (!byModelName.has(modelName)) {
      byModelName.set(modelName, {
        count: 0,
        edgeInBase: [],
        kromka: [],
        samples: [],
      });
    }
    const rec = byModelName.get(modelName)!;
    rec.count += 1;
    if (rec.edgeInBase.indexOf(edgeInBase) === -1) rec.edgeInBase.push(edgeInBase);
    if (kromka && kromka !== '-' && rec.kromka.indexOf(kromka) === -1) rec.kromka.push(kromka);
    if (rec.samples.length < 3) rec.samples.push({ sku: p.sku, edgeInBase, kromka: kromka || '(пусто)' });
  }

  console.log('=== Base 1 + Современная + ПЭТ: названия моделей и кромка в базе ===\n');
  console.log('Ожидание: только одна модель — «ДПГ Флекс Эмаль Порта ПТА-50 B», кромки в базе нет.\n');

  const names = [...byModelName.keys()].sort();
  if (names.length === 0) {
    console.log('Товаров с Код модели =', MODEL_CODE, ', стиль =', STYLE, ', Тип покрытия = ПЭТ не найдено.');
    await prisma.$disconnect();
    return;
  }

  for (const name of names) {
    const rec = byModelName.get(name)!;
    const edgeInBaseValues = [...new Set(rec.edgeInBase)].filter(Boolean);
    const hasEdgeInBaseDa = edgeInBaseValues.some((v) => v.toLowerCase() === 'да');
    console.log('Название модели (Domeo_Название модели для Web / Название модели):', name);
    console.log('  Товаров:', rec.count);
    console.log('  Domeo_Кромка_в_базе_включена:', edgeInBaseValues.length ? edgeInBaseValues.join(', ') : '(не задано)');
    console.log('  Кромка в базе = Да?', hasEdgeInBaseDa ? 'ДА' : 'Нет');
    console.log('  Уникальные значения Кромка:', rec.kromka.length ? rec.kromka.join(', ') : '(пусто/нет)');
    console.log('  Примеры (sku, кромка в базе, Кромка):', rec.samples);
    console.log('');
  }

  const onlyOneModel = names.length === 1 && (names[0].includes('ДПГ Флекс Эмаль Порта') || names[0].includes('ПТА-50'));
  const petNoEdgeInBase = names.every((n) => {
    const rec = byModelName.get(n)!;
    return !rec.edgeInBase.some((v) => String(v).toLowerCase() === 'да');
  });

  console.log('--- Итог ---');
  console.log('  Только одна модель для ПЭТ?', onlyOneModel ? 'Да' : 'Нет (найдено моделей: ' + names.length + ')');
  console.log('  У всех ПЭТ-товаров кромки в базе нет?', petNoEdgeInBase ? 'Да' : 'Нет');
  console.log('');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
