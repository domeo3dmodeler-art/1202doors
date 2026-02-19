import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import puppeteer from 'puppeteer-core';
import { getPuppeteerExecutablePath, DEFAULT_PUPPETEER_ARGS } from '@/lib/export/puppeteer-executable';
import ExcelJS from 'exceljs';
import { findExistingDocument } from '@/lib/export/puppeteer-generator';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';
import { generateDocumentFromDoorsSchema } from '@/lib/validation/document.schemas';

interface ClientData {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
}

type DocumentItemType = 'door' | 'handle' | 'backplate' | 'limiter';

interface DocumentItem {
  type?: DocumentItemType;
  sku?: string;
  name?: string;
  unitPrice: number;
  quantity?: number;
  total?: number;
  qty?: number;
  properties_data?: string | Record<string, unknown>;
  handleId?: string;
  limiterId?: string;
  limiterName?: string;
  description?: string;
  model?: string;
  finish?: string;
  color?: string;
  width?: number;
  height?: number;
  hardwareKitId?: string;
  hardwareKitName?: string;
  style?: string;
  edge?: string;
  reversible?: boolean;
  mirror?: string;
  threshold?: boolean;
  optionIds?: string[];
}

interface DocumentData {
  type: 'quote' | 'invoice';
  client: ClientData;
  documentNumber: string;
  items: DocumentItem[];
  totalAmount: number;
}

// Функция для генерации PDF документа (системный Chrome, PUPPETEER_EXECUTABLE_PATH на сервере)
async function generatePDF(data: DocumentData): Promise<Buffer> {
  const executablePath = getPuppeteerExecutablePath();
  const browser = await puppeteer.launch({
    args: DEFAULT_PUPPETEER_ARGS,
    executablePath,
    headless: true,
    timeout: 30000
  });
  
  const page = await browser.newPage();
  
  // HTML шаблон для документа
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: 'Times New Roman', serif;
          font-size: 12px;
          margin: 20px;
          color: #000;
        }
        .header {
          text-align: center;
          font-size: 18px;
          font-weight: bold;
          margin-bottom: 30px;
        }
        .client-info {
          margin-bottom: 20px;
        }
        .client-info div {
          margin-bottom: 5px;
        }
        .document-info {
          margin-bottom: 30px;
        }
        .document-info div {
          margin-bottom: 5px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 20px;
        }
        th, td {
          border: 1px solid #000;
          padding: 8px;
          text-align: left;
        }
        th {
          background-color: #f0f0f0;
          font-weight: bold;
        }
        .number { width: 5%; text-align: center; }
        .sku { width: 15%; }
        .name { width: 40%; }
        .price { width: 15%; text-align: right; }
        .qty { width: 10%; text-align: center; }
        .total { width: 15%; text-align: right; }
        .total-sum {
          text-align: right;
          font-weight: bold;
          font-size: 14px;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="header">
        ${data.type === 'quote' ? 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ' : 'СЧЕТ'}
      </div>
      
      <div class="client-info">
        <div><strong>Клиент:</strong> ${data.client.firstName} ${data.client.lastName}</div>
        <div><strong>Телефон:</strong> ${data.client.phone}</div>
        <div><strong>Адрес:</strong> ${data.client.address}</div>
      </div>
      
      <div class="document-info">
        <div><strong>Номер документа:</strong> ${data.documentNumber}</div>
        <div><strong>Дата:</strong> ${new Date().toLocaleDateString('ru-RU')}</div>
      </div>
      
      <table>
        <thead>
          <tr>
            <th class="number">№</th>
            <th class="sku">Артикул</th>
            <th class="name">Наименование</th>
            <th class="price">Цена за ед.</th>
            <th class="qty">Кол-во</th>
            <th class="total">Сумма</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map((item: DocumentItem, index: number) => `
            <tr>
              <td class="number">${index + 1}</td>
              <td class="sku">${item.sku || 'N/A'}</td>
              <td class="name">${item.name}</td>
              <td class="price">${item.unitPrice.toLocaleString('ru-RU')} Р</td>
              <td class="qty">${item.quantity}</td>
              <td class="total">${item.total.toLocaleString('ru-RU')} Р</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <div class="total-sum">
        Итого: ${data.totalAmount.toLocaleString('ru-RU')} Р
      </div>
    </body>
    </html>
  `;
  
  await page.setContent(html, { 
    waitUntil: 'networkidle0',
    timeout: 30000 
  });
  
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: {
      top: '20mm',
      right: '20mm',
      bottom: '20mm',
      left: '20mm'
    },
    timeout: 30000
  });
  
  await browser.close();
  
  return Buffer.from(pdf);
}

