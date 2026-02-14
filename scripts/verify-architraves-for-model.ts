/**
 * Проверка: какие наличники отображаются для заданного кода модели.
 * Логика как на фронте: поставщики модели из complete-data (Поставщик у товаров дверей),
 * наличники фильтруются по совпадению поставщика.
 *
 * Запуск: npx tsx scripts/verify-architraves-for-model.ts [код_модели]
 * Пример: npx tsx scripts/verify-architraves-for-model.ts DomeoDoors_Pearl_3
 */
import { PrismaClient } from '@prisma/client';
import { getDoorsCategoryId } from '../lib/catalog-categories';
import { getCategoryIdByName } from '../lib/catalog-categories';

const prisma = new PrismaClient();

const MODEL_CODE = process.argv[2] || 'DomeoDoors_Pearl_3';

function norm(s: string): string {
  return (s || '').trim().toLowerCase().replace(/\s+/g, '');
}

async function main() {
  const doorsCatId = await getDoorsCategoryId();
  const nalichnikiCatId = await getCategoryIdByName('Наличники');

  if (!doorsCatId || !nalichnikiCatId) {
    console.error('Категории не найдены');
    process.exit(1);
  }

  // Товары дверей с данным кодом модели → собираем поставщиков
  const doorProducts = await prisma.product.findMany({
    where: {
      catalog_category_id: doorsCatId,
      is_active: true,
    },
    select: { id: true, sku: true, properties_data: true },
  });

  const suppliers = new Set<string>();
  for (const p of doorProducts) {
    let props: Record<string, unknown> = {};
    try {
      props = typeof p.properties_data === 'string' ? JSON.parse(p.properties_data) : p.properties_data || {};
    } catch {
      continue;
    }
    const code = String(props['Код модели Domeo (Web)'] ?? '').trim();
    if (code !== MODEL_CODE) continue;
    const supplier = String(props['Поставщик'] ?? '').trim();
    if (supplier) suppliers.add(supplier);
  }

  const supplierList = Array.from(suppliers);
  const supplierSetNorm = new Set(supplierList.map((s) => norm(s)).filter(Boolean));

  // Все наличники
  const architraves = await prisma.product.findMany({
    where: { catalog_category_id: nalichnikiCatId },
    select: { id: true, name: true, sku: true, properties_data: true },
  });

  const architraveList: { name: string; supplier: string; option_name: string }[] = [];
  for (const p of architraves) {
    let props: Record<string, unknown> = {};
    try {
      props = typeof p.properties_data === 'string' ? JSON.parse(p.properties_data) : p.properties_data || {};
    } catch {
      continue;
    }
    const supplier = String(props['Поставщик'] ?? props['Наличник: Поставщик'] ?? '').trim();
    const optionName = (props['Наличник: Название'] as string) || p.name || '';
    architraveList.push({ name: p.name, supplier, option_name: optionName });
  }

  // Фильтр как на фронте
  const filtered =
    supplierSetNorm.size > 0
      ? architraveList.filter((o) => {
          const sup = (o.supplier || '').trim();
          if (!sup) return false;
          return supplierSetNorm.has(norm(sup));
        })
      : architraveList;

  const useFallback = supplierSetNorm.size > 0 && filtered.length === 0;
  const displayed = useFallback ? architraveList : filtered;

  console.log('Код модели:', MODEL_CODE);
  console.log('Поставщики модели (из товаров дверей):', supplierList.length ? supplierList : '(нет или пусто)');
  console.log('');
  if (supplierList.length === 0) {
    console.log('Наличники: показываются ВСЕ (у модели нет поставщиков в БД).');
  } else if (useFallback) {
    console.log('Наличники: по поставщикам совпадений нет → показываются ВСЕ (fallback).');
  } else {
    console.log('Наличники: только от поставщиков модели.');
  }
  console.log('Количество:', displayed.length);
  console.log('');
  displayed.forEach((a, i) => {
    console.log(`  ${i + 1}. ${a.option_name || a.name} (поставщик: ${a.supplier || '—'})`);
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
