/**
 * Удаление всех клиентов (Client) из БД.
 * Запускать после удаления документов и уведомлений (Order, Invoice, Quote, SupplierOrder, Notification ссылаются на Client).
 *
 * ВНИМАНИЕ: необратимая операция.
 * Запуск: npx tsx scripts/delete-all-clients.ts [--yes]
 * Без --yes — только вывод количества. С --yes — удаление.
 */

import { prisma } from '@/lib/prisma';

async function main() {
  const apply = process.argv.includes('--yes');
  const count = await prisma.client.count();
  console.log('Клиентов в БД:', count);

  if (!apply) {
    console.log('\nСначала выполните: npx tsx scripts/delete-all-documents.ts && npx tsx scripts/delete-all-notifications.ts --yes');
    console.log('Для удаления всех клиентов запустите: npx tsx scripts/delete-all-clients.ts --yes');
    return;
  }

  const result = await prisma.client.deleteMany({});
  console.log('Удалено клиентов:', result.count);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