// Функция для генерации Excel документа заказа
async function generateExcel(data: DocumentData): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Заказ');

  // Заголовок документа
  worksheet.mergeCells('A1:Z1');
  worksheet.getCell('A1').value = 'ЗАКАЗ';
  worksheet.getCell('A1').font = { size: 16, bold: true };
  worksheet.getCell('A1').alignment = { horizontal: 'center' };

  // Информация о клиенте
  worksheet.getCell('A3').value = 'Клиент:';
  worksheet.getCell('B3').value = `${data.client.firstName} ${data.client.lastName}`;
  worksheet.getCell('A4').value = 'Телефон:';
  worksheet.getCell('B4').value = data.client.phone;
  worksheet.getCell('A5').value = 'Адрес:';
  worksheet.getCell('B5').value = data.client.address;

  // Номер документа
  worksheet.getCell('A7').value = 'Номер документа:';
  worksheet.getCell('B7').value = data.documentNumber;
  worksheet.getCell('A8').value = 'Дата:';
  worksheet.getCell('B8').value = new Date().toLocaleDateString('ru-RU');

  // Собираем ВСЕ свойства из БД для найденных товаров
  const allProperties = new Set<string>();
  
  // Сначала собираем все свойства из всех товаров
  data.items.forEach((item: DocumentItem, index: number) => {
    logger.debug('Товар', 'documents/generate', {
      itemIndex: index + 1,
      sku: item.sku,
      name: item.name,
      hasProperties: !!item.properties_data
    });
    
    if (item.properties_data) {
      try {
        const props = typeof item.properties_data === 'string' 
          ? JSON.parse(item.properties_data) 
          : item.properties_data;
        logger.debug('Свойства товара', 'documents/generate', {
          itemIndex: index + 1,
          totalCount: Object.keys(props).length,
          properties: Object.keys(props).slice(0, 20) // Первые 20 свойств
        });
        
        // Добавляем ВСЕ свойства, кроме технических
        Object.keys(props).forEach(key => {
          // Исключаем только технические поля
          if (!key.includes('_id') && 
              !key.includes('photo') && 
              !key.includes('url') &&
              !key.includes('path') &&
              !key.includes('image') &&
              key.length > 2) {
            allProperties.add(key);
          }
        });
      } catch (e) {
        logger.warn('Failed to parse properties_data', 'documents/generate', { itemIndex: index + 1, error: e instanceof Error ? e.message : String(e) });
      }
    } else {
    }
  });
  

  // Базовые заголовки
  const baseHeaders = [
    '№', 'Артикул', 'Наименование', 'Количество', 'Цена', 'Сумма', 'Фурнитура'
  ];
  
  // Добавляем все свойства из БД
  const propertyHeaders = Array.from(allProperties).sort();
  const allHeaders = [...baseHeaders, ...propertyHeaders];
  
  worksheet.getRow(10).values = allHeaders;
  worksheet.getRow(10).font = { bold: true };
  worksheet.getRow(10).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE0E0E0' }
  };

  // Данные товаров
  let rowIndex = 11;
  data.items.forEach((item: DocumentItem, index: number) => {
    const row = worksheet.getRow(rowIndex);
    
    // Базовые поля
    row.getCell(1).value = index + 1; // №
    row.getCell(2).value = item.sku || 'N/A'; // Артикул
    row.getCell(3).value = item.name; // Наименование
    row.getCell(4).value = item.quantity; // Количество
    row.getCell(5).value = item.unitPrice; // Цена
    row.getCell(6).value = item.total; // Сумма
    row.getCell(7).value = item.hardwareKitName || 'Базовый комплект'; // Фурнитура
    
    // Форматирование чисел
    row.getCell(5).numFmt = '#,##0.00';
    row.getCell(6).numFmt = '#,##0.00';
    
    // Все свойства из БД
    let colIndex = 8; // Начинаем с 8-й колонки (после базовых + фурнитура)
    if (item.properties_data) {
      try {
        const props = typeof item.properties_data === 'string' 
          ? JSON.parse(item.properties_data) 
          : item.properties_data;
        
        propertyHeaders.forEach(propKey => {
          const value = props[propKey];
          // Заполняем ВСЕ ячейки, даже если значение пустое
          if (value !== undefined && value !== null) {
            row.getCell(colIndex).value = String(value);
          } else {
            row.getCell(colIndex).value = ''; // Пустое значение
          }
          colIndex++;
        });
      } catch (e) {
        logger.warn('Failed to parse properties_data for item', 'documents/generate', { itemIndex: index + 1, error: e instanceof Error ? e.message : String(e) });
        // Заполняем пустыми значениями
        propertyHeaders.forEach(() => {
          row.getCell(colIndex).value = '';
          colIndex++;
        });
      }
    } else {
      // Заполняем пустыми значениями
      propertyHeaders.forEach(() => {
        row.getCell(colIndex).value = '';
        colIndex++;
      });
    }
    
    rowIndex++;
  });

  // Автоподбор ширины колонок
  worksheet.columns.forEach((column, index) => {
    if (index < 7) {
      // Базовые колонки (включая фурнитуру)
      column.width = 15;
    } else {
      // Колонки свойств
      column.width = 20;
    }
  });
  
  // Итого
  const totalRow = worksheet.getRow(rowIndex + 1);
  totalRow.getCell(5).value = 'Итого:';
  totalRow.getCell(5).font = { bold: true };
  totalRow.getCell(6).value = data.totalAmount;
  totalRow.getCell(6).numFmt = '#,##0.00';
  totalRow.getCell(6).font = { bold: true };

  // Границы для таблицы
  const lastCol = String.fromCharCode(65 + allHeaders.length - 1); // Последняя колонка
  const range = `A10:${lastCol}${rowIndex}`;
  worksheet.getCell(range).border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  };

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// Функция для извлечения SKU поставщика из свойств товара
function extractSupplierSku(propertiesData: string | Record<string, unknown> | undefined): string {
  if (!propertiesData) return 'N/A';
  
  try {
    const props = typeof propertiesData === 'string' 
      ? JSON.parse(propertiesData) 
      : propertiesData;
    
    // Приоритет: Код модели Domeo (Web) — актуальный идентификатор; «Артикул поставщика» в БД не используется (fallback для старых данных)
    return (props['Код модели Domeo (Web)'] && String(props['Код модели Domeo (Web)']).trim()) ||
           props['SKU поставщика'] || 
           props['Фабрика_артикул'] ||
           props['Артикул'] || 
           props['SKU'] ||
           (props['Артикул поставщика'] && String(props['Артикул поставщика']).trim()) ||
           'N/A';
  } catch (error) {
    logger.warn('Failed to parse properties_data for SKU extraction', 'documents/generate', { error: error instanceof Error ? error.message : String(error) });
    return 'N/A';
  }
}

