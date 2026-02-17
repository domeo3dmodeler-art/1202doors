/**
 * Полный функциональный тест: создание заказа на реальных данных → экспорт в Excel.
 * Путь: создание заказа (documentService) → чтение cart_data → генерация Excel (generateExcelOrder).
 *
 * Запуск: npx tsx scripts/e2e-order-export-excel.ts
 * Требуется: .env с DATABASE_URL, в БД есть или будет создан тестовый клиент.
 *
 * Результат: scripts/output/e2e-order-{orderId}.xlsx
 */

import * as path from 'path';
import * as fs from 'fs';
import { prisma } from '../lib/prisma';
import { documentService } from '../lib/services/document.service';
import { generateExcelOrder } from '../lib/export/puppeteer-generator';

const OUTPUT_DIR = path.join(__dirname, 'output');
const TEST_CLIENT_ID = 'e2e-export-test-client';

// Позиции с полным набором полей (как из корзины конфигуратора)
const fullOrderItems = [
  {
    id: 'door-e2e-1',
    type: 'door',
    itemType: 'door',
    model: 'DomeoDoors_Base_1',
    finish: 'Эмаль',
    color: 'Белый (RAL 9010)',
    width: 800,
    height: 2000,
    style: 'Современный',
    qty: 1,
    quantity: 1,
    unitPrice: 74000,
    name: 'Дверь DomeoDoors Base 1',
    edge: 'да',
    edgeId: 'edge-1',
    edgeColorName: 'Алюминий матовый',
    reversible: true,
    mirror: 'both',
    threshold: true,
    optionIds: ['arch-1'],
    architraveNames: ['Наличник П-образный'],
    optionNames: ['Наличник П-образный'],
    glassColor: 'Бронза',
    sku_1c: 'door_base1_800_2000_emal',
    price_opt: 65000,
    hardwareKitName: 'Базовый',
    breakdown: [
      { label: 'Кромка: Алюминий матовый', amount: 1500 },
      { label: 'Реверс', amount: 800 },
      { label: 'Зеркало (две стороны)', amount: 3200 },
      { label: 'Порог', amount: 1200 },
      { label: 'Наличник П-образный', amount: 2500 }
    ],
    handleId: 'handle-mira-1',
    handleName: 'MIRA Чёрный',
    limiterId: 'limiter-secret-1',
    limiterName: 'SECRET DS SC скрытый магнитный'
  },
  {
    id: 'handle-e2e-1',
    type: 'handle',
    itemType: 'handle',
    handleId: 'handle-mira-1',
    handleName: 'MIRA Чёрный',
    qty: 1,
    quantity: 1,
    unitPrice: 2500,
    name: 'Ручка MIRA Чёрный'
  },
  {
    id: 'backplate-e2e-1',
    type: 'backplate',
    itemType: 'backplate',
    handleId: 'handle-mira-1',
    handleName: 'MIRA Чёрный',
    qty: 1,
    quantity: 1,
    unitPrice: 1050,
    name: 'Завертка MIRA Чёрный'
  },
  {
    id: 'limiter-e2e-1',
    type: 'limiter',
    itemType: 'limiter',
    limiterId: 'limiter-secret-1',
    limiterName: 'SECRET DS SC скрытый магнитный Цвет матовый хром',
    qty: 1,
    quantity: 1,
    unitPrice: 2240,
    name: 'Ограничитель SECRET DS SC скрытый магнитный'
  }
];

const totalAmount = fullOrderItems.reduce(
  (sum, i) => sum + (i.unitPrice ?? 0) * (i.qty ?? i.quantity ?? 1),
  0
);

async function ensureTestClient() {
  let client = await prisma.client.findUnique({ where: { id: TEST_CLIENT_ID } });
  if (!client) {
    client = await prisma.client.create({
      data: {
        id: TEST_CLIENT_ID,
        firstName: 'Э2Э',
        lastName: 'Тест',
        middleName: 'Экспорт',
        phone: '+7 (999) 000-00-00',
        address: 'г. Москва, ул. Тестовая, д. 1',
        objectId: `e2e-${Date.now()}`,
        customFields: '{}',
        isActive: true
      }
    });
    console.log('Создан тестовый клиент:', client.id);
  }
  return client;
}

async function run() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('=== E2E: создание заказа и экспорт в Excel ===\n');

  await ensureTestClient();

  // 1. Создание заказа (тот же путь, что и POST /api/orders)
  const created = await documentService.createDocument({
    type: 'order',
    parent_document_id: null,
    cart_session_id: `e2e-${Date.now()}`,
    client_id: TEST_CLIENT_ID,
    items: fullOrderItems,
    total_amount: totalAmount,
    subtotal: totalAmount,
    tax_amount: 0,
    prevent_duplicates: false,
    created_by: 'e2e-script'
  });

  console.log('1. Заказ создан:', created.number, 'id:', created.id);

  // 2. Читаем заказ и клиента из БД (как при экспорте по id)
  const order = await prisma.order.findUnique({
    where: { id: created.id },
    include: { client: true }
  });

  if (!order || !order.client) {
    throw new Error('Заказ или клиент не найдены после создания');
  }

  let items: any[] = [];
  if (order.cart_data) {
    try {
      const parsed = typeof order.cart_data === 'string' ? JSON.parse(order.cart_data) : order.cart_data;
      items = parsed?.items ?? (Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      console.error('Ошибка парсинга cart_data:', e);
      throw e;
    }
  }

  if (items.length === 0) {
    throw new Error('В заказе нет позиций (cart_data пуст или не массив items)');
  }

  console.log('2. Прочитано позиций из cart_data:', items.length);
  const first = items[0] as any;
  console.log('   Первая позиция: edge=', first.edge, 'edgeColorName=', first.edgeColorName, 'glassColor=', first.glassColor, 'mirror=', first.mirror);

  // 3. Генерация Excel (тот же путь, что и export/fast при format=excel для order)
  const exportData = {
    documentNumber: order.number,
    client: order.client,
    items,
    totalAmount: Number(order.total_amount)
  };

  const buffer = await generateExcelOrder(exportData);
  const outPath = path.join(OUTPUT_DIR, `e2e-order-${order.id}.xlsx`);
  fs.writeFileSync(outPath, buffer);

  console.log('3. Excel сохранён:', outPath);
  console.log('\nГотово. Откройте файл и проверьте колонки: Наименование, Название модели, Цена опт, Цена РРЦ, Кромка, Цвет кромки, Зеркало, Цвет стекла, Реверс, Порог, Наличники.');
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
