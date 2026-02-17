import path from 'path';
import fs from 'fs';
import { prisma } from '@/lib/prisma';
import ExcelJS from 'exceljs';
import puppeteer, { Browser } from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { 
  findExistingDocument as findExistingDocumentDedup, 
  findExistingOrder,
  compareCartContent 
} from '@/lib/documents/deduplication';
import { logger } from '@/lib/logging/logger';
import { getItemDisplayName, getItemType, normalizeItemForExport } from '@/lib/export/export-items';
import { getMatchingProducts, getModelNameByCode, getFirstProductPropsByModelCode } from '@/lib/catalog/product-match';
import { EXCEL_DOOR_FIELDS, getDoorFieldValue, type ExcelDoorFieldName } from '@/lib/export/excel-door-fields';

const isWindows = process.platform === 'win32';
const isDarwin = process.platform === 'darwin';

/** Путь к исполняемому файлу Chrome/Chromium для Puppeteer (Windows, macOS, Linux) */
async function resolveChromiumPath(): Promise<string> {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  if (isWindows) {
    const winPaths = [
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'Chromium', 'Application', 'chrome.exe'),
    ].filter(Boolean);
    for (const p of winPaths) {
      if (p && fs.existsSync(p)) {
        logger.debug('Найден Chrome по пути (Windows)', 'puppeteer-generator', { executablePath: p });
        return p;
      }
    }
    throw new Error(
      'Chrome не найден. Установите Google Chrome или задайте PUPPETEER_EXECUTABLE_PATH (например: set PUPPETEER_EXECUTABLE_PATH="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")'
    );
  }

  if (isDarwin) {
    const home = process.env.HOME || '';
    const macPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      path.join(home, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
      path.join(home, 'Applications', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
    ].filter(Boolean);
    for (const p of macPaths) {
      if (p && fs.existsSync(p)) {
        logger.debug('Найден Chrome/Chromium по пути (macOS)', 'puppeteer-generator', { executablePath: p });
        return p;
      }
    }
    throw new Error(
      'Chrome не найден. Установите Google Chrome из https://www.google.com/chrome/ или задайте PUPPETEER_EXECUTABLE_PATH (например: export PUPPETEER_EXECUTABLE_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")'
    );
  }

  // Linux и прочие (в т.ч. Docker / сервер)
  let executablePath = await chromium.executablePath();
  if (executablePath && fs.existsSync(executablePath)) return executablePath;
  if (executablePath && executablePath.includes('/tmp/chromium')) {
    logger.warn('Обнаружен /tmp/chromium, заменяем на /usr/bin/chromium', 'puppeteer-generator', { originalPath: executablePath });
    executablePath = '/usr/bin/chromium';
  }
  const possiblePaths = ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/chrome'];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const stat = fs.statSync(p);
      if (stat.isFile()) return p;
    }
  }
  return executablePath || '/usr/bin/chromium';
}

// Кэш для товаров по категориям

/** Текст зеркала для Excel: Одна сторона / Две стороны / Без зеркала */
export function formatMirrorForExcel(mirror: string | undefined): string {
  if (!mirror || mirror === 'none') return 'Без зеркала';
  if (mirror === 'one' || mirror === 'mirror_one') return 'Одна сторона';
  if (mirror === 'both' || mirror === 'mirror_both') return 'Две стороны';
  return mirror;
}

/** Наименование для Excel (supplier-orders и др.): делегирует в единый модуль экспорта */
export function getDisplayNameForExport(item: any): string {
  return getItemDisplayName(item);
}

// Функция для извлечения артикула/кода из свойств товара (приоритет у актуальных полей БД)
function extractSupplierSku(propertiesData: any): string {
  if (!propertiesData) return 'N/A';
  
  try {
    const props = typeof propertiesData === 'string' 
      ? JSON.parse(propertiesData) 
      : propertiesData;
    
    // Приоритет: Код модели Domeo (Web) — актуальный идентификатор; устаревший «Артикул поставщика» не используется в БД
    return (props['Код модели Domeo (Web)'] && String(props['Код модели Domeo (Web)']).trim()) ||
           props['SKU поставщика'] || 
           props['Фабрика_артикул'] ||
           props['Артикул'] || 
           props['SKU'] ||
           (props['Артикул поставщика'] && String(props['Артикул поставщика']).trim()) ||
           'N/A';
  } catch (error) {
    logger.warn('Failed to parse properties_data for SKU extraction', 'puppeteer-generator', { error: error instanceof Error ? error.message : String(error) });
    return 'N/A';
  }
}

// Кэшированный браузер для ускорения генерации
let cachedBrowser: Browser | null = null;

// Функция для очистки кэшированного браузера
export async function cleanupBrowserCache() {
  if (cachedBrowser && cachedBrowser.isConnected()) {
    logger.info('Очищаем кэш браузера', 'puppeteer-generator');
    await cachedBrowser.close();
    cachedBrowser = null;
  }
}