// Формат названия ограничителя: «Ограничитель скрытый магнитный SECRET DS Цвет хром» и т.д.
function formatLimiterName(limiterName: string | undefined): string {
  if (!limiterName || !limiterName.trim()) return 'Ограничитель';
  const suffix = limiterName
    .replace(/^Дверной ограничитель\s*/i, '')
    .replace(/^Ограничитель\s*/i, '')
    .trim()
    .replace(/,?\s*цвет\s+/gi, ' Цвет ');
  const trimmed = suffix.trim();
  return trimmed ? `Ограничитель ${trimmed}` : 'Ограничитель';
}

// Функция для формирования наименования товара (без дублирования покрытия, все значимые параметры)
function buildProductName(item: DocumentItem): string {
  const t = (item.type || (item.handleId ? 'handle' : item.limiterId ? 'limiter' : 'door')) as DocumentItemType;
  if (t === 'handle' || t === 'backplate') {
    return item.description || (t === 'backplate' ? 'Завертка' : 'Ручка');
  }
  if (t === 'limiter') {
    return formatLimiterName(item.limiterName) || item.description || 'Ограничитель';
  }
  // door: полная спецификация без дублирования покрытия
  const modelName = (item.model || 'Unknown').replace(/DomeoDoors_/g, '').replace(/_/g, ' ');
  const finishVal = String(item.finish ?? '').trim();
  const colorVal = String(item.color ?? '').trim();
  const specParts: string[] = [];
  if (finishVal) specParts.push(finishVal);
  if (colorVal) {
    const rest = finishVal && (colorVal === finishVal || colorVal.startsWith(finishVal + ';') || colorVal.startsWith(finishVal + ' '))
      ? colorVal.replace(new RegExp(`^\\s*${String(finishVal).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*;?\\s*`, 'i'), '').trim()
      : colorVal;
    if (rest) specParts.push(rest);
  }
  if (item.width != null && item.height != null) specParts.push(`${item.width} × ${item.height} мм`);
  if (item.edge === 'да') specParts.push('Кромка: да');
  if (item.reversible) specParts.push('Реверс: да');
  if (item.mirror) specParts.push('Зеркало: да');
  if (item.threshold) specParts.push('Порог: да');
  if (item.optionIds?.length) specParts.push('Наличники: да');
  const kitName = (item.hardwareKitName || 'Базовый').replace(/^Комплект фурнитуры — /, '');
  specParts.push(`Фурнитура: ${kitName}`);
  const specStr = specParts.filter((x) => x !== '—').join('; ');
  return specStr ? `Дверь DomeoDoors ${modelName}; ${specStr}` : `Дверь DomeoDoors ${modelName}`;
}

