/**
 * Скрипт для удаления всех документов из БД
 * Удаляет: Order, Invoice, Quote, SupplierOrder
 * 
 * ВНИМАНИЕ: Это необратимая операция!
 * Запуск: npx tsx scripts/delete-all-documents.ts
 */

import { PrismaClient } from '@prisma/client';
import { deleteDocumentCommentsAndHistoryForMany } from '@/lib/documents/delete-document-relations';

const prisma = new PrismaClient();

async function deleteAllDocuments() {
  console.log('🚨 Начинаем удаление всех документов из БД...');
  
  try {
    // Подсчитываем количество документов перед удалением
    const ordersCount = await prisma.order.count();
    const invoicesCount = await prisma.invoice.count();
    const quotesCount = await prisma.quote.count();
    const supplierOrdersCount = await prisma.supplierOrder.count();
    
    console.log(`📊 Найдено документов:`);
    console.log(`  - Заказов (Order): ${ordersCount}`);
    console.log(`  - Счетов (Invoice): ${invoicesCount}`);
    console.log(`  - КП (Quote): ${quotesCount}`);
    console.log(`  - Заказов у поставщика (SupplierOrder): ${supplierOrdersCount}`);

    const supplierOrderIds = (await prisma.supplierOrder.findMany({ select: { id: true } })).map((r) => r.id);
    const quoteIds = (await prisma.quote.findMany({ select: { id: true } })).map((r) => r.id);
    const invoiceIds = (await prisma.invoice.findMany({ select: { id: true } })).map((r) => r.id);
    const orderIds = (await prisma.order.findMany({ select: { id: true } })).map((r) => r.id);
    const allDocumentIds = [...supplierOrderIds, ...quoteIds, ...invoiceIds, ...orderIds];
    await deleteDocumentCommentsAndHistoryForMany(allDocumentIds);
    console.log(`\n🗑️ Удалены комментарии и история по документам: ${allDocumentIds.length}`);
    
    // Удаляем в правильном порядке (сначала зависимые, потом основные)
    // 1. SupplierOrder (зависит от Invoice и Order)
    console.log('\n🗑️ Удаляем заказы у поставщика...');
    const deletedSupplierOrders = await prisma.supplierOrder.deleteMany({});
    console.log(`✅ Удалено заказов у поставщика: ${deletedSupplierOrders.count}`);
    
    // 2. Quote (зависит от Order)
    console.log('\n🗑️ Удаляем КП...');
    const deletedQuotes = await prisma.quote.deleteMany({});
    console.log(`✅ Удалено КП: ${deletedQuotes.count}`);
    
    // 3. Invoice (зависит от Order)
    console.log('\n🗑️ Удаляем счета...');
    const deletedInvoices = await prisma.invoice.deleteMany({});
    console.log(`✅ Удалено счетов: ${deletedInvoices.count}`);
    
    // 4. Order (основная сущность)
    console.log('\n🗑️ Удаляем заказы...');
    const deletedOrders = await prisma.order.deleteMany({});
    console.log(`✅ Удалено заказов: ${deletedOrders.count}`);
    
    console.log('\n✅ Все документы успешно удалены из БД!');
    
    // Проверяем что все удалено
    const finalOrdersCount = await prisma.order.count();
    const finalInvoicesCount = await prisma.invoice.count();
    const finalQuotesCount = await prisma.quote.count();
    const finalSupplierOrdersCount = await prisma.supplierOrder.count();
    
    console.log('\n📊 Финальное состояние БД:');
    console.log(`  - Заказов (Order): ${finalOrdersCount}`);
    console.log(`  - Счетов (Invoice): ${finalInvoicesCount}`);
    console.log(`  - КП (Quote): ${finalQuotesCount}`);
    console.log(`  - Заказов у поставщика (SupplierOrder): ${finalSupplierOrdersCount}`);
    
  } catch (error) {
    console.error('❌ Ошибка при удалении документов:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Запускаем скрипт
deleteAllDocuments()
  .then(() => {
    console.log('\n✅ Скрипт завершен успешно');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Ошибка выполнения скрипта:', error);
    process.exit(1);
  });

