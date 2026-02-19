/**
 * Тест экспорта в PDF и Excel через exportService (тот же путь, что и POST /api/export/fast).
 * Запуск: npx tsx scripts/test-export-pdf-excel.ts
 * Требуется: .env с DATABASE_URL, в БД есть или будет создан тестовый клиент.
 */
import { config } from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

config({ path: path.resolve(__dirname, '../.env') });
import { prisma } from '../lib/prisma';
import { exportService } from '../lib/services/export.service';

const OUTPUT_DIR = path.join(__dirname, 'output');
const TEST_CLIENT_ID = 'e2e-export-test-client';

const minimalItems = [
  {
    id: 'door-1',
    type: 'door',
    itemType: 'door',
    name: 'Дверь DomeoDoors Base 1',
    model: 'DomeoDoors_Base_1',
    qty: 1,
    quantity: 1,
    unitPrice: 50000,
    width: 800,
    height: 2000,
    finish: 'Эмаль',
    color: 'Белый',
  },
  {
    id: 'handle-1',
    type: 'handle',
    itemType: 'handle',
    name: 'Ручка MIRA Чёрный',
    qty: 1,
    quantity: 1,
    unitPrice: 2500,
  },
];

const totalAmount = minimalItems.reduce((s, i) => s + (i.unitPrice ?? 0) * (i.qty ?? 1), 0);

async function ensureTestClient() {
  let client = await prisma.client.findUnique({ where: { id: TEST_CLIENT_ID } });
  if (!client) {
    client = await prisma.client.create({
      data: {
        id: TEST_CLIENT_ID,
        firstName: 'Тест',
        lastName: 'Экспорт',
        middleName: 'PDF',
        phone: '+7 (999) 000-00-00',
        address: 'г. Москва, ул. Тестовая, д. 1',
        objectId: `test-${Date.now()}`,
        customFields: '{}',
        isActive: true,
      },
    });
    console.log('Создан тестовый клиент:', client.id);
  }
  return client;
}

async function run() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  await ensureTestClient();

  const payload = {
    type: 'invoice' as const,
    clientId: TEST_CLIENT_ID,
    items: minimalItems,
    totalAmount,
  };

  console.log('=== Тест экспорта PDF и Excel ===\n');

  // 1. PDF
  console.log('1. Экспорт в PDF...');
  try {
    const pdfResult = await exportService.exportDocument({
      ...payload,
      format: 'pdf',
    });
    const pdfPath = path.join(OUTPUT_DIR, pdfResult.filename || 'test-invoice.pdf');
    fs.writeFileSync(pdfPath, pdfResult.buffer);
    console.log('   OK:', pdfPath, pdfResult.buffer.length, 'bytes');
  } catch (e) {
    console.error('   ОШИБКА PDF:', e instanceof Error ? e.message : e);
    throw e;
  }

  // 2. Excel
  console.log('2. Экспорт в Excel...');
  try {
    const excelResult = await exportService.exportDocument({
      ...payload,
      format: 'excel',
    });
    const excelPath = path.join(OUTPUT_DIR, excelResult.filename || 'test-invoice.xlsx');
    fs.writeFileSync(excelPath, excelResult.buffer);
    console.log('   OK:', excelPath, excelResult.buffer.length, 'bytes');
  } catch (e) {
    console.error('   ОШИБКА Excel:', e instanceof Error ? e.message : e);
    throw e;
  }

  console.log('\nГотово. PDF и Excel созданы в', OUTPUT_DIR);
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