async function postHandler(
  request: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(ApiErrorCode.VALIDATION_ERROR, 'Неверный JSON в теле запроса', 400, undefined, loggingContext?.requestId);
  }

  const parseResult = generateDocumentFromDoorsSchema.safeParse(body);
  if (!parseResult.success) {
    const issues = parseResult.error.flatten();
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Ошибка валидации данных',
      400,
      { fieldErrors: issues.fieldErrors, formErrors: issues.formErrors },
      loggingContext?.requestId
    );
  }
  const { type, clientId, items, totalAmount } = parseResult.data;

  logger.info('Генерация документа', 'documents/generate', {
    type, 
    clientId, 
    itemsCount: items.length, 
    totalAmount,
    sampleItem: items[0] ? {
      model: items[0].model,
      finish: items[0].finish,
      color: items[0].color,
      style: items[0].style
    } : null
  }, loggingContext);

  // Получаем данные клиента (в текущей схеме клиенты общие для всех авторизованных пользователей)
  const client = await prisma.client.findUnique({
    where: { id: clientId }
  });

  if (!client) {
    throw new NotFoundError('Клиент', clientId);
  }

    // Генерируем cart_session_id для группировки документов
    const cartHash = Buffer.from(JSON.stringify({
      clientId,
      items: items.map(item => ({
        id: item.id,
        type: item.type,
        model: item.model,
        qty: item.qty,
        unitPrice: item.unitPrice
      })),
      totalAmount
    })).toString('base64').substring(0, 20);
    
    const cartSessionId = `cart_${cartHash}`;
    
    
    // Проверяем существующий документ (дедупликация)
    const existingDocument = await findExistingDocument(type, null, cartSessionId, clientId, items, totalAmount);
    
    let documentNumber: string;
    let documentId: string | null = null;
    
    if (existingDocument) {
      // Используем существующий документ, но с новым номером для экспорта
      documentNumber = existingDocument.number;
      documentId = existingDocument.id;
      
      // Генерируем новый номер для экспорта с латинскими префиксами
      const documentNumberPrefix = type === 'quote' ? 'KP' : type === 'invoice' ? 'Invoice' : 'Order';
      documentNumber = `${documentNumberPrefix}-${Date.now()}`;
    } else {
      const documentNumberPrefix = type === 'quote' ? 'KP' : type === 'invoice' ? 'Invoice' : 'Order';
      documentNumber = `${documentNumberPrefix}-${Date.now()}`;
    }

    if (type === 'quote') {
      let quote;
      
      if (existingDocument) {
        // Используем существующий КП
        quote = existingDocument;
      } else {
        // Создаем новый КП
        quote = await prisma.quote.create({
          data: {
            number: documentNumber,
            cart_session_id: cartSessionId,
            client_id: clientId,
            created_by: user.userId || 'system', // Используем userId из токена
            status: 'DRAFT',
            subtotal: totalAmount,
            total_amount: totalAmount,
            currency: 'RUB',
            notes: 'Сгенерировано из конфигуратора дверей',
            cart_data: JSON.stringify(items)
          }
        });

        // Создаем позиции КП только для нового документа
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const productName = buildProductName(item);
          
          await prisma.quoteItem.create({
            data: {
              quote_id: quote.id,
              product_id: item.id || `temp_${i}`,
              quantity: item.qty || item.quantity || 1,
              unit_price: item.unitPrice || 0,
              total_price: (item.qty || item.quantity || 1) * (item.unitPrice || 0),
              notes: `${productName} | Артикул: ${item.sku_1c || 'N/A'}`
            }
          });
        }
      }

      // Генерируем PDF для КП
      const pdfBuffer = await generatePDF({
        type: 'quote',
        documentNumber,
        client,
        items: await Promise.all(items.map(async (item, i) => {
          // Ищем товар в БД для получения SKU поставщика
          let supplierSku = 'N/A';
          
          const itemType = (item.type || (item.handleId ? 'handle' : item.limiterId ? 'limiter' : 'door')) as DocumentItemType;
          if (itemType === 'door') {
            const product = await prisma.product.findFirst({
              where: { catalog_category: { name: 'Межкомнатные двери' }, name: item.model },
              select: { properties_data: true }
            });
            if (product) supplierSku = extractSupplierSku(product.properties_data);
          } else if (itemType === 'handle' || itemType === 'backplate') {
            const product = await prisma.product.findFirst({
              where: { catalog_category: { name: { in: ['Ручки', 'Ручки и завертки'] } }, id: item.handleId },
              select: { properties_data: true }
            });
            if (product) supplierSku = extractSupplierSku(product.properties_data);
          } else if (itemType === 'limiter' && item.limiterId) {
            const product = await prisma.product.findFirst({
              where: { catalog_category: { name: 'Ограничители' }, id: item.limiterId },
              select: { properties_data: true }
            });
            if (product) supplierSku = extractSupplierSku(product.properties_data);
          }
          return {
            rowNumber: i + 1,
            sku: supplierSku,
            name: buildProductName(item),
            unitPrice: item.unitPrice || 0,
            quantity: item.qty || item.quantity || 1,
            total: (item.qty || item.quantity || 1) * (item.unitPrice || 0)
          };
        })),
        totalAmount
      });

      return new NextResponse(pdfBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${documentNumber}.pdf"`
        }
      });

    } else if (type === 'invoice') {
      let invoice;
      
      if (existingDocument) {
        // Используем существующий счет
        invoice = existingDocument;
      } else {
        // Создаем новый счет
        invoice = await prisma.invoice.create({
          data: {
            number: documentNumber,
            cart_session_id: cartSessionId,
            client_id: clientId,
            created_by: user.userId || 'system', // Используем userId из токена
            status: 'DRAFT',
            subtotal: totalAmount,
            total_amount: totalAmount,
            currency: 'RUB',
            notes: 'Сгенерировано из конфигуратора дверей',
            cart_data: JSON.stringify(items)
          }
        });

        // Создаем позиции счета только для нового документа
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const productName = buildProductName(item);
          
          await prisma.invoiceItem.create({
            data: {
              invoice_id: invoice.id,
              product_id: item.id || `temp_${i}`,
              quantity: item.qty || item.quantity || 1,
              unit_price: item.unitPrice || 0,
              total_price: (item.qty || item.quantity || 1) * (item.unitPrice || 0),
              notes: `${productName} | Артикул: ${item.sku_1c || 'N/A'}`
            }
          });
        }
      }

      // Генерируем PDF для Счета
      const pdfBuffer = await generatePDF({
        type: 'invoice',
        documentNumber,
        client,
        items: await Promise.all(items.map(async (item, i) => {
          // Ищем товар в БД для получения SKU поставщика
          let supplierSku = 'N/A';
          
          const itemType = (item.type || (item.handleId ? 'handle' : item.limiterId ? 'limiter' : 'door')) as DocumentItemType;
          if (itemType === 'door') {
            const product = await prisma.product.findFirst({
              where: { catalog_category: { name: 'Межкомнатные двери' }, name: item.model },
              select: { properties_data: true }
            });
            if (product) supplierSku = extractSupplierSku(product.properties_data);
          } else if (itemType === 'handle' || itemType === 'backplate') {
            const product = await prisma.product.findFirst({
              where: { catalog_category: { name: { in: ['Ручки', 'Ручки и завертки'] } }, id: item.handleId },
              select: { properties_data: true }
            });
            if (product) supplierSku = extractSupplierSku(product.properties_data);
          } else if (itemType === 'limiter' && item.limiterId) {
            const product = await prisma.product.findFirst({
              where: { catalog_category: { name: 'Ограничители' }, id: item.limiterId },
              select: { properties_data: true }
            });
            if (product) supplierSku = extractSupplierSku(product.properties_data);
          }
          return {
            rowNumber: i + 1,
            sku: supplierSku,
            name: buildProductName(item),
            unitPrice: item.unitPrice || 0,
            quantity: item.qty || item.quantity || 1,
            total: (item.qty || item.quantity || 1) * (item.unitPrice || 0)
          };
        })),
        totalAmount
      });

      return new NextResponse(pdfBuffer, {
      headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${documentNumber}.pdf"`
        }
      });

    } else if (type === 'order') {
      let order;

      if (existingDocument) {
        order = existingDocument;
      } else {
        // Создаем новый заказ (схема Order: без created_by, subtotal, currency; состав в cart_data)
        order = await prisma.order.create({
          data: {
            number: documentNumber,
            cart_session_id: cartSessionId,
            client_id: clientId,
            complectator_id: user.userId || null,
            status: 'DRAFT',
            total_amount: totalAmount,
            notes: 'Сгенерировано из конфигуратора дверей',
            cart_data: JSON.stringify(items)
          }
        });
      }

      // Получаем полные данные товаров из БД по точной конфигурации
      const enrichedItems = await Promise.all(items.map(async (item, i) => {
        const itemType = (item.type || (item.handleId ? 'handle' : item.limiterId ? 'limiter' : 'door')) as DocumentItemType;
        let productData = null;

        if (itemType !== 'door') {
          return {
            rowNumber: i + 1,
            sku: item.sku_1c || 'N/A',
            name: buildProductName(item),
            finish: item.finish,
            color: item.color,
            width: item.width,
            height: item.height,
            quantity: item.qty || item.quantity || 1,
            hardwareKitName: item.hardwareKitName,
            unitPrice: item.unitPrice || 0,
            total: (item.qty || item.quantity || 1) * (item.unitPrice || 0),
            properties_data: null,
            configuration: { style: item.style, model: item.model, finish: item.finish, color: item.color, width: item.width, height: item.height }
          };
        }
        
        if (item.sku_1c) {
          // Сначала пробуем найти по SKU
          productData = await prisma.product.findFirst({
            where: {
              sku: item.sku_1c
            },
            select: {
              properties_data: true,
              name: true,
              sku: true
            }
          });
        }
        
        // Если не нашли по SKU, ищем по точной конфигурации
        if (!productData) {
          logger.debug('Поиск по конфигурации', 'documents/generate', {
            itemIndex: i,
            style: item.style,
            model: item.model,
            finish: item.finish,
            color: item.color,
            width: item.width,
            height: item.height
          });
          
          // Получаем все товары и фильтруем по конфигурации
          const allProducts = await prisma.product.findMany({
            where: {
              catalog_category: {
                name: "Межкомнатные двери"
              }
            },
            select: {
              properties_data: true,
              name: true,
              sku: true
            }
          });
          
          
          // Ищем товар с точной конфигурацией
          for (const product of allProducts) {
            if (product.properties_data) {
              try {
                const props = typeof product.properties_data === 'string' 
                  ? JSON.parse(product.properties_data) 
                  : product.properties_data;
                
                // Проверяем соответствие конфигурации
                const styleMatch = !item.style || props['Domeo_Стиль Web'] === item.style;
                const modelMatch = !item.model || props['Название модели'] === item.model;
                const finishMatch = !item.finish || props['Тип покрытия'] === item.finish;
                const colorMatch = !item.color || props['Общее_Цвет'] === item.color;
                const widthMatch = !item.width || props['Общее_Ширина'] === item.width;
                const heightMatch = !item.height || props['Общее_Высота'] === item.height;
                
                // Логируем первые несколько товаров для отладки
                if (allProducts.indexOf(product) < 3) {
                  logger.debug('Товар из БД', 'documents/generate', {
                    itemIndex: i,
                    style: props['Domeo_Стиль Web'],
                    model: props['Название модели'],
                    finish: props['Тип покрытия'],
                    color: props['Общее_Цвет'],
                    width: props['Общее_Ширина'],
                    height: props['Общее_Высота'],
                    matches: { styleMatch, modelMatch, finishMatch, colorMatch, widthMatch, heightMatch }
                  });
                }
                
                if (styleMatch && modelMatch && finishMatch && colorMatch && widthMatch && heightMatch) {
                  productData = product;
                  logger.debug('Найден товар по конфигурации', 'documents/generate', {
                    itemIndex: i,
                    sku: product.sku,
                    name: product.name,
                    propertiesCount: Object.keys(props).length,
                    sampleProperties: Object.keys(props).slice(0, 10)
                  });
                  break;
                }
              } catch (e) {
                logger.warn('Failed to parse properties_data', 'documents/generate', { itemIndex: i, error: e instanceof Error ? e.message : String(e) });
              }
            }
          }
          
          if (!productData) {
            
            // Fallback: ищем товар с частичным совпадением
            for (const product of allProducts) {
              if (product.properties_data) {
                try {
                  const props = typeof product.properties_data === 'string' 
                    ? JSON.parse(product.properties_data) 
                    : product.properties_data;
                  
                  // Ищем по стилю и модели
                  const styleMatch = !item.style || props['Domeo_Стиль Web'] === item.style;
                  const modelMatch = !item.model || props['Название модели'] === item.model;
                  
                  if (styleMatch && modelMatch) {
                    productData = product;
                    logger.debug('Найден товар по стилю и модели', 'documents/generate', {
                      itemIndex: i,
                      sku: product.sku,
                      name: product.name,
                      style: props['Domeo_Стиль Web'],
                      model: props['Название модели'],
                      propertiesCount: Object.keys(props).length
                    });
                    break;
                  }
                } catch (e) {
                  logger.warn('Failed to parse properties_data', 'documents/generate', { itemIndex: i, error: e instanceof Error ? e.message : String(e) });
                }
              }
            }
            
            if (!productData) {
              // Последний fallback: берем первый товар
              if (allProducts.length > 0) {
                productData = allProducts[0];
                logger.warn('Fallback: используем первый товар', 'documents/generate', {
                  itemIndex: i,
                  sku: productData.sku,
                  name: productData.name
                });
              }
            }
          }
        }
        
        return {
          rowNumber: i + 1,
          sku: item.sku_1c || 'N/A',
          name: buildProductName(item),
          finish: item.finish,
          color: item.color,
          width: item.width,
          height: item.height,
          quantity: item.qty || item.quantity || 1,
          hardwareKitName: item.hardwareKitName,
          unitPrice: item.unitPrice || 0,
          total: (item.qty || item.quantity || 1) * (item.unitPrice || 0),
          properties_data: productData?.properties_data || null,
          // Добавляем конфигурацию для фильтрации свойств
          configuration: {
            style: item.style,
            model: item.model,
            finish: item.finish,
            color: item.color,
            width: item.width,
            height: item.height
          }
        };
      }));

      // Генерируем Excel для Заказа
      const excelBuffer = await generateExcel({
        type: 'order',
        documentNumber,
        client,
        items: enrichedItems,
        totalAmount
      });

      return new NextResponse(excelBuffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${documentNumber}.xlsx"`
        }
      });
    }

    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Неизвестный тип документа',
      400
    );
}

export const POST = withErrorHandling(
  requireAuth(postHandler),
  'documents/generate/POST'
);