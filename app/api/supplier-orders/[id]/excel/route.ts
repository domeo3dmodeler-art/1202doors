import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import ExcelJS from 'exceljs';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';

// Поиск ручки в БД по ID
async function findHandleById(handleId: string) {
  logger.debug('Ищем ручку по ID', 'supplier-orders/excel', { handleId });
  
  const handle = await prisma.product.findFirst({
    where: {
      id: handleId,
      catalog_category: { name: "Ручки" }
    },
    select: { id: true, properties_data: true, name: true, sku: true }
  });

  if (handle) {
    logger.debug('Найдена ручка', 'supplier-orders/excel', { sku: handle.sku });
    return [handle];
  } else {
    logger.debug('Ручка не найдена в БД', 'supplier-orders/excel', { handleId });
    return [];
  }
}

// GET /api/supplier-orders/[id]/excel - Экспорт заказа у поставщика в Excel
async function handler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  try {
    const { id } = await params;

    // Получаем заказ у поставщика
    const supplierOrder = await prisma.supplierOrder.findUnique({
      where: { id },
      select: {
        id: true,
        parent_document_id: true,
        supplier_name: true,
        supplier_email: true,
        supplier_phone: true,
        expected_date: true,
        notes: true,
        cart_data: true
      }
    });

    if (!supplierOrder) {
      throw new NotFoundError('Заказ у поставщика', id);
    }

    logger.debug('Supplier order cart_data', 'supplier-orders/excel', { supplierOrderId: supplierOrder.id, hasCartData: !!supplierOrder.cart_data });

    // Получаем связанный Order и клиента через Order
    // SupplierOrder связан с Order через parent_document_id
    const order = await prisma.order.findUnique({
      where: { id: supplierOrder.parent_document_id },
      select: {
        id: true,
        client_id: true,
        invoice: {
          select: {
            id: true,
            status: true
          }
        }
      }
    });

    if (!order) {
      throw new NotFoundError('Связанный заказ', supplierOrder.parent_document_id || 'unknown');
    }

    // Получаем клиента по client_id из Order
    const client = await prisma.client.findUnique({
      where: { id: order.client_id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        middleName: true,
        phone: true,
        address: true
      }
    });

    if (!client) {
      throw new NotFoundError('Клиент', order.client_id);
    }

    // Получаем данные корзины
    let cartData = null;
    if (supplierOrder.cart_data) {
      try {
        const parsedData = JSON.parse(supplierOrder.cart_data);
        logger.debug('Parsed cart data', 'supplier-orders/excel', { itemsCount: Array.isArray(parsedData) ? parsedData.length : parsedData.items?.length || 1 });
        
        // Проверяем, является ли это массивом товаров или объектом с items
        if (Array.isArray(parsedData)) {
          // Если это массив товаров, оборачиваем в объект с items
          cartData = { items: parsedData };
        } else if (parsedData.items) {
          // Если это уже объект с items, используем как есть
          cartData = parsedData;
        } else {
          // Если это объект без items, оборачиваем в items
          cartData = { items: [parsedData] };
        }
        logger.debug('Final cart data', 'supplier-orders/excel', { itemsCount: cartData.items?.length || 0 });
      } catch (error) {
        logger.error('Error parsing cart_data', 'supplier-orders/excel', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
      }
    }

    if (!cartData || !cartData.items || cartData.items.length === 0) {
      return apiError(
        ApiErrorCode.VALIDATION_ERROR,
        'Нет данных корзины для этого заказа у поставщика',
        400
      );
    }

    // Подготавливаем данные для генерации Excel
    const excelData = {
      items: cartData.items.map((item: any) => ({
        sku: item.id || 'N/A',
        name: item.type === 'handle' 
          ? (item.handleName || item.name || 'Ручка')
          : (item.name || `Дверь ${item.model?.replace(/DomeoDoors_/g, 'DomeoDoors ').replace(/_/g, ' ')} (${item.finish}, ${item.color}, ${item.width} × ${item.height} мм, Комплект фурнитуры - ${(item.hardwareKitName || item.hardware || 'Базовый').replace(/^Комплект фурнитуры — /, '')})` || 'Товар'),
        quantity: item.quantity || item.qty || 1,
        unitPrice: item.unitPrice || 0,
        total: (item.quantity || item.qty || 1) * (item.unitPrice || 0),
        // Добавляем поля конфигурации для поиска в БД
        model: item.model,
        finish: item.finish,
        color: item.color,
        width: item.width,
        height: item.height,
        // КРИТИЧНО: передаем тип товара для правильной логики
        type: item.type,
        handleId: item.handleId,
        handleName: item.handleName,
        // Добавляем информацию о комплекте фурнитуры
        hardwareKitName: item.hardwareKitName,
        hardware: item.hardware
      }))
    };

    // Генерируем Excel файл с дополнительной информацией
    const buffer = await generateExcel({
      ...excelData,
      client: client,
      supplier: {
        name: supplierOrder.supplier_name,
        email: supplierOrder.supplier_email,
        phone: supplierOrder.supplier_phone
      },
      supplierOrderId: supplierOrder.id,
      orderDate: supplierOrder.created_at || new Date(),
      expectedDate: supplierOrder.expected_date,
      notes: supplierOrder.notes
    });

    // Возвращаем файл с безопасным именем
    const safeFilename = `Supplier_Order_${supplierOrder.id.slice(-6)}.xlsx`;
    
    logger.info('Excel файл заказа у поставщика сгенерирован', 'supplier-orders/excel', {
      supplierOrderId: id,
      itemsCount: cartData.items.length,
      userId: user.userId
    }, loggingContext);
    
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Content-Length': buffer.length.toString(),
      },
    });

  } catch (error) {
    logger.error('Error generating Excel for supplier order', 'supplier-orders/excel', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) }, loggingContext);
    throw error;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth(async (request: NextRequest, user: AuthenticatedUser) => {
      return await handler(request, user, { params });
    }),
    'supplier-orders/[id]/excel'
  )(req);
}

