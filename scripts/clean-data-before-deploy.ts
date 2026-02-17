/**
 * Полная очистка данных перед деплоем: документы → уведомления → клиенты.
 * Удаляет: Order, Invoice, Quote, SupplierOrder, Notification, Client.
 *
 * ВНИМАНИЕ: необратимая операция. Запуск только с флагом --yes.
 * Запуск: npx tsx scripts/clean-data-before-deploy.ts --yes
 */

import { prisma } from '@/lib/prisma';
import { deleteDocumentCommentsAndHistoryForMany } from '@/lib/documents/delete-document-relations';

async function main() {
  if (!process.argv.includes('--yes')) {
    console.log('Очистка данных перед деплоем (документы, уведомления, клиенты).');
    console.log('Запуск: npx tsx scripts/clean-data-before-deploy.ts --yes');
    process.exit(1);
  }

  console.log('🚨 Очистка данных...\n');

  const supplierOrderIds = (await prisma.supplierOrder.findMany({ select: { id: true } })).map((r) => r.id);
  const quoteIds = (await prisma.quote.findMany({ select: { id: true } })).map((r) => r.id);
  const invoiceIds = (await prisma.invoice.findMany({ select: { id: true } })).map((r) => r.id);
  const orderIds = (await prisma.order.findMany({ select: { id: true } })).map((r) => r.id);
  const allDocumentIds = [...supplierOrderIds, ...quoteIds, ...invoiceIds, ...orderIds];
  await deleteDocumentCommentsAndHistoryForMany(allDocumentIds);

  await prisma.supplierOrder.deleteMany({});
  await prisma.quote.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.order.deleteMany({});
  console.log('✅ Документы (Order, Invoice, Quote, SupplierOrder) удалены');

  const notif = await prisma.notification.deleteMany({});
  console.log('✅ Уведомления удалены:', notif.count);

  const clients = await prisma.client.deleteMany({});
  console.log('✅ Клиенты удалены:', clients.count);

  console.log('\n✅ Очистка завершена.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