// Генерация PDF с Puppeteer
export async function generatePDFWithPuppeteer(data: any): Promise<Buffer> {
  const startTime = Date.now();
  logger.info('Начинаем генерацию PDF с Puppeteer', 'puppeteer-generator', { type: data.type });

  try {
    const title = data.type === 'quote' ? 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ' :
                  data.type === 'invoice' ? 'СЧЕТ' : 'ЗАКАЗ';

    logger.debug('Создаем HTML контент для PDF', 'puppeteer-generator', { type: data.type, title });

    const escapeHtml = (s: string) =>
      String(s ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

    // Создаем HTML контент с правильной кодировкой
    const htmlContent = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @page {
      size: A4;
      margin: 20mm;
    }
    body { 
      font-family: 'Arial', 'Helvetica', sans-serif; 
      font-size: 12px; 
      margin: 0;
      padding: 0;
      line-height: 1.4;
      color: #000;
    }
    .header { 
      text-align: center; 
      font-size: 18px; 
      font-weight: bold; 
      margin-bottom: 20px;
      border-bottom: 2px solid #000;
      padding-bottom: 10px;
    }
    .info { 
      margin-bottom: 20px; 
      line-height: 1.6;
      background-color: #f9f9f9;
      padding: 15px;
      border-radius: 5px;
    }
    .info div { margin-bottom: 5px; }
    .info strong { font-weight: bold; }
    table { 
      width: 100%; 
      border-collapse: collapse; 
      margin-bottom: 20px;
      font-size: 11px;
    }
    th, td { 
      border: 1px solid #000; 
      padding: 8px; 
      text-align: left;
      vertical-align: top;
    }
    th { 
      background-color: #e0e0e0; 
      font-weight: bold;
      text-align: center;
    }
    .number { text-align: center; width: 5%; }
    .sku { width: 15%; }
    .name { width: 40%; }
    .price { text-align: right; width: 15%; }
    .qty { text-align: center; width: 10%; }
    .total { text-align: right; width: 15%; }
    .total-row { 
      text-align: right; 
      font-size: 14px; 
      font-weight: bold; 
      margin-top: 20px;
      border-top: 2px solid #000;
      padding-top: 10px;
    }
    .footer { 
      font-size: 10px; 
      margin-top: 30px; 
      text-align: center; 
      color: #666;
    }
  </style>
</head>
<body>
  <div class="header">${title}</div>
  
  <div class="info">
    <div><strong>Клиент:</strong> ${data.client.firstName && data.client.lastName ? `${data.client.lastName} ${data.client.firstName} ${data.client.middleName || ''}`.trim() : 'N/A'}</div>
    <div><strong>Телефон:</strong> ${data.client.phone || 'N/A'}</div>
    <div><strong>Адрес:</strong> ${data.client.address || 'N/A'}</div>
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
      ${data.items.map((item: any, index: number) => `
        <tr>
          <td class="number">${index + 1}</td>
          <td class="sku">${escapeHtml(String(item.sku ?? ''))}</td>
          <td class="name">${escapeHtml(item.name)}</td>
          <td class="price">${item.unitPrice.toLocaleString('ru-RU')} ₽</td>
          <td class="qty">${item.quantity}</td>
          <td class="total">${item.total.toLocaleString('ru-RU')} ₽</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  
  <div class="total-row">Итого: ${data.totalAmount.toLocaleString('ru-RU')} ₽</div>
  
  <div class="footer">Документ сгенерирован автоматически системой Domeo</div>
</body>
</html>`;

    logger.debug('Запускаем Puppeteer браузер с Chromium', 'puppeteer-generator');
    
    let executablePath: string;
    try {
      executablePath = await resolveChromiumPath();
      logger.debug('Создаем браузер с executablePath', 'puppeteer-generator', { executablePath });
    } catch (error) {
      logger.warn('Ошибка получения пути к Chromium', 'puppeteer-generator', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
      executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || (isWindows ? '' : '/usr/bin/chromium');
      if (!executablePath || (isWindows && !fs.existsSync(executablePath))) {
        throw error;
      }
    }
    
    const browser = await puppeteer.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-client-side-phishing-detection',
        '--disable-crash-reporter',
        '--disable-default-apps',
        '--disable-features=TranslateUI',
        '--disable-ipc-flooding-protection',
        '--disable-popup-blocking',
        '--disable-prompt-on-repost',
        '--disable-sync',
        '--disable-translate',
        '--disable-web-resources',
        '--enable-features=NetworkService,NetworkServiceInProcess',
        '--force-color-profile=srgb',
        '--hide-scrollbars',
        '--ignore-certificate-errors',
        '--ignore-certificate-errors-spki-list',
        '--ignore-gpu-blacklist',
        '--ignore-ssl-errors',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--no-default-browser-check',
        '--no-pings',
        '--password-store=basic',
        '--single-process',
        '--use-gl=swiftshader',
        '--window-size=1920,1080'
      ],
      executablePath,
      headless: true,
      timeout: 60000,
      ignoreHTTPSErrors: true
    });

    let page: any = null;
    try {
      logger.debug('Создаем новую страницу', 'puppeteer-generator');
      page = await browser.newPage();
      
      // Устанавливаем размер viewport
      await page.setViewport({ width: 1920, height: 1080 });
      
      logger.debug('Устанавливаем HTML контент', 'puppeteer-generator');
      // Устанавливаем контент страницы с надежным ожиданием
      await page.setContent(htmlContent, { 
        waitUntil: 'networkidle0',
        timeout: 60000 
      });

      logger.debug('Генерируем PDF', 'puppeteer-generator');
      // Генерируем PDF
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm'
        },
        timeout: 60000 // Увеличиваем таймаут
      });

      const endTime = Date.now();
      const duration = endTime - startTime;
      logger.info('PDF сгенерирован', 'puppeteer-generator', { duration, type: data.type });

      // Закрываем страницу ПОСЛЕ получения PDF
      if (page) {
        try {
          await page.close();
        } catch (e) {
          logger.warn('Ошибка при закрытии страницы', 'puppeteer-generator', { error: e instanceof Error ? e.message : String(e) });
        }
      }

      // Закрываем браузер ПОСЛЕ получения PDF, но ДО возврата
      logger.debug('Закрываем браузер', 'puppeteer-generator');
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          logger.warn('Ошибка при закрытии браузера', 'puppeteer-generator', { error: e instanceof Error ? e.message : String(e) });
        }
      }

      return Buffer.from(pdfBuffer);
      
    } catch (innerError) {
      // Закрываем страницу при ошибке
      if (page) {
        try {
          await page.close();
        } catch (e) {
          logger.warn('Ошибка при закрытии страницы после ошибки', 'puppeteer-generator', { error: e instanceof Error ? e.message : String(e) });
        }
      }
      
      // Закрываем браузер при ошибке
      logger.debug('Закрываем браузер после ошибки', 'puppeteer-generator');
      if (browser) {
        try {
          await browser.close();
        } catch (e) {
          logger.warn('Ошибка при закрытии браузера', 'puppeteer-generator', { error: e instanceof Error ? e.message : String(e) });
        }
      }
      throw innerError;
    }
    
  } catch (error) {
    logger.error('Ошибка генерации PDF', 'puppeteer-generator', error instanceof Error ? { error: error.message, stack: error.stack, type: data.type } : { error: String(error), type: data.type });
    throw new Error(`PDF generation failed: ${error instanceof Error ? error.message : String(error)}`); 
  }
}

