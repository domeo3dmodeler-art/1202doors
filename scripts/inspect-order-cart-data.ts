/**
 * Проверка cart_data конкретного заказа (для отладки: кромка, порог, наличники в Excel).
 * Запуск: npx tsx scripts/inspect-order-cart-data.ts <номер или id заказа>
 * Пример: npx tsx scripts/inspect-order-cart-data.ts Order-1771179547008
 */
import { prisma } from '../lib/prisma';

async function main() {
  let arg = process.argv[2];
  if (!arg) {
    const last = await prisma.order.findFirst({
      orderBy: { created_at: 'desc' },
      select: { number: true },
    });
    if (!last) {
      console.log('В БД нет заказов. Создайте заказ и повторите.');
      process.exit(1);
    }
    arg = last.number;
    console.log('Аргумент не указан — проверяем последний заказ:', arg);
    console.log('');
  }

  const order = await prisma.order.findFirst({
    where: {
      OR: [{ id: arg }, { number: arg }],
    },
    include: {
      client: { select: { id: true, firstName: true, lastName: true } },
      invoice: { select: { id: true, number: true, cart_data: true } },
    },
  });

  if (!order) {
    console.error('Заказ не найден:', arg);
    process.exit(1);
  }

  console.log('Заказ:', order.number, '| id:', order.id);
  console.log('Клиент:', order.client?.firstName, order.client?.lastName);
  console.log('');

  const cartDataRaw = order.cart_data || order.invoice?.cart_data;
  if (!cartDataRaw) {
    console.log('cart_data: отсутствует (ни у заказа, ни у счёта)');
    process.exit(0);
  }

  const cartData = typeof cartDataRaw === 'string' ? JSON.parse(cartDataRaw) : cartDataRaw;
  const items = cartData.items || (Array.isArray(cartData) ? cartData : []);
  console.log('Позиций в cart_data:', items.length);
  console.log('');

  const doorFields = [
    'edge',
    'edgeId',
    'edge_id',
    'edgeColorName',
    'edge_color_name',
    'threshold',
    'optionIds',
    'option_ids',
    'architraveNames',
    'architrave_names',
    'optionNames',
  ];

  items.forEach((item: any, i: number) => {
    const isDoor =
      item.model ||
      item.width != null ||
      (item.finish && item.finish !== '') ||
      (item.style && item.style !== '');
    if (!isDoor) return;
    console.log(`--- Дверь (позиция ${i + 1}) ---`);
    console.log('  model:', item.model);
    console.log('  Поля для Excel (кромка, порог, наличники):');
    doorFields.forEach((key) => {
      const val = item[key];
      if (val !== undefined && val !== null) {
        console.log(`    ${key}:`, typeof val === 'object' ? JSON.stringify(val) : val);
      }
    });
    const hasAny = doorFields.some(
      (k) => item[k] != null && (!Array.isArray(item[k]) || item[k].length > 0)
    );
    if (!hasAny) {
      console.log('    ⚠ Все поля кромка/порог/наличники отсутствуют — в Excel будут пустые ячейки.');
    }
    console.log('');
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
