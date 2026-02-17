/**
 * Тесты формирования Excel-заказа и проверки содержимого.
 * Проверяют: наличие листа, заголовки, заполнение колонок (Поставщик, Кромка, Реверс и т.д.).
 * Запись примера на диск: WRITE_EXCEL_SAMPLE=1 npx vitest run lib/export/puppeteer-generator.excel.test.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { generateExcelOrder } from './puppeteer-generator';
import { EXCEL_DOOR_FIELDS, getOptionPriceFromBreakdown } from './excel-door-fields';

// Мокаем поиск товаров в БД — тесты управляют ответом
vi.mock('@/lib/catalog/product-match', () => ({
  getMatchingProducts: vi.fn(),
  getModelNameByCode: vi.fn(),
  getFirstProductPropsByModelCode: vi.fn(),
}));

const { getMatchingProducts, getModelNameByCode, getFirstProductPropsByModelCode } = await import('@/lib/catalog/product-match');

const BASE_CLIENT = {
  id: 'client-1',
  firstName: 'Иван',
  lastName: 'Петров',
  middleName: 'Сергеевич',
  phone: '+7 999 123-45-67',
  address: 'г. Москва, ул. Примерная, 1',
};

const EXPECTED_HEADERS = [
  '№',
  'Наименование',
  'Количество',
  'Цена',
  'Сумма',
  ...EXCEL_DOOR_FIELDS,
];

async function loadWorkbookFromBuffer(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

function getHeaderRow(worksheet: ExcelJS.Worksheet): (string | number)[] {
  const row = worksheet.getRow(10);
  const values: (string | number)[] = [];
  for (let c = 1; c <= EXPECTED_HEADERS.length; c++) {
    const v = row.getCell(c).value;
    values.push(v != null ? (typeof v === 'object' && 'text' in v ? (v as any).text : v) : '');
  }
  return values;
}

function getDataRow(worksheet: ExcelJS.Worksheet, rowIndex: number): (string | number)[] {
  const row = worksheet.getRow(rowIndex);
  const values: (string | number)[] = [];
  for (let c = 1; c <= EXPECTED_HEADERS.length; c++) {
    const v = row.getCell(c).value;
    values.push(v != null ? (typeof v === 'object' && 'result' in v ? (v as any).result : v) : '');
  }
  return values;
}

describe('generateExcelOrder — формирование файла', () => {
  beforeEach(() => {
    vi.mocked(getMatchingProducts).mockReset();
    vi.mocked(getModelNameByCode).mockReset();
    vi.mocked(getFirstProductPropsByModelCode).mockResolvedValue(null);
  });

  it('1. создаёт файл с листом "Заказ"', async () => {
    vi.mocked(getMatchingProducts).mockResolvedValue([]);
    vi.mocked(getModelNameByCode).mockResolvedValue('');

    const data = {
      client: BASE_CLIENT,
      documentNumber: 'Order-123',
      items: [
        {
          id: 'item-1',
          model: 'DomeoDoors_Base_1',
          type: 'door',
          qty: 1,
          unitPrice: 50000,
          width: 800,
          height: 2000,
          finish: 'Эмаль',
          color: 'Белый (RAL 9010)',
        },
      ],
    };

    const buffer = await generateExcelOrder(data);
    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(100);

    const wb = await loadWorkbookFromBuffer(buffer);
    expect(wb.worksheets.length).toBeGreaterThanOrEqual(1);
    const sheet = wb.getWorksheet('Заказ');
    expect(sheet).toBeDefined();
    expect(sheet?.name).toBe('Заказ');
  });

  it('2. строка 10 содержит все ожидаемые заголовки', async () => {
    vi.mocked(getMatchingProducts).mockResolvedValue([]);
    vi.mocked(getModelNameByCode).mockResolvedValue('');

    const data = {
      client: BASE_CLIENT,
      documentNumber: 'Order-123',
      items: [{ id: 'item-1', model: 'DomeoDoors_Base_1', type: 'door', qty: 1, unitPrice: 1000 }],
    };

    const buffer = await generateExcelOrder(data);
    const wb = await loadWorkbookFromBuffer(buffer);
    const sheet = wb.getWorksheet('Заказ')!;
    const headers = getHeaderRow(sheet);

    expect(headers.length).toBe(EXPECTED_HEADERS.length);
    EXPECTED_HEADERS.forEach((name, i) => {
      expect(String(headers[i] ?? '').trim()).toBe(name);
    });
  });

  it('3. fallback: дверь с кромкой и реверсом — колонки Кромка, Цвет кромки, Реверс заполнены', async () => {
    vi.mocked(getMatchingProducts).mockResolvedValue([]);
    vi.mocked(getModelNameByCode).mockResolvedValue('Base 1 Эмаль');

    const data = {
      client: BASE_CLIENT,
      documentNumber: 'Order-456',
      items: [
        {
          id: 'door-1',
          model: 'DomeoDoors_Base_1',
          type: 'door',
          qty: 1,
          unitPrice: 69010,
          width: 900,
          height: 2100,
          finish: 'Эмаль',
          color: 'Белый (RAL 9010)',
          edge: 'да',
          edgeId: 'matte-chrome',
          edgeColorName: 'матовый хром',
          reversible: true,
          threshold: false,
          mirror: 'none',
        },
      ],
    };

    const buffer = await generateExcelOrder(data);
    const wb = await loadWorkbookFromBuffer(buffer);
    const sheet = wb.getWorksheet('Заказ')!;
    const row = getDataRow(sheet, 11);

    const col = (name: string) => {
      const idx = EXPECTED_HEADERS.indexOf(name);
      return idx >= 0 ? String(row[idx] ?? '').trim() : '';
    };

    expect(col('Кромка')).toBe('да');
    expect(col('Цвет кромки')).toMatch(/матовый хром|matte-chrome/);
    expect(col('Реверс')).toBe('да');
    expect(col('Материал/Покрытие')).toBe('Эмаль');
    expect(col('Цвет/Отделка')).toBe('Белый (RAL 9010)');
    expect(col('Ширина, мм')).toBe('900');
    expect(col('Высота, мм')).toBe('2100');
  });

  it('4. fallback: кромка по edgeId без edge=да — всё равно заполняет Кромка и Цвет кромки', async () => {
    vi.mocked(getMatchingProducts).mockResolvedValue([]);
    vi.mocked(getModelNameByCode).mockResolvedValue('');

    const data = {
      client: BASE_CLIENT,
      documentNumber: 'Order-789',
      items: [
        {
          id: 'door-1',
          model: 'DomeoDoors_Base_1',
          type: 'door',
          qty: 1,
          unitPrice: 60000,
          width: 800,
          height: 2000,
          finish: 'ПВХ',
          color: 'Венге',
          edgeId: 'gold',
          edgeColorName: 'золото',
        },
      ],
    };

    const buffer = await generateExcelOrder(data);
    const wb = await loadWorkbookFromBuffer(buffer);
    const sheet = wb.getWorksheet('Заказ')!;
    const row = getDataRow(sheet, 11);
    const col = (name: string) => {
      const idx = EXPECTED_HEADERS.indexOf(name);
      return idx >= 0 ? String(row[idx] ?? '').trim() : '';
    };

    expect(col('Кромка')).toBe('да');
    expect(col('Цвет кромки')).toMatch(/золото|gold/);
  });

  it('5. при совпадении с БД: Поставщик из props и опции двери из item', async () => {
    const doorProduct = {
      id: 'prod-1',
      sku: 'DOOR-SKU-001',
      name: 'Дверь Base 1',
      properties_data: {
        'Название модели': 'Дверной блок Эмаль Порта',
        'Цена РРЦ': 69010,
        'Поставщик': 'Поставщик Дом',
        'Тип покрытия': 'Эмаль',
        'Цвет/Отделка': 'Белый (RAL 9010)',
        'Ширина/мм': 900,
        'Высота/мм': 2100,
      },
    };
    vi.mocked(getMatchingProducts).mockResolvedValue([doorProduct as any]);
    vi.mocked(getModelNameByCode).mockResolvedValue('');

    const data = {
      client: BASE_CLIENT,
      documentNumber: 'Order-DB',
      items: [
        {
          id: 'door-1',
          model: 'DomeoDoors_Base_1',
          type: 'door',
          qty: 1,
          unitPrice: 69010,
          width: 900,
          height: 2100,
          finish: 'Эмаль',
          color: 'Белый (RAL 9010)',
          edge: 'да',
          edgeId: 'chrome',
          edgeColorName: 'матовый хром',
          reversible: true,
          threshold: true,
          mirror: 'none',
          optionIds: ['arch-1'],
          architraveNames: ['Наличник М'],
        },
      ],
    };

    const buffer = await generateExcelOrder(data);
    const wb = await loadWorkbookFromBuffer(buffer);
    const sheet = wb.getWorksheet('Заказ')!;
    const row = getDataRow(sheet, 11);
    const col = (name: string) => {
      const idx = EXPECTED_HEADERS.indexOf(name);
      return idx >= 0 ? String(row[idx] ?? '').trim() : '';
    };

    expect(col('Поставщик')).toBe('Поставщик Дом');
    expect(col('Название модели')).toBe('Дверной блок Эмаль Порта');
    expect(col('Материал/Покрытие')).toBe('Эмаль');
    expect(col('Цвет/Отделка')).toBe('Белый (RAL 9010)');
    expect(col('Ширина, мм')).toBe('900');
    expect(col('Высота, мм')).toBe('2100');
    expect(col('Кромка')).toBe('да');
    expect(col('Цвет кромки')).toMatch(/матовый хром|chrome/);
    expect(col('Реверс')).toBe('да');
    expect(col('Порог')).toBe('да');
    expect(col('Наличники')).toMatch(/Наличник М|да/);
  });

  it('6. для ручки и ограничителя колонки опций двери пустые (нет Зеркало/Кромка и т.д.)', async () => {
    vi.mocked(getMatchingProducts).mockResolvedValue([]);

    const data = {
      client: BASE_CLIENT,
      documentNumber: 'Order-Mix',
      items: [
        {
          id: 'door-1',
          model: 'DomeoDoors_Base_1',
          type: 'door',
          qty: 1,
          unitPrice: 50000,
          width: 800,
          height: 2000,
          finish: 'ПВХ',
          color: 'Белый',
        },
        {
          id: 'handle-1',
          type: 'handle',
          handleId: 'h1',
          handleName: 'Ручка MIRA ЧЕРНЫЙ',
          qty: 1,
          unitPrice: 2500,
        },
        {
          id: 'limiter-1',
          type: 'limiter',
          limiterId: 'l1',
          limiterName: 'SECRET DS BL скрытый магнитный',
          qty: 1,
          unitPrice: 2240,
        },
      ],
    };

    const buffer = await generateExcelOrder(data);
    const wb = await loadWorkbookFromBuffer(buffer);
    const sheet = wb.getWorksheet('Заказ')!;

    const col = (rowValues: (string | number)[], name: string) => {
      const idx = EXPECTED_HEADERS.indexOf(name);
      return idx >= 0 ? String(rowValues[idx] ?? '').trim() : '';
    };

    // Строка 11 — дверь: Наименование должно содержать дверь
    const row11 = getDataRow(sheet, 11);
    expect(col(row11, 'Наименование')).toMatch(/Дверь|DomeoDoors|Base/);

    // Строка 12 — ручка: Кромка, Реверс, Зеркало, Порог, Наличники — пустые
    const row12 = getDataRow(sheet, 12);
    expect(col(row12, 'Кромка')).toBe('');
    expect(col(row12, 'Реверс')).toBe('');
    expect(col(row12, 'Порог')).toBe('');
    expect(col(row12, 'Наличники')).toBe('');
    expect(col(row12, 'Зеркало')).toBe('');

    // Строка 13 — ограничитель: те же колонки пустые
    const row13 = getDataRow(sheet, 13);
    expect(col(row13, 'Кромка')).toBe('');
    expect(col(row13, 'Реверс')).toBe('');
    expect(col(row13, 'Зеркало')).toBe('');
  });

  it('7. данные клиента и номер документа в начале листа', async () => {
    vi.mocked(getMatchingProducts).mockResolvedValue([]);
    vi.mocked(getModelNameByCode).mockResolvedValue('');

    const data = {
      client: BASE_CLIENT,
      documentNumber: 'KP-2026-001',
      items: [{ id: 'item-1', model: 'DomeoDoors_Base_1', type: 'door', qty: 1, unitPrice: 1000 }],
    };

    const buffer = await generateExcelOrder(data);
    const wb = await loadWorkbookFromBuffer(buffer);
    const sheet = wb.getWorksheet('Заказ')!;

    expect(sheet.getCell('B3').value).toMatch(/Петров.*Иван|Иван.*Петров/);
    expect(sheet.getCell('B4').value).toBe('+7 999 123-45-67');
    expect(sheet.getCell('B7').value).toBe('KP-2026-001');
  });

  it('8. по желанию записывает пример файла на диск (WRITE_EXCEL_SAMPLE=1)', async () => {
    if (process.env.WRITE_EXCEL_SAMPLE !== '1') return;

    vi.mocked(getMatchingProducts).mockResolvedValue([]);
    vi.mocked(getModelNameByCode).mockResolvedValue('');

    const data = {
      client: BASE_CLIENT,
      documentNumber: 'Sample-Order',
      items: [
        {
          id: 'item-1',
          model: 'DomeoDoors_Base_1',
          type: 'door',
          qty: 1,
          unitPrice: 50000,
          width: 800,
          height: 2000,
          finish: 'Эмаль',
          color: 'Белый (RAL 9010)',
          edge: 'да',
          edgeId: 'chrome',
          edgeColorName: 'матовый хром',
          reversible: true,
        },
      ],
    };

    const buffer = await generateExcelOrder(data);
    const outDir = path.join(process.cwd(), 'scripts', 'output');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, 'sample-order.xlsx');
    fs.writeFileSync(outPath, buffer);
    expect(fs.existsSync(outPath)).toBe(true);
  });

  it('9. полный путь из конфигуратора: все опции двери попадают в Excel (Кромка, Реверс, Порог, Наличники, Комплект)', async () => {
    vi.mocked(getMatchingProducts).mockResolvedValue([]);
    vi.mocked(getModelNameByCode).mockResolvedValue('Дверь Гладкое эмаль ДГ');

    const data = {
      client: BASE_CLIENT,
      documentNumber: 'Order-Full',
      items: [
        {
          id: 'door-1',
          model: 'DomeoDoors_Base_1',
          model_name: 'Дверь Гладкое эмаль ДГ',
          type: 'door',
          qty: 1,
          unitPrice: 72000,
          width: 800,
          height: 2000,
          finish: 'Эмаль',
          color: 'Белый (RAL 9010)',
          style: 'Современные',
          edge: 'да',
          edgeId: 'chrome',
          edgeColorName: 'матовый хром',
          reversible: true,
          threshold: true,
          mirror: 'none',
          glassColor: 'Без стекла',
          optionIds: ['arch-1'],
          architraveNames: ['Наличник П-образный'],
          optionNames: ['Наличник П-образный'],
          hardwareKitId: 'kit-1',
          hardwareKitName: 'Комплект стандарт',
        },
      ],
    };

    const buffer = await generateExcelOrder(data);
    const wb = await loadWorkbookFromBuffer(buffer);
    const sheet = wb.getWorksheet('Заказ')!;
    const row = getDataRow(sheet, 11);
    const col = (name: string) => {
      const idx = EXPECTED_HEADERS.indexOf(name);
      return idx >= 0 ? String(row[idx] ?? '').trim() : '';
    };

    expect(col('Кромка')).toBe('да');
    expect(col('Цвет кромки')).toMatch(/матовый хром|chrome/);
    expect(col('Реверс')).toBe('да');
    expect(col('Порог')).toBe('да');
    expect(col('Наличники')).toMatch(/Наличник|да/);
    expect(col('Комплект фурнитуры')).toMatch(/стандарт|Комплект/);
    expect(col('Материал/Покрытие')).toBe('Эмаль');
    expect(col('Цвет/Отделка')).toBe('Белый (RAL 9010)');
    expect(col('Ширина, мм')).toBe('800');
    expect(col('Высота, мм')).toBe('2000');
  });

  it('10. порог и наличники: threshold и architraveNames попадают в Excel', async () => {
    vi.mocked(getMatchingProducts).mockResolvedValue([]);
    vi.mocked(getModelNameByCode).mockResolvedValue('');

    const data = {
      client: BASE_CLIENT,
      documentNumber: 'Order-Threshold',
      items: [
        {
          id: 'door-1',
          model: 'DomeoDoors_Base_1',
          type: 'door',
          qty: 1,
          unitPrice: 55000,
          width: 800,
          height: 2000,
          finish: 'ПВХ',
          color: 'Венге',
          edge: 'нет',
          threshold: 1 as unknown as boolean,
          architraveNames: ['Наличник телескоп', 'Наличник М'],
        },
      ],
    };

    const buffer = await generateExcelOrder(data);
    const wb = await loadWorkbookFromBuffer(buffer);
    const sheet = wb.getWorksheet('Заказ')!;
    const row = getDataRow(sheet, 11);
    const col = (name: string) => {
      const idx = EXPECTED_HEADERS.indexOf(name);
      return idx >= 0 ? String(row[idx] ?? '').trim() : '';
    };

    expect(col('Порог')).toBe('да');
    expect(col('Наличники')).toMatch(/телескоп|Наличник М|да/);
  });
});

describe('getOptionPriceFromBreakdown и колонки «X, цена»', () => {
  it('из breakdown заполняются Кромка цена, Реверс цена, Порог цена, Наличники цена', () => {
    const breakdown = [
      { label: 'Дверь', amount: 50000 },
      { label: 'Кромка: матовый хром', amount: 1500 },
      { label: 'Реверс', amount: 1200 },
      { label: 'Порог', amount: 800 },
      { label: 'Наличник П-образный', amount: 2500 },
      { label: 'Комплект: Комплект стандарт', amount: 10000 },
    ];
    expect(getOptionPriceFromBreakdown(breakdown, 'Кромка, цена')).toBe(1500);
    expect(getOptionPriceFromBreakdown(breakdown, 'Реверс, цена')).toBe(1200);
    expect(getOptionPriceFromBreakdown(breakdown, 'Порог, цена')).toBe(800);
    expect(getOptionPriceFromBreakdown(breakdown, 'Наличники, цена')).toBe(2500);
    expect(getOptionPriceFromBreakdown(breakdown, 'Комплект фурнитуры, цена')).toBe(10000);
  });
});
