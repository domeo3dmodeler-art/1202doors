/**
 * Удаление всех заказов (Order) из БД.
 * Сначала обнуляем order_id у счетов (Invoice), затем удаляем заказы.
 *
 * ВНИМАНИЕ: необратимая операция.
 * Запуск: npx tsx scripts/delete-all-orders.ts
 */

import { prisma } from '@/lib/prisma';
import { deleteDocumentCommentsAndHistoryForMany } from '@/lib/documents/delete-document-relations';

async function main() {
  const ordersCount = await prisma.order.count();
  console.log(`Найдено заказов: ${ordersCount}`);

  const orderIds = (await prisma.order.findMany({ select: { id: true } })).map((o) => o.id);
  await deleteDocumentCommentsAndHistoryForMany(orderIds);
  console.log(`Удалены комментарии и история по заказам: ${orderIds.length}`);

  const updatedInvoices = await prisma.invoice.updateMany({
    where: { order_id: { not: null } },
    data: { order_id: null }
  });
  console.log(`Обнулён order_id у счетов: ${updatedInvoices.count}`);

  const deleted = await prisma.order.deleteMany({});
  console.log(`Удалено заказов: ${deleted.count}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