// Генерация Excel файла с использованием шаблона категории
async function generateExcel(data: any): Promise<Buffer> {
  const startTime = Date.now();
  logger.info('Начинаем генерацию Excel заказа у поставщика с полными свойствами', 'supplier-orders/excel');

  try {
    // Получаем шаблон для дверей
    const template = await getDoorTemplate();
    logger.debug('Поля шаблона', 'supplier-orders/excel', { exportFieldsCount: template.exportFields.length });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Заказ у поставщика');
    
    // Заголовок документа (объединяем ячейки A1:Z1)
    worksheet.mergeCells('A1:Z1');
    worksheet.getCell('A1').value = 'ЗАКАЗ У ПОСТАВЩИКА';
    worksheet.getCell('A1').font = { size: 16, bold: true };
    worksheet.getCell('A1').alignment = { horizontal: 'center' };

    // Информация о клиенте
    worksheet.getCell('A3').value = 'Клиент:';
    worksheet.getCell('B3').value = `${data.client.lastName} ${data.client.firstName} ${data.client.middleName || ''}`.trim();
    worksheet.getCell('A4').value = 'Телефон:';
    worksheet.getCell('B4').value = data.client.phone || 'N/A';
    worksheet.getCell('A5').value = 'Адрес:';
    worksheet.getCell('B5').value = data.client.address || 'N/A';

    // Информация о поставщике
    worksheet.getCell('A7').value = 'Поставщик:';
    worksheet.getCell('B7').value = data.supplier.name || 'N/A';
    worksheet.getCell('A8').value = 'Email:';
    worksheet.getCell('B8').value = data.supplier.email || 'N/A';
    worksheet.getCell('A9').value = 'Телефон:';
    worksheet.getCell('B9').value = data.supplier.phone || 'N/A';

    // Номер документа и дата
    worksheet.getCell('A11').value = 'Номер документа:';
    worksheet.getCell('B11').value = `SUPPLIER-ORDER-${data.supplierOrderId?.slice(-6) || 'UNKNOWN'}`;
    worksheet.getCell('A12').value = 'Дата:';
    worksheet.getCell('B12').value = new Date().toLocaleDateString('ru-RU');

    // Базовые заголовки + поля из БД в нужном порядке
    const baseHeaders = ['№', 'Наименование', 'Количество', 'Цена', 'Сумма'];
    
    // Определяем нужные поля из БД в правильном порядке (как в оригинале)
    const dbFields = [
      'Цена опт',
      'Цена РРЦ', 
      'Поставщик',
      'Наименование у поставщика',
      'Материал/Покрытие',
      'Размер 1',
      'Размер 2', 
      'Размер 3',
      'Цвет/Отделка',
      'SKU внутреннее',
      'Артикул поставщика'
    ];
    
    const allHeaders = [...baseHeaders, ...dbFields];
    
    // Устанавливаем заголовки (строка 10, как в оригинале!)
    worksheet.getRow(10).values = allHeaders;
    worksheet.getRow(10).font = { bold: true };
    
    // Цветовая схема: данные из корзины - голубой, данные из БД - бежевый (как в оригинале!)
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

    // Добавляем границы для заголовков (как в оригинале!)
    // Первая ячейка заголовка - полные границы
    const firstHeaderCell = worksheet.getCell(10, 1);
    firstHeaderCell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } }
    };
    
    // Остальные ячейки заголовков - только нижняя граница
    for (let col = 2; col <= allHeaders.length; col++) {
      const headerCell = worksheet.getCell(10, col);
      headerCell.border = {
        bottom: { style: 'thin', color: { argb: 'FF000000' } }
      };
    }

    // Обрабатываем каждый товар из корзины (начинаем со строки 11!)
    let rowIndex = 11;
    let globalRowNumber = 1;
    
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      logger.debug('Обрабатываем товар из корзины', 'supplier-orders/excel', { itemIndex: i + 1, itemName: item.name, itemType: item.type });

      // Ищем подходящие товары в БД
      let matchingProducts: any[] = [];
      if (item.type === 'handle' && item.handleId) {
        // Для ручек используем специальную функцию
        matchingProducts = await findHandleById(item.handleId);
      } else {
        // Для дверей используем обычную функцию
        const result = await findAllProductsByConfiguration(item);
        matchingProducts = result || [];
      }
      logger.debug('Найдено подходящих товаров в БД', 'supplier-orders/excel', { itemName: item.name, matchingProductsCount: matchingProducts.length });
      
      if (matchingProducts.length === 0) {
        logger.warn('Не найдено подходящих товаров, создаем строку с данными из корзины', 'supplier-orders/excel', { itemName: item.name });
        
        // Если не найдено товаров, создаем строку с данными из корзины
        const row = worksheet.getRow(rowIndex);
        
        // Базовые поля
        row.getCell(1).value = globalRowNumber++; // №
        row.getCell(2).value = item.name; // Наименование
        row.getCell(3).value = item.quantity || item.qty || 1; // Количество
        row.getCell(4).value = item.unitPrice || 0; // Цена
        row.getCell(5).value = (item.quantity || item.qty || 1) * (item.unitPrice || 0); // Сумма
        
        // Форматирование чисел (без .00 и с разделителями групп разрядов)
        row.getCell(4).numFmt = '#,##0';
        row.getCell(5).numFmt = '#,##0';
        
        // Заполняем пустыми значениями для полей из БД
        let colIndex = 6;
        dbFields.forEach(() => {
          row.getCell(colIndex).value = '';
          colIndex++;
        });
        
        // Цветовое выделение и выравнивание: строка из корзины - белый фон
        for (let col = 1; col <= worksheet.columnCount; col++) {
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
          
          // Границы для всех ячеек (включая данные из шаблона!)
          row.getCell(col).border = {
            bottom: { style: 'thin', color: { argb: 'FF000000' } }
          };
        }
        
        rowIndex++;
      } else {
        // Создаем одну строку корзины с объединенными ячейками для данных из БД (как в оригинале!)
        logger.debug('Создаем объединенную строку для товара из корзины', 'supplier-orders/excel', { itemName: item.name, variantsCount: matchingProducts.length });
        
        const row = worksheet.getRow(rowIndex);
        
        // Базовые поля (заполняем только один раз)
        row.getCell(1).value = globalRowNumber++; // №
        row.getCell(2).value = item.name; // Наименование из корзины
        row.getCell(3).value = item.quantity || item.qty || 1; // Количество из корзины
        row.getCell(4).value = item.unitPrice || 0; // Цена из корзины
        row.getCell(5).value = (item.quantity || item.qty || 1) * (item.unitPrice || 0); // Сумма
        
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
          logger.debug('Заполняем поля из БД для товара', 'supplier-orders/excel', { sku: productData.sku, productIndex: productIndex + 1, totalProducts: matchingProducts.length });
          
          const currentRow = worksheet.getRow(currentRowIndex);
          let colIndex = 6; // Начинаем с 6-й колонки (после базовых)
          
          if (productData.properties_data) {
            try {
              const props = typeof productData.properties_data === 'string' 
                ? JSON.parse(productData.properties_data) 
                : productData.properties_data;
              
              // Заполняем поля в нужном порядке
              logger.debug('Тип товара, заполняем поля', 'supplier-orders/excel', { itemType: item.type, sku: productData.sku, isHandle: item.type === 'handle' });
              dbFields.forEach(fieldName => {
                let value = '';
                
                // Универсальная логика для всех товаров (как в puppeteer-generator.ts)
                if (fieldName === 'Наименование у поставщика') {
                  // Для всех товаров используем правильные поля
                  value = props['Фабрика_наименование'] || props['Наименование двери у поставщика'] || props['Наименование поставщика'] || props['Наименование'] || '';
                } else if (fieldName === 'Материал/Покрытие') {
                  // Для дверей: Материал/Покрытие, для ручек: пустое
                  if (item.type === 'handle') {
                    value = ''; // Ручки не заполняют материал
                  } else {
                    value = props['Материал/Покрытие'] || props['Тип покрытия'] || '';
                  }
                } else if (fieldName === 'Размер 1') {
                  // Для дверей: Ширина/мм, для ручек: пустое
                  if (item.type === 'handle') {
                    value = ''; // Ручки не заполняют размеры
                  } else {
                    value = props['Ширина/мм'] || '';
                  }
                } else if (fieldName === 'Размер 2') {
                  // Для дверей: Высота/мм, для ручек: пустое
                  if (item.type === 'handle') {
                    value = ''; // Ручки не заполняют размеры
                  } else {
                    value = props['Высота/мм'] || '';
                  }
                } else if (fieldName === 'Размер 3') {
                  // Для дверей: Толщина/мм, для ручек: пустое
                  if (item.type === 'handle') {
                    value = ''; // Ручки не заполняют размеры
                  } else {
                    value = props['Толщина/мм'] || '';
                  }
                } else if (fieldName === 'Цвет/Отделка') {
                  // Для всех товаров используем Цвет/Отделка
                  value = props['Цвет/Отделка'] || props['Domeo_Цвет'] || '';
                } else {
                  // Остальные поля заполняем как обычно
                  if (item.type === 'handle') {
                    // Для ручек используем специальную логику для некоторых полей
                    if (fieldName === 'Цена РРЦ') {
                      value = props['Цена розница'] || props['Цена РРЦ'] || '';
                    } else if (fieldName === 'Артикул поставщика') {
                      value = props['Фабрика_артикул'] || props['Артикул поставщика'] || '';
                    } else {
                      value = props[fieldName] || '';
                    }
                  } else {
                    // Для дверей используем стандартную логику
                    value = props[fieldName] || '';
                  }
                }
                
                if (value !== undefined && value !== null && value !== '') {
                  // Специальное форматирование для цен
                  if (fieldName === 'Цена опт' || fieldName === 'Цена РРЦ') {
                    const numValue = parseFloat(String(value));
                    if (!isNaN(numValue)) {
                      currentRow.getCell(colIndex).value = numValue;
                      currentRow.getCell(colIndex).numFmt = '#,##0';
                    } else {
                      currentRow.getCell(colIndex).value = '';
                    }
                  } else {
                    currentRow.getCell(colIndex).value = String(value);
                  }
                } else {
                  currentRow.getCell(colIndex).value = '';
                }
                colIndex++;
              });
            } catch (e) {
              logger.warn('Ошибка парсинга properties_data для товара', 'supplier-orders/excel', { sku: productData.sku, error: e instanceof Error ? e.message : String(e) });
              // Заполняем пустыми значениями
              dbFields.forEach(() => {
                currentRow.getCell(colIndex).value = '';
                colIndex++;
              });
            }
          } else {
            logger.debug('Нет properties_data для товара', 'supplier-orders/excel', { sku: productData.sku });
            // Заполняем пустыми значениями
            dbFields.forEach(() => {
              currentRow.getCell(colIndex).value = '';
              colIndex++;
            });
          }
          
          // Цветовое выделение и выравнивание: строка из БД - светло-серый фон (как в оригинале!)
          for (let col = 1; col <= worksheet.columnCount; col++) {
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
            
            // Границы для всех ячеек (включая данные из шаблона!)
            currentRow.getCell(col).border = {
              bottom: { style: 'thin', color: { argb: 'FF000000' } }
            };
          }
          
          currentRowIndex++;
        }
        
        // Обновляем rowIndex для следующего товара из корзины
        rowIndex = currentRowIndex;
      }
    }

    // Итого
    const totalRow = worksheet.getRow(rowIndex + 1);
    totalRow.getCell(4).value = 'Итого:';
    totalRow.getCell(4).font = { bold: true };
    totalRow.getCell(4).alignment = { horizontal: 'right' };
    totalRow.getCell(5).value = data.items.reduce((sum: number, item: any) => sum + (item.total || 0), 0);
    totalRow.getCell(5).numFmt = '#,##0';
    totalRow.getCell(5).font = { bold: true };

    // Автоподбор ширины колонок
    worksheet.columns.forEach((column, index) => {
      if (index < 6) {
        // Базовые колонки
        column.width = 15;
      } else {
        // Колонки свойств
        column.width = 20;
      }
    });

    const buffer = await workbook.xlsx.writeBuffer() as Buffer;
    
    const endTime = Date.now();
    logger.info('Excel заказа у поставщика сгенерирован', 'supplier-orders/excel', { duration: endTime - startTime });
    
    return buffer;

  } catch (error) {
    logger.error('Ошибка генерации Excel заказа у поставщика', 'supplier-orders/excel', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    throw error;
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

// Поиск ВСЕХ товаров в БД по точной конфигурации (как в оригинале)
async function findAllProductsByConfiguration(item: any) {
  logger.debug('Ищем ВСЕ товары по конфигурации', 'supplier-orders/excel', {
    model: item.model,
    finish: item.finish,
    color: item.color,
    width: item.width,
    height: item.height,
    itemType: item.type
  });

  // Получаем все товары категории дверей
  const allProducts = await prisma.product.findMany({
    where: {
      catalog_category: { name: "Межкомнатные двери" }
    },
    select: { properties_data: true, name: true, sku: true }
  });

  logger.debug('Найдено товаров для поиска', 'supplier-orders/excel', { totalProducts: allProducts.length });

  const matchingProducts = [];

  for (const product of allProducts) {
    if (product.properties_data) {
      try {
        const props = typeof product.properties_data === 'string' 
          ? JSON.parse(product.properties_data) 
          : product.properties_data;
        
        // Проверяем соответствие конфигурации с гибким поиском
        const modelMatch = !item.model || 
          props['Domeo_Название модели для Web'] === item.model ||
          props['Domeo_Название модели для Web']?.includes(item.model) ||
          item.model?.includes(props['Domeo_Название модели для Web']);
        const finishMatch = !item.finish || 
          props['Материал/Покрытие'] === item.finish ||
          props['Тип покрытия'] === item.finish;
        const colorMatch = !item.color || 
          props['Цвет/Отделка'] === item.color ||
          props['Domeo_Цвет'] === item.color;
        // Исправляем сравнение размеров - приводим к строкам для сравнения
        const widthMatch = !item.width || 
          String(props['Ширина/мм']) === String(item.width) ||
          String(props['Размер 1']) === String(item.width);
        const heightMatch = !item.height || 
          String(props['Высота/мм']) === String(item.height) ||
          String(props['Размер 2']) === String(item.height);
        
        if (modelMatch && finishMatch && colorMatch && widthMatch && heightMatch) {
          logger.debug('Найден подходящий товар', 'supplier-orders/excel', { sku: product.sku, modelMatch, finishMatch, colorMatch, widthMatch, heightMatch });
          matchingProducts.push({
            ...product,
            properties_data: props
          });
        } else {
          // Логируем только первые несколько несовпадений для отладки
          if (matchingProducts.length < 3) {
            logger.debug('Товар не подходит', 'supplier-orders/excel', {
              sku: product.sku,
              modelMatch, finishMatch, colorMatch, widthMatch, heightMatch,
              itemModel: item.model, itemFinish: item.finish, itemColor: item.color,
              itemWidth: item.width, itemHeight: item.height,
              dbModel: props['Domeo_Название модели для Web'],
              dbFinish: props['Материал/Покрытие'],
              dbColor: props['Цвет/Отделка'],
              dbWidth: props['Размер 1'],
              dbHeight: props['Размер 2']
            });
          }
        }
      } catch (e) {
        logger.warn('Ошибка парсинга properties_data', 'supplier-orders/excel', { sku: product.sku, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }

  logger.debug('Найдено подходящих товаров', 'supplier-orders/excel', { matchingProductsCount: matchingProducts.length });
  return matchingProducts;
}

// Получение значения поля из properties_data
function getFieldValue(propertiesData: any, fieldName: string): string {
  if (!propertiesData || typeof propertiesData !== 'object') {
    return '';
  }
  
  return propertiesData[fieldName] || '';
}
