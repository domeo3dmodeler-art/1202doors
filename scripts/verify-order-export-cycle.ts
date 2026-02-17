/**
 * Полный цикл: создание заказа с кромкой/порогом/наличниками → экспорт в Excel → проверка ячеек.
 * Запуск: npx tsx scripts/verify-order-export-cycle.ts
 */
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/prisma';
import { exportService } from '../lib/services/export.service';
import ExcelJS from 'exceljs';

const OUT_DIR = path.join(process.cwd(), 'scripts', 'output');
const OUT_FILE = path.join(OUT_DIR, 'verify-order-export.xlsx');

async function main() {
  console.log('1. Получаем клиента...');
  const client = await prisma.client.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
  if (!client) {
    console.error('В БД нет клиентов. Выполните seed или создайте клиента.');
    process.exit(1);
  }

  const fullDoorItem = {
    id: 'verify-door-1',
    productId: 'verify-door-1',
    name: 'Дверь DomeoDoors Base 1; Эмаль; Белый; 800 × 2000 мм; Кромка: да; Порог: да; Наличники: да',
    model: 'DomeoDoors_Base_1',
    model_name: 'Дверь Гладкое эмаль ДГ',
    type: 'door',
    qty: 1,
    quantity: 1,
    unitPrice: 50000,
    price: 50000,
    width: 800,
    height: 2000,
    color: 'Белый (RAL 9010)',
    finish: 'Эмаль',
    sku_1c: null as string | null,
    handleId: undefined,
    handleName: undefined,
    hardwareKitId: undefined,
    hardwareKitName: undefined,
    edge: 'да',
    edgeId: 'chrome',
    edgeColorName: 'матовый хром',
    threshold: true,
    optionIds: ['arch-1', 'arch-2'],
    architraveNames: ['Наличник П-образный', 'Наличник телескоп'],
    optionNames: ['Наличник П-образный', 'Наличник телескоп'],
    reversible: false,
    mirror: undefined,
    glassColor: undefined,
    breakdown: [
      { label: 'Дверь', amount: 45000 },
      { label: 'Кромка: матовый хром', amount: 1500 },
      { label: 'Порог', amount: 800 },
      { label: 'Наличник П-образный', amount: 1200 },
      { label: 'Наличник телескоп', amount: 1500 },
    ],
  };

  const cartData = JSON.stringify([fullDoorItem]);
  const totalAmount = 50000;
  const number = `Заказ-${Date.now()}`;

  console.log('2. Создаём заказ в БД (cart_data с кромкой, порогом, наличниками)...');
  const order = await prisma.order.create({
    data: {
      number,
      client_id: client.id,
      cart_data: cartData,
      total_amount: totalAmount,
      status: 'NEW_PLANNED',
    },
    include: { client: true },
  });
  console.log('   Создан:', order.number, '| id:', order.id);

  const items = typeof order.cart_data === 'string' ? JSON.parse(order.cart_data) : order.cart_data;
  if (!Array.isArray(items)) {
    console.error('cart_data не массив');
    process.exit(1);
  }

  console.log('3. Экспорт в Excel...');
  const result = await exportService.exportDocument({
    type: 'order',
    format: 'excel',
    clientId: client.id,
    items,
    totalAmount: order.total_amount ?? totalAmount,
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, result.buffer);
  console.log('   Файл записан:', OUT_FILE);

  console.log('4. Проверка ячеек (Кромка, Порог, Наличники)...');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(OUT_FILE);
  const sheet = workbook.getWorksheet('Заказ');
  if (!sheet) {
    console.error('Лист "Заказ" не найден');
    process.exit(1);
  }

  const headerRow = 10;
  const dataRow = 11;
  const values = (sheet.getRow(headerRow).values as (string | number | undefined)[]) || [];
  const colNum = (title: string) => {
    const i = values.findIndex((h) => String(h || '').trim() === title);
    return i >= 0 ? i : 0;
  };
  const kromkaCol = colNum('Кромка');
  const kromkaColorCol = colNum('Цвет кромки');
  const porogCol = colNum('Порог');
  const nalichnikiCol = colNum('Наличники');
  const kromkaPriceCol = colNum('Кромка, цена');
  const porogPriceCol = colNum('Порог, цена');
  const nalichnikiPriceCol = colNum('Наличники, цена');
  const modelNameCol = colNum('Название модели');

  const getVal = (col: number) => (col > 0 ? sheet.getCell(dataRow, col).value : null);
  const kromka = getVal(kromkaCol);
  const kromkaColor = getVal(kromkaColorCol);
  const porog = getVal(porogCol);
  const nalichniki = getVal(nalichnikiCol);
  const kromkaPrice = getVal(kromkaPriceCol);
  const porogPrice = getVal(porogPriceCol);
  const nalichnikiPrice = getVal(nalichnikiPriceCol);
  const modelName = getVal(modelNameCol);

  const ok = [
    kromka === 'да' || kromka === 'Да',
    String(kromkaColor || '').toLowerCase().includes('хром'),
    porog === 'да' || porog === 'Да',
    (nalichniki && String(nalichniki).length > 0) || false,
    kromkaPrice === 1500 || kromkaPrice === '1500',
    porogPrice === 800 || porogPrice === '800',
    (nalichnikiPrice === 2700 || nalichnikiPrice === '2700' || (Number(nalichnikiPrice) >= 1200 && Number(nalichnikiPrice) <= 3000)),
    (modelName && String(modelName).length > 0) || false,
  ];

  console.log('   Кромка:', kromka, ok[0] ? '✓' : '✗');
  console.log('   Цвет кромки:', kromkaColor, ok[1] ? '✓' : '✗');
  console.log('   Порог:', porog, ok[2] ? '✓' : '✗');
  console.log('   Наличники:', nalichniki, ok[3] ? '✓' : '✗');
  console.log('   Кромка, цена:', kromkaPrice, ok[4] ? '✓' : '✗');
  console.log('   Порог, цена:', porogPrice, ok[5] ? '✓' : '✗');
  console.log('   Наличники, цена:', nalichnikiPrice, ok[6] ? '✓' : '✗');
  console.log('   Название модели:', modelName, ok[7] ? '✓' : '✗');

  if (ok.every(Boolean)) {
    console.log('\nЦикл проверен: заказ с полными данными (в т.ч. breakdown, model_name) → экспорт → в Excel заполнены опции и колонки «X, цена».');
  } else {
    console.error('\nОшибка: не все ячейки заполнены ожидаемо.');
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