// Получение шаблона для категории дверей
async function getDoorTemplate() {
  const category = await prisma.catalogCategory.findFirst({
    where: { name: 'Межкомнатные двери' }
  });

  if (!category) {
    throw new Error('Категория "Межкомнатные двери" не найдена');
  }

  const template = await prisma.importTemplate.findUnique({
    where: { catalog_category_id: category.id }
  });

  if (!template) {
    throw new Error('Шаблон для категории дверей не найден');
  }

  return {
    requiredFields: JSON.parse(template.required_fields || '[]'),
    calculatorFields: JSON.parse(template.calculator_fields || '[]'),
    exportFields: JSON.parse(template.export_fields || '[]')
  };
}

/** Признак кромки: из корзины могут быть edge='да', edgeId/edge_id или только edgeColorName/edge_color_name. */
function hasEdgeSelected(item: any): boolean {
  if (item?.edge === 'да') return true;
  const edgeId = item?.edgeId ?? item?.edge_id;
  if (edgeId && edgeId !== 'none') return true;
  const colorName = item?.edgeColorName ?? item?.edge_color_name;
  return !!(colorName && String(colorName).trim());
}

/** Нормализует порог в boolean (для экспорта в Excel). */
function normalizeThreshold(v: unknown): boolean {
  if (v === true || v === 1) return true;
  if (typeof v === 'string' && v.toLowerCase().trim() === 'да') return true;
  return false;
}

/** Порог: в корзине может быть boolean, 1/0 или «да»/«нет». */
function hasThreshold(item: any): boolean {
  return normalizeThreshold(item?.threshold);
}

/** Наличники: названия из корзины (architraveNames/optionNames/architrave_names) или «да» при наличии optionIds/option_ids. */
export function formatArchitraveDisplay(item: any): string {
  const names = item?.architraveNames ?? item?.architraveName ?? item?.optionNames ?? item?.architrave_names;
  if (names != null) {
    if (Array.isArray(names)) return names.filter(Boolean).join(', ');
    return String(names).trim();
  }
  if (item?.optionIds?.length || item?.option_ids?.length) return 'да';
  return '';
}

