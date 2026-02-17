/**
 * Установить Цвет для трёх ручек, у которых в Excel было пусто.
 * Запуск: npx tsx scripts/set-three-handle-colors.ts
 */
import { PrismaClient } from '@prisma/client';
import { getHandlesCategoryId } from '../lib/catalog-categories';

const prisma = new PrismaClient();

/** Совпадение по имени: строка включает все подстроки из mustInclude (без учёта регистра). */
function nameMatches(name: string, mustInclude: string[]): boolean {
  const lower = (name || '').toLowerCase();
  return mustInclude.every((sub) => lower.includes(sub.toLowerCase()));
}

const UPDATES: { match: (name: string, sku: string) => boolean; color: string; label: string }[] = [
  { match: (n) => /flou.*матовый.*белый/i.test(n), color: 'Белый', label: 'FLOU матовый белый' },
  { match: (n) => nameMatches(n, ['column', 'белый', 'черный', 'никель']), color: 'Никель', label: 'COLUMN белый/черный никель' },
  { match: (n) => /panathenaic.*черный/i.test(n) || (n && n.includes('PANATHENAIC') && n.includes('ЧЕРНЫЙ')), color: 'Черный', label: 'PANATHENAIC_ЧЕРНЫЙ' },
];

function parseProps(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return (value as Record<string, unknown>) || {};
}

async function main() {
  const catId = await getHandlesCategoryId();
  if (!catId) {
    throw new Error('Категория "Ручки и завертки" не найдена');
  }

  const handles = await prisma.product.findMany({
    where: { catalog_category_id: catId },
    select: { id: true, name: true, sku: true, properties_data: true },
  });

  // Вернуть Белый для PANATHENAIC R5-БЕЛЫЙ, если его ошибочно поменяли на Черный
  const panathWhite = handles.find(
    (p) => (p.name || '').includes('PANATHENAIC') && /r5.*белый|белый.*r5/i.test(p.name || '')
  );
  if (panathWhite) {
    const props = parseProps(panathWhite.properties_data);
    if (props['Цвет'] === 'Черный') {
      props['Цвет'] = 'Белый';
      await prisma.product.update({
        where: { id: panathWhite.id },
        data: { properties_data: JSON.stringify(props) },
      });
      console.log('Восстановлено:', panathWhite.name, '→ Цвет: Белый');
    }
  }

  for (const { match, color, label } of UPDATES) {
    const product = handles.find((p) => match(p.name || '', p.sku || ''));
    if (!product) {
      console.log('Не найдена ручка:', label);
      continue;
    }
    const props = parseProps(product.properties_data);
    props['Цвет'] = color;
    await prisma.product.update({
      where: { id: product.id },
      data: { properties_data: JSON.stringify(props) },
    });
    console.log('Обновлено:', product.name || product.sku, '→ Цвет:', color);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
