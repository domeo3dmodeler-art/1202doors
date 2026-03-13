/**
 * Выводит 10 примеров «Название модели» из БД от разных фабрик (Поставщик).
 * Запуск (нужен DATABASE_URL с PostgreSQL): npx tsx scripts/show-factory-names-in-db.ts
 *
 * Без доступа к БД — выполни на сервере с PostgreSQL (или через psql) запрос из SQL ниже.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const SQL_QUERY = `
-- 10 примеров названий от разных фабрик (таблица products, JSON properties_data)
SELECT DISTINCT ON (COALESCE(properties_data::jsonb->>'Поставщик', ''))
  COALESCE(properties_data::jsonb->>'Поставщик', '(пустой Поставщик)') AS "Фабрика/Поставщик",
  properties_data::jsonb->>'Название модели' AS "Название модели"
FROM products
WHERE is_active = true
  AND trim(COALESCE(properties_data::jsonb->>'Название модели', '')) != ''
ORDER BY COALESCE(properties_data::jsonb->>'Поставщик', ''), 2
LIMIT 10;
`;

async function main() {
  const products = await prisma.product.findMany({
    where: { is_active: true },
    select: { properties_data: true },
    take: 5000
  });

  const bySupplier = new Map<string, string[]>();
  for (const p of products) {
    const props = typeof p.properties_data === 'string' ? JSON.parse(p.properties_data || '{}') : (p.properties_data || {});
    const name = (props['Название модели'] ?? '').toString().trim();
    const supplier = (props['Поставщик'] ?? '').toString().trim();
    if (!name) continue;
    if (!bySupplier.has(supplier)) bySupplier.set(supplier, []);
    const arr = bySupplier.get(supplier)!;
    if (!arr.includes(name)) arr.push(name);
  }

  const suppliers = Array.from(bySupplier.entries()).filter(([s]) => s.length > 0);
  console.log('Названия в БД (10 примеров от разных фабрик):\n');
  let shown = 0;
  for (const [supplier, names] of suppliers) {
    if (shown >= 10) break;
    const label = supplier || '(пустой Поставщик)';
    const example = names[0];
    console.log(`${shown + 1}. [${label}] ${example}`);
    shown++;
  }
  console.log(`\nВсего фабрик/поставщиков с названиями: ${suppliers.length}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    if (e.message?.includes('DATABASE_URL') || e.message?.includes('postgresql')) {
      console.error('Нет подключения к PostgreSQL (DATABASE_URL). Выполни на сервере с БД:\n');
      console.log(SQL_QUERY);
      prisma.$disconnect();
      process.exit(1);
    }
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