// Расширенная генерация Excel для заказа
export async function generateExcelOrder(data: any): Promise<Buffer> {
  const startTime = Date.now();
  logger.info('Начинаем генерацию Excel заказа с полными свойствами', 'puppeteer-generator', { itemsCount: data.items?.length });

  try {
    // Получаем шаблон для дверей (пока не используется)
    // const template = await getDoorTemplate();
    // console.log('📋 Поля шаблона:', template.exportFields.length);

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Заказ');
    
    // Заголовок документа
    worksheet.mergeCells('A1:Z1');
    worksheet.getCell('A1').value = 'ЗАКАЗ';
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    // Информация о клиенте
    worksheet.getCell('A3').value = 'Клиент:';
    worksheet.getCell('B3').value = data.client.firstName && data.client.lastName ? `${data.client.lastName} ${data.client.firstName} ${data.client.middleName || ''}`.trim() : 'N/A';
    worksheet.getCell('A4').value = 'Телефон:';
    worksheet.getCell('B4').value = data.client.phone || 'N/A';
    worksheet.getCell('A5').value = 'Адрес:';
    worksheet.getCell('B5').value = data.client.address || 'N/A';

    // Номер документа
    worksheet.getCell('A7').value = 'Номер документа:';
    worksheet.getCell('B7').value = data.documentNumber;
    worksheet.getCell('A8').value = 'Дата:';
    worksheet.getCell('B8').value = new Date().toLocaleDateString('ru-RU');

    // Базовые заголовки + поля из БД в нужном порядке
    const baseHeaders = ['№', 'Наименование', 'Количество', 'Цена', 'Сумма'];
    
    const dbFields = [...EXCEL_DOOR_FIELDS];
    const allHeaders = [...baseHeaders, ...dbFields];
    
    // Устанавливаем заголовки
    worksheet.getRow(10).values = allHeaders;
    worksheet.getRow(10).font = { bold: true };
    
    // Цветовая схема: данные из корзины - голубой, данные из БД - бежевый
    const cartHeadersCount = baseHeaders.length;
    const dbHeadersCount = dbFields.length;
    
    // Заголовки из корзины (голубой фон)
    for (let i = 1; i <= cartHeadersCount; i++) {
      const cell = worksheet.getCell(10, i);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE6F3FF' } // Светло-голубой
      };
    }
    
    // Заголовки из БД (бежевый фон)
    for (let i = cartHeadersCount + 1; i <= cartHeadersCount + dbHeadersCount; i++) {
      const cell = worksheet.getCell(10, i);
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF5F5DC' } // Бежевый
      };
    }

    // Добавляем границу после заголовков
    for (let col = 1; col <= allHeaders.length; col++) {
      const headerCell = worksheet.getCell(10, col);
      if (!headerCell.border) headerCell.border = {};
      headerCell.border.bottom = { style: 'thin', color: { argb: 'FF000000' } };
    }

    // Обрабатываем каждый товар из корзины
    let rowIndex = 11;
    let globalRowNumber = 1;
    
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      logger.debug('Обрабатываем товар из корзины', 'puppeteer-generator', { itemIndex: i + 1, itemModel: item.model, itemName: item.name });

      const isDoor = getItemType(item as any) === 'door';
      const savedVariants = (item as any).matchingVariants as Array<{ modelName: string; supplier: string; priceOpt: string | number; priceRrc: string | number; material: string; width: number | string; height: number | string; color: string; skuInternal: string }> | undefined;

      const itemForMatch = isDoor ? { ...item, model_name: undefined } : item;
      let matchingProducts: Awaited<ReturnType<typeof getMatchingProducts>> = await getMatchingProducts(itemForMatch);
      const itemModelName = isDoor && (item as any).model_name != null ? String((item as any).model_name).trim() : '';
      if (isDoor && itemModelName && matchingProducts.length > 1) {
        matchingProducts = [...matchingProducts].sort((a, b) => {
          const aProps = typeof a.properties_data === 'string' ? JSON.parse(a.properties_data) : (a.properties_data || {});
          const bProps = typeof b.properties_data === 'string' ? JSON.parse(b.properties_data) : (b.properties_data || {});
          const aName = String(aProps['Название модели'] ?? '').trim();
          const bName = String(bProps['Название модели'] ?? '').trim();
          const aMatch = aName === itemModelName;
          const bMatch = bName === itemModelName;
          if (aMatch && !bMatch) return -1;
          if (!aMatch && bMatch) return 1;
          return 0;
        });
      }
      const useSavedVariants = isDoor && Array.isArray(savedVariants) && savedVariants.length > 0;
      const fullPropsFromDb: Record<string, unknown> = matchingProducts.length > 0 && matchingProducts[0].properties_data
        ? (typeof matchingProducts[0].properties_data === 'string' ? JSON.parse(matchingProducts[0].properties_data) : matchingProducts[0].properties_data)
        : {};
      logger.debug('Найдено подходящих товаров в БД / сохранённых вариантов', 'puppeteer-generator', { itemName: item.name, matchingCount: matchingProducts.length, useSavedVariants, savedVariantsCount: savedVariants?.length ?? 0 });

      if (useSavedVariants && savedVariants!.length > 0) {
        // Одна позиция корзины (код) → несколько строк по сохранённому списку вариантов; полные поля из БД (Толщина, Стекло, Кромка в базе, Наполнение, Стиль) подмешиваем из первого совпадения в БД
        const variants = [...savedVariants!].sort((a, b) => {
          if (!itemModelName) return 0;
          const aMatch = (a.modelName || '').trim() === itemModelName;
          const bMatch = (b.modelName || '').trim() === itemModelName;
          if (aMatch && !bMatch) return -1;
          if (!aMatch && bMatch) return 1;
          return 0;
        });
        const row = worksheet.getRow(rowIndex);
        row.getCell(1).value = globalRowNumber++;
        row.getCell(2).value = getDisplayNameForExport(item);
        row.getCell(3).value = item.qty || item.quantity || 1;
        row.getCell(4).value = item.unitPrice || 0;
        row.getCell(5).value = (item.qty || item.quantity || 1) * (item.unitPrice || 0);
        row.getCell(4).numFmt = '#,##0';
        row.getCell(5).numFmt = '#,##0';
        if (variants.length > 1) {
          for (let col = 1; col <= 5; col++) {
            worksheet.mergeCells(rowIndex, col, rowIndex + variants.length - 1, col);
            row.getCell(col).alignment = { vertical: 'middle', horizontal: 'center' };
          }
        }
        for (let vIdx = 0; vIdx < variants.length; vIdx++) {
          const v = variants[vIdx];
          const currentRow = worksheet.getRow(rowIndex + vIdx);
          let colIndex = 6;
          const propsFromV: Record<string, unknown> = {
            ...fullPropsFromDb,
            'Название модели': v.modelName,
            'Цена опт': v.priceOpt,
            'Цена РРЦ': v.priceRrc,
            'Поставщик': v.supplier,
            'Материал/Покрытие': v.material,
            'Ширина/мм': v.width,
            'Высота/мм': v.height,
            'Цвет/Отделка': v.color,
            'SKU внутреннее': v.skuInternal
          };
          const source = { item: item as any, supplierName: (v.supplier || (data.supplier?.name ?? '')).toString().trim(), props: propsFromV };
          dbFields.forEach((fieldName: ExcelDoorFieldName) => {
            const val = getDoorFieldValue(fieldName, source);
            if (val !== '' && val !== undefined && val !== null) {
              currentRow.getCell(colIndex).value = typeof val === 'number' ? val : String(val);
              if (fieldName === 'Цена опт' || fieldName === 'Цена РРЦ' || fieldName.endsWith(', цена')) currentRow.getCell(colIndex).numFmt = '#,##0';
            } else {
              currentRow.getCell(colIndex).value = '';
            }
            colIndex++;
          });
          for (let col = 1; col <= allHeaders.length; col++) {
            currentRow.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFFF' } };
            currentRow.getCell(col).alignment = { vertical: 'middle', horizontal: 'center' };
          }
        }
        rowIndex += variants.length;
        if (i < data.items.length - 1) {
          for (let col = 1; col <= allHeaders.length; col++) {
            const cell = worksheet.getCell(rowIndex - 1, col);
            if (!cell.border) cell.border = {};
            cell.border.bottom = { style: 'thin', color: { argb: 'FF000000' } };
          }
        }
      } else if (matchingProducts.length === 0) {
        logger.warn('Экспорт: нет совпадения в БД — используется fallback из корзины (при строгих данных из БД такого быть не должно)', 'puppeteer-generator', { itemName: item.name, itemModel: item.model, itemFinish: item.finish, itemColor: item.color, itemWidth: item.width, itemHeight: item.height });
        
        const row = worksheet.getRow(rowIndex);
        row.getCell(1).value = globalRowNumber++;
        row.getCell(2).value = getDisplayNameForExport(item);
        row.getCell(3).value = item.qty || item.quantity || 1;
        row.getCell(4).value = item.unitPrice || 0;
        row.getCell(5).value = (item.qty || item.quantity || 1) * (item.unitPrice || 0);
        row.getCell(4).numFmt = '#,##0';
        row.getCell(5).numFmt = '#,##0';

        const isDoor = getItemType(item as any) === 'door';
        const modelNameFallback = (item.model || '').toString().replace(/DomeoDoors_/g, '').replace(/_/g, ' ').trim() || '';
        const fallbackModelName = isDoor ? (await getModelNameByCode(item.model)) || modelNameFallback : '';
        const fallbackProps = isDoor ? await getFirstProductPropsByModelCode(item.model) : null;
        const mergedProps = fallbackProps
          ? {
              ...fallbackProps,
              ...(item.width != null && { 'Ширина/мм': item.width }),
              ...(item.height != null && { 'Высота/мм': item.height })
            }
          : {};
        const source = {
          item: { ...(item as any), unitPrice: undefined } as any,
          supplierName: (data.supplier?.name ?? '').toString().trim(),
          fallbackModelName: isDoor ? (String((item as any).model_name ?? '').trim() || (fallbackProps?.['Название модели'] as string) || fallbackModelName) : '',
          props: mergedProps
        };
        let colIndex = 6;
        dbFields.forEach((fieldName: ExcelDoorFieldName) => {
          const val = getDoorFieldValue(fieldName, source);
          if (val !== '' && val !== undefined && val !== null) {
            row.getCell(colIndex).value = typeof val === 'number' ? val : String(val);
            if (fieldName === 'Цена опт' || fieldName === 'Цена РРЦ' || fieldName.endsWith(', цена')) row.getCell(colIndex).numFmt = '#,##0';
          } else {
            row.getCell(colIndex).value = '';
          }
          colIndex++;
        });
        
        // Цветовое выделение и выравнивание: строка из корзины - белый фон
        for (let col = 1; col <= allHeaders.length; col++) {
          row.getCell(col).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFFFFF' } // Белый фон для строки из корзины
          };
          // Выравнивание по центру
          row.getCell(col).alignment = { 
            vertical: 'middle', 
            horizontal: 'center' 
          };
        }
        
        // Добавляем границу после товара (если не последний)
        if (i < data.items.length - 1) {
          for (let col = 1; col <= allHeaders.length; col++) {
            const cell = worksheet.getCell(rowIndex - 1, col);
            if (!cell.border) cell.border = {};
            cell.border.bottom = { style: 'thin', color: { argb: 'FF000000' } };
          }
        }
        
        rowIndex++;
      } else {
        // Создаем одну строку корзины с объединенными ячейками для данных из БД
        logger.debug('Создаем объединенную строку для товара из корзины', 'puppeteer-generator', { itemName: item.name, matchingCount: matchingProducts.length });
        
        const row = worksheet.getRow(rowIndex);
        
        // Базовые поля (заполняем только один раз): полный набор опций двери / ручки / ограничителя
        row.getCell(1).value = globalRowNumber++; // №
        row.getCell(2).value = getDisplayNameForExport(item); // Наименование: опции двери или ручка/ограничитель
        row.getCell(3).value = item.qty || item.quantity || 1; // Количество из корзины
        row.getCell(4).value = item.unitPrice || 0; // Цена из корзины
        row.getCell(5).value = (item.qty || item.quantity || 1) * (item.unitPrice || 0); // Сумма
        
        // Форматирование чисел (без .00 и с разделителями групп разрядов)
        row.getCell(4).numFmt = '#,##0';
        row.getCell(5).numFmt = '#,##0';
        
        // Объединяем ячейки для базовых полей (если есть несколько товаров из БД)
        if (matchingProducts.length > 1) {
          // Объединяем ячейки базовых полей по вертикали
          for (let col = 1; col <= 5; col++) {
            const startRow = rowIndex;
            const endRow = rowIndex + matchingProducts.length - 1;
            if (startRow !== endRow) {
              worksheet.mergeCells(startRow, col, endRow, col);
              // Выравниваем по центру для объединенных ячеек
              row.getCell(col).alignment = { 
                vertical: 'middle', 
                horizontal: 'center' 
              };
            }
          }
        }
        
        // Заполняем поля из БД для каждого найденного товара
        let currentRowIndex = rowIndex;
        
        for (let productIndex = 0; productIndex < matchingProducts.length; productIndex++) {
          const productData = matchingProducts[productIndex];
          logger.debug('Заполняем поля из БД для товара', 'puppeteer-generator', { productSku: productData.sku, productIndex: productIndex + 1, total: matchingProducts.length });
          
          const currentRow = worksheet.getRow(currentRowIndex);
          let colIndex = 6; // Начинаем с 6-й колонки (после базовых)
          
          if (productData.properties_data) {
            try {
              const props = typeof productData.properties_data === 'string' 
                ? JSON.parse(productData.properties_data) 
                : productData.properties_data;
              
              const source = {
                item: item as any,
                supplierName: (data.supplier?.name ?? '').toString().trim(),
                props
              };
              logger.debug('Тип товара, заполняем поля', 'puppeteer-generator', { itemType: item.type, productSku: productData.sku });
              dbFields.forEach((fieldName: ExcelDoorFieldName) => {
                const value = getDoorFieldValue(fieldName, source);
                if (value !== undefined && value !== null && value !== '') {
                  currentRow.getCell(colIndex).value = typeof value === 'number' ? value : String(value);
                  if (fieldName === 'Цена опт' || fieldName === 'Цена РРЦ' || fieldName.endsWith(', цена')) {
                    currentRow.getCell(colIndex).numFmt = '#,##0';
                  }
                } else {
                  currentRow.getCell(colIndex).value = '';
                }
                colIndex++;
              });
            } catch (e) {
              logger.warn('Ошибка парсинга properties_data для товара', 'puppeteer-generator', { error: e instanceof Error ? e.message : String(e), productId: productData.id, productSku: productData.sku });
              // Заполняем пустыми значениями
              dbFields.forEach(() => {
                currentRow.getCell(colIndex).value = '';
                colIndex++;
              });
            }
          } else {
            logger.warn('Нет properties_data для товара', 'puppeteer-generator', { productId: productData.id, productSku: productData.sku });
            // Заполняем пустыми значениями
            dbFields.forEach(() => {
              currentRow.getCell(colIndex).value = '';
              colIndex++;
            });
          }
          
          // Цветовое выделение и выравнивание: строка из БД - светло-серый фон
          for (let col = 1; col <= allHeaders.length; col++) {
            currentRow.getCell(col).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF0F0F0' } // Светло-серый фон для строки из БД
            };
            // Выравнивание по центру
            currentRow.getCell(col).alignment = { 
              vertical: 'middle', 
              horizontal: 'center' 
            };
          }
          
          currentRowIndex++;
        }
        
        // Добавляем границу после группы товаров (если не последний товар)
        if (i < data.items.length - 1) {
          for (let col = 1; col <= allHeaders.length; col++) {
            const cell = worksheet.getCell(currentRowIndex - 1, col);
            if (!cell.border) cell.border = {};
            cell.border.bottom = { style: 'thin', color: { argb: 'FF000000' } };
          }
        }
        
        // Обновляем rowIndex для следующего товара из корзины
        rowIndex = currentRowIndex;
      }
    }

    // Добавляем границу после последней группы товаров
    for (let col = 1; col <= allHeaders.length; col++) {
      const lastDataCell = worksheet.getCell(rowIndex - 1, col);
      if (!lastDataCell.border) lastDataCell.border = {};
      lastDataCell.border.bottom = { style: 'thin', color: { argb: 'FF000000' } };
    }

    // Итого
    const totalRow = worksheet.getRow(rowIndex + 1);
    totalRow.getCell(4).value = 'Итого:';
    totalRow.getCell(4).font = { bold: true };
    totalRow.getCell(4).alignment = { horizontal: 'right' };
    totalRow.getCell(5).value = data.totalAmount;
    totalRow.getCell(5).numFmt = '#,##0';
    totalRow.getCell(5).font = { bold: true };

    // Ширина колонок: Наименование — шире, остальные базовые и свойства — по умолчанию
    worksheet.columns.forEach((column, index) => {
      if (index === 1) {
        column.width = 50; // Наименование — полный текст
      } else if (index < 6) {
        column.width = 15;
      } else {
        column.width = 20;
      }
    });

    // Границы для таблицы
    const lastCol = String.fromCharCode(65 + allHeaders.length - 1);
    const range = `A10:${lastCol}${rowIndex}`;
    worksheet.getCell(range).border = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };

    const buffer = await workbook.xlsx.writeBuffer() as unknown as Buffer;
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    logger.info('Excel заказ сгенерирован', 'puppeteer-generator', { duration, itemsCount: data.items?.length });
    
    return buffer;
    
  } catch (error) {
    logger.error('Ошибка генерации Excel заказа', 'puppeteer-generator', error instanceof Error ? { error: error.message, stack: error.stack, itemsCount: data.items?.length } : { error: String(error), itemsCount: data.items?.length });
    throw new Error(`Excel order generation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Быстрая генерация Excel (для КП и Счета)
export async function generateExcelFast(data: any): Promise<Buffer> {
  const startTime = Date.now();
  logger.info('Начинаем генерацию Excel', 'puppeteer-generator', { itemsCount: data.items?.length });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Документ');
  
  // Заголовки
  worksheet.getRow(1).values = ['№', 'Артикул', 'Наименование', 'Количество', 'Цена', 'Сумма'];
  worksheet.getRow(1).font = { bold: true };
  
  // Данные
  data.items.forEach((item: any, index: number) => {
    const row = worksheet.getRow(index + 2);
    row.values = [
      index + 1,
      item.sku ?? '',
      item.name,
      item.quantity,
      item.unitPrice,
      item.total
    ];
  });
  
  // Автоширина колонок
  worksheet.columns.forEach(column => {
    column.width = 15;
  });
  
  const buffer = await workbook.xlsx.writeBuffer() as unknown as Buffer;
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  logger.info('Excel сгенерирован', 'puppeteer-generator', { duration, itemsCount: data.items?.length });
  
  return buffer;
}

// Основная функция экспорта с поддержкой cart_session_id и parent_document_id
export async function exportDocumentWithPDF(
  type: 'quote' | 'invoice' | 'order',
  format: 'pdf' | 'excel' | 'csv',
  clientId: string,
  items: any[],
  totalAmount: number,
  cartSessionId?: string | null,
  parentDocumentId?: string | null
) {
  const startTime = Date.now();
  logger.info('Экспорт документа', 'puppeteer-generator', { type, format, itemsCount: items.length, clientId });
  
  // Валидация входных данных
  if (!clientId || typeof clientId !== 'string') {
    throw new Error('clientId обязателен и должен быть строкой');
  }
  
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('items обязателен и должен быть непустым массивом');
  }

  // Тип и наименование — только из lib/export/export-items (игнорируем сохранённый type)
  const itemsForExport = items.map((item: any) => normalizeItemForExport(item));
  
  // Проверяем, есть ли уже документ с таким содержимым
  logger.debug('Ищем существующий документ', 'puppeteer-generator', { type, clientId });
  let existingDocument = null;
  try {
    // Используем централизованную функцию дедубликации
    // Адаптируем параметры под сигнатуру функции из deduplication.ts
    if (type === 'order') {
      // Для order используем специальную логику (parent_document_id должен быть null)
      existingDocument = await findExistingOrder(
        null, // Order - основной документ, parent_document_id всегда null
        cartSessionId || null,
        clientId,
        items,
        totalAmount
      );
    } else {
      // Для quote и invoice используем общую функцию
      existingDocument = await findExistingDocumentDedup(
        type as 'quote' | 'invoice',
        parentDocumentId || null,
        cartSessionId || null,
        clientId,
        items,
        totalAmount
      );
    }
  } catch (error) {
    logger.warn('Ошибка при поиске существующего документа', 'puppeteer-generator', error instanceof Error ? { error: error.message, stack: error.stack, type, clientId } : { error: String(error), type, clientId });
    // Продолжаем работу, создадим новый документ
  }
  
  let documentId: string | null = null;
  let documentNumberForDB: string;
  let documentNumberForExport: string;
  
  if (existingDocument) {
    // Используем существующий документ
    documentNumberForDB = existingDocument.number;
    documentId = existingDocument.id;
    logger.debug('Используем существующий документ', 'puppeteer-generator', { documentNumber: documentNumberForDB, documentId, type });
    
    // Для экспорта используем тот же номер, что и в БД, но с латинскими префиксами
    const exportPrefix = type === 'quote' ? 'KP' : type === 'invoice' ? 'Invoice' : 'Order';
    // Извлекаем timestamp из номера БД и используем его для экспорта
    // Обрабатываем как старые префиксы (QUOTE-, INVOICE-), так и новые (КП-, Счет-)
    let timestamp = documentNumberForDB.split('-')[1];
    
    // Если timestamp не найден, генерируем новый
    if (!timestamp) {
      timestamp = Date.now().toString();
    }
    
    documentNumberForExport = `${exportPrefix}-${timestamp}`;
    logger.debug('Номер для экспорта (тот же)', 'puppeteer-generator', { documentNumberForExport, documentNumberForDB });
  } else {
    // Создаем новый документ с кириллическими префиксами для БД
    const dbPrefix = type === 'quote' ? 'КП' : type === 'invoice' ? 'Счет' : 'Заказ';
    const dbTimestamp = Date.now();
    documentNumberForDB = `${dbPrefix}-${dbTimestamp}`;
    
    // Генерируем номер для экспорта с латинскими префиксами (тот же timestamp)
    const exportPrefix = type === 'quote' ? 'KP' : type === 'invoice' ? 'Invoice' : 'Order';
    documentNumberForExport = `${exportPrefix}-${dbTimestamp}`;
    logger.debug('Создаем новый документ', 'puppeteer-generator', { documentNumberForDB, documentNumberForExport, type });
  }

  // Получаем данные клиента
  let client = await prisma.client.findUnique({
    where: { id: clientId }
  });

  if (!client) {
    logger.warn('Клиент не найден, создаем тестового клиента', 'puppeteer-generator', { clientId });
    // Создаем тестового клиента в базе данных
    try {
      client = await prisma.client.create({
        data: {
          id: clientId,
          firstName: 'Тестовый',
          lastName: 'Клиент',
          middleName: null,
          phone: '+7 (999) 123-45-67',
          address: 'Тестовый адрес',
          objectId: `test-client-${Date.now()}`,
          customFields: '{}',
          isActive: true
        }
      });
      logger.info('Тестовый клиент создан', 'puppeteer-generator', { clientId: client.id, firstName: client.firstName, lastName: client.lastName });
    } catch (error: any) {
      logger.error('Ошибка создания тестового клиента', 'puppeteer-generator', error instanceof Error ? { error: error.message, stack: error.stack, clientId } : { error: String(error), clientId });
      // Если не удалось создать клиента, используем объект в памяти
      client = {
        id: clientId,
        firstName: 'Тестовый',
        lastName: 'Клиент',
        middleName: null,
        phone: '+7 (999) 123-45-67',
        address: 'Тестовый адрес',
        objectId: 'test-client',
        customFields: '{}',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      } as any;
    }
  }

  // Подготавливаем данные для экспорта (используем нормализованные позиции для корректных названий)
  logger.debug('Debug items data', 'puppeteer-generator', { itemsCount: itemsForExport.length, items: itemsForExport.map((i: any) => ({ name: i.name, type: i.type, model: i.model })) });
  
  const exportData = {
    type,
    documentNumber: documentNumberForExport,
    client,
    items: itemsForExport.map((item: any, i: number) => {
      const name = getItemDisplayName(item);
      return {
        ...item,
        rowNumber: i + 1,
        sku: '', // артикул пока не заполняем
        name: name,
        unitPrice: item.unitPrice || item.price || 0,
        qty: item.qty ?? item.quantity ?? 1,
        quantity: item.qty ?? item.quantity ?? 1,
        total: (item.qty ?? item.quantity ?? 1) * (item.unitPrice || item.price || 0),
        model: item.model,
        model_name: item.model_name,
        finish: item.finish,
        color: item.color,
        width: item.width,
        height: item.height,
        style: item.style,
        hardware: item.hardware,
        sku_1c: item.sku_1c,
        type: item.type,
        handleId: item.handleId,
        handleName: item.handleName,
        limiterId: item.limiterId,
        limiterName: item.limiterName,
        edge: item.edge,
        edgeId: item.edgeId ?? item.edge_id,
        edge_id: item.edge_id ?? item.edgeId,
        edgeColorName: item.edgeColorName ?? item.edge_color_name,
        edge_color_name: item.edge_color_name ?? item.edgeColorName,
        glassColor: item.glassColor ?? item.glass_color,
        reversible: item.reversible,
        mirror: item.mirror,
        threshold: normalizeThreshold(item.threshold),
        optionIds: item.optionIds ?? item.option_ids,
        architraveNames: item.architraveNames ?? item.architrave_names,
        optionNames: item.optionNames,
        price_opt: item.price_opt,
        breakdown: item.breakdown
      };
    }),
    totalAmount
  };

  let buffer: Buffer;
  let filename: string;
  let mimeType: string;

  // Убеждаемся, что documentNumberForExport содержит только латинские символы
  const safeDocumentNumber = documentNumberForExport.replace(/[^\x00-\x7F]/g, (char) => {
    const charCode = char.charCodeAt(0);
    if (charCode === 1050) return 'K'; // К
    if (charCode === 1055) return 'P'; // П
    if (charCode === 1057) return 'S'; // С
    if (charCode === 1095) return 'ch'; // ч
    if (charCode === 1077) return 'e'; // е
    if (charCode === 1090) return 't'; // т
    if (charCode === 1079) return 'z'; // з
    if (charCode === 1072) return 'a'; // а
    if (charCode === 1082) return 'k'; // к
    return 'X';
  });
  
  logger.debug('Безопасный номер для экспорта', 'puppeteer-generator', { safeDocumentNumber, documentNumberForExport });

  // Генерируем файл в зависимости от формата
  switch (format) {
    case 'pdf':
      buffer = await generatePDFWithPuppeteer(exportData);
      filename = `${safeDocumentNumber}.pdf`;
      mimeType = 'application/pdf';
      break;
    
    case 'excel':
      if (type === 'order') {
        // Для заказов используем расширенную функцию с полными свойствами
        buffer = await generateExcelOrder(exportData);
      } else {
        // Для КП и Счета используем простую функцию
        buffer = await generateExcelFast(exportData);
      }
      filename = `${safeDocumentNumber}.xlsx`;
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      break;
    
    case 'csv':
      const csvContent = generateCSVSimple(exportData);
      buffer = Buffer.from(csvContent, 'utf-8');
      filename = `${safeDocumentNumber}.csv`;
      mimeType = 'text/csv';
      break;
    
    default:
      throw new Error('Неподдерживаемый формат экспорта');
  }

  // Создаем записи в БД только если документ новый
  let dbResult = null;
  if (!existingDocument) {
    try {
      dbResult = await createDocumentRecordsSimple(type, clientId, itemsForExport, totalAmount, documentNumberForDB, parentDocumentId, cartSessionId);
      logger.info('Записи в БД созданы', 'puppeteer-generator', { documentId: dbResult.id, type: dbResult.type, documentNumber: documentNumberForDB });
    } catch (error) {
      logger.error('Ошибка создания записей в БД', 'puppeteer-generator', error instanceof Error ? { error: error.message, stack: error.stack, type, clientId } : { error: String(error), type, clientId });
    }
  } else {
    logger.debug('Используем существующий документ в БД', 'puppeteer-generator', { documentNumber: documentNumberForDB, documentId, type });
    dbResult = { id: documentId, type: type };
  }

  const endTime = Date.now();
  const duration = endTime - startTime;
  logger.info('Экспорт завершен', 'puppeteer-generator', { duration, type, format, itemsCount: items.length });

  return {
    buffer,
    filename,
    mimeType,
    documentNumber: documentNumberForExport,
    documentId: dbResult?.id,
    documentType: dbResult?.type
  };
}

// Простая генерация CSV
function generateCSVSimple(data: any): string {
  const headers = ['№', 'Артикул', 'Наименование', 'Количество', 'Цена', 'Сумма'];
  const rows = data.items.map((item: any, index: number) => [
    index + 1,
    item.sku ?? '',
    `"${item.name}"`,
    item.quantity,
    item.unitPrice,
    item.total
  ]);
  
  return [headers.join(','), ...rows.map((row: any[]) => row.join(','))].join('\n');
}

// Пакетное создание записей в БД с поддержкой parent_document_id и cart_session_id
async function createDocumentRecordsSimple(
  type: 'quote' | 'invoice' | 'order',
  clientId: string,
  items: any[],
  totalAmount: number,
  documentNumber: string,
  parentDocumentId?: string | null,
  cartSessionId?: string | null
) {
  const client = await prisma.client.findUnique({
    where: { id: clientId }
  });

  if (!client) {
    throw new Error('Клиент не найден');
  }

  if (type === 'quote') {
    const quote = await prisma.quote.create({
      data: {
        number: documentNumber,
        parent_document_id: parentDocumentId,
        cart_session_id: cartSessionId,
        client_id: clientId,
        created_by: 'system',
        status: 'DRAFT',
        subtotal: totalAmount,
        total_amount: totalAmount,
        currency: 'RUB',
        notes: 'Сгенерировано из конфигуратора дверей',
        cart_data: JSON.stringify(items) // Сохраняем данные корзины
      } as any
    });

    const quoteItems = items.map((item, i) => {
      const name = getItemDisplayName(item);
      return {
        quote_id: quote.id,
        product_id: item.id || `temp_${i}`,
        quantity: item.qty || item.quantity || 1,
        unit_price: item.unitPrice || 0,
        total_price: (item.qty || item.quantity || 1) * (item.unitPrice || 0),
        notes: name // Убираем артикул из notes
      };
    });

    await prisma.quoteItem.createMany({
      data: quoteItems
    });

    return { id: quote.id, type: 'quote' };

  } else if (type === 'invoice') {
    const invoice = await prisma.invoice.create({
      data: {
        number: documentNumber,
        parent_document_id: parentDocumentId,
        cart_session_id: cartSessionId,
        client_id: clientId,
        created_by: 'system',
        status: 'DRAFT',
        subtotal: totalAmount,
        total_amount: totalAmount,
        currency: 'RUB',
        notes: 'Сгенерировано из конфигуратора дверей',
        cart_data: JSON.stringify(items) // Сохраняем данные корзины
      } as any
    });

    const invoiceItems = items.map((item, i) => {
      const name = getItemDisplayName(item);
      return {
        invoice_id: invoice.id,
        product_id: item.id || `temp_${i}`,
        quantity: item.qty || item.quantity || 1,
        unit_price: item.unitPrice || 0,
        total_price: (item.qty || item.quantity || 1) * (item.unitPrice || 0),
        notes: name // Убираем артикул из notes
      };
    });

    await prisma.invoiceItem.createMany({
      data: invoiceItems
    });

    return { id: invoice.id, type: 'invoice' };

  } else if (type === 'order') {
    const order = await prisma.order.create({
      data: {
        number: documentNumber,
        parent_document_id: parentDocumentId,
        cart_session_id: cartSessionId,
        client_id: clientId,
        created_by: 'system',
        status: 'PENDING',
        subtotal: totalAmount,
        total_amount: totalAmount,
        currency: 'RUB',
        notes: 'Сгенерировано из конфигуратора дверей',
        cart_data: JSON.stringify(items) // Сохраняем данные корзины
      } as any
    });

    const orderItems = items.map((item, i) => {
      const name = getItemDisplayName(item);
      return {
        order_id: order.id,
        product_id: item.id || `temp_${i}`,
        quantity: item.qty || item.quantity || 1,
        unit_price: item.unitPrice || 0,
        total_price: (item.qty || item.quantity || 1) * (item.unitPrice || 0),
        notes: name // Убираем артикул из notes
      };
    });

    await prisma.orderItem.createMany({
      data: orderItems
    });

    return { id: order.id, type: 'order' };
  }

  throw new Error('Неподдерживаемый тип документа');
}

// Очистка ресурсов
export async function cleanupExportResources() {
  // Puppeteer автоматически закрывает браузеры
}

// Экспортируем функции для использования в других модулях
export { findExistingDocumentDedup as findExistingDocument, createDocumentRecordsSimple as createDocumentRecord };