/**
 * Удаление всех уведомлений из БД.
 * Запуск: npx tsx scripts/delete-all-notifications.ts [--yes]
 * Без --yes — только вывод количества. С --yes — удаление.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes('--yes');
  const count = await prisma.notification.count();
  console.log('Уведомлений в БД:', count);

  if (!apply) {
    console.log('\nДля удаления всех записей запустите:');
    console.log('npx tsx scripts/delete-all-notifications.ts --yes');
    return;
  }

  const result = await prisma.notification.deleteMany({});
  console.log('Удалено уведомлений:', result.count);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
