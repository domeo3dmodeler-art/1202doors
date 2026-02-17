import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import ExcelJS from 'exceljs';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { getDisplayNameForExport, formatMirrorForExcel, formatArchitraveDisplay } from '@/lib/export/puppeteer-generator';
import { getMatchingProducts, getModelNameByCode, getFirstProductPropsByModelCode } from '@/lib/catalog/product-match';
import { EXCEL_DOOR_FIELDS, getDoorFieldValue, type ExcelDoorFieldName } from '@/lib/export/excel-door-fields';

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

    // Подготавливаем данные для генерации Excel (все поля корзины: опции двери, breakdown для колонок «X, цена», model_name для «Название модели»)
    const excelData = {
      items: cartData.items.map((item: any) => ({
        ...item,
        id: item.id || item.sku || 'N/A',
        sku: item.id || 'N/A',
        name: item.name,
        qty: item.qty ?? item.quantity ?? 1,
        quantity: item.quantity ?? item.qty ?? 1,
        unitPrice: item.unitPrice ?? item.price ?? 0,
        total: (item.quantity ?? item.qty ?? 1) * (item.unitPrice ?? item.price ?? 0),
        model: item.model,
        model_name: item.model_name,
        finish: item.finish,
        color: item.color,
        width: item.width,
        height: item.height,
        type: item.type ?? item.itemType,
        itemType: item.itemType ?? item.type,
        handleId: item.handleId,
        handleName: item.handleName,
        hardwareKitName: item.hardwareKitName,
        hardware: item.hardware,
        edge: item.edge,
        edgeId: item.edgeId ?? item.edge_id,
        edgeColorName: item.edgeColorName ?? item.edge_color_name,
        edge_color_name: item.edge_color_name ?? item.edgeColorName,
        glassColor: item.glassColor ?? item.glass_color,
        glass_color: item.glass_color ?? item.glassColor,
        reversible: item.reversible,
        mirror: item.mirror,
        threshold: item.threshold === true || item.threshold === 1 || (typeof item.threshold === 'string' && String(item.threshold).toLowerCase().trim() === 'да'),
        optionIds: item.optionIds ?? item.option_ids,
        architraveNames: item.architraveNames ?? item.architrave_names,
        architraveName: item.architraveName,
        optionNames: item.optionNames ?? item.option_names,
        sku_1c: item.sku_1c,
        price_opt: item.price_opt,
        breakdown: item.breakdown,
        matchingVariants: item.matchingVariants ?? item.matching_variants,
        style: item.style
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
    
    const dbFields = [...EXCEL_DOOR_FIELDS];
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

      // Ищем подходящие товары в БД (строгое совпадение: данные корзины = из БД)
      const matchingProducts = await getMatchingProducts(item);
      logger.debug('Найдено подходящих товаров в БД', 'supplier-orders/excel', { itemName: item.name, matchingProductsCount: matchingProducts.length });
      
      if (matchingProducts.length === 0) {
        logger.warn('Экспорт: нет совпадения в БД — используется fallback из корзины (при строгих данных из БД такого быть не должно)', 'supplier-orders/excel', { itemName: item.name, itemModel: item.model, itemFinish: item.finish, itemColor: item.color });
        
        // Если не найдено товаров, создаем строку с данными из корзины
        const row = worksheet.getRow(rowIndex);
        
        // Базовые поля: полный набор опций двери / ручки / ограничителя
        row.getCell(1).value = globalRowNumber++; // №
        row.getCell(2).value = getDisplayNameForExport(item); // Наименование
        row.getCell(3).value = item.quantity || item.qty || 1; // Количество
        row.getCell(4).value = item.unitPrice || 0; // Цена
        row.getCell(5).value = (item.quantity || item.qty || 1) * (item.unitPrice || 0); // Сумма
        
        // Форматирование чисел (без .00 и с разделителями групп разрядов)
        row.getCell(4).numFmt = '#,##0';
        row.getCell(5).numFmt = '#,##0';
        
        const isDoor = !!(item.model || item.width != null || (item.finish != null && item.finish !== ''));
        const modelNameFallback = (item.model || '').toString().replace(/DomeoDoors_/g, '').replace(/_/g, ' ').trim() || '';
        const fallbackModelName = isDoor ? (await getModelNameByCode(item.model)) || modelNameFallback : '';
        // Подставляем данные из БД по коду модели, чтобы заполнить Цена РРЦ, Поставщик, Покрытие, Толщина и т.д.
        const fallbackProps = isDoor ? await getFirstProductPropsByModelCode(item.model) : null;
        const mergedProps = fallbackProps
          ? {
              ...fallbackProps,
              ...(item.width != null && { 'Ширина/мм': item.width }),
              ...(item.height != null && { 'Высота/мм': item.height })
            }
          : undefined;
        const source = {
          item: item as any,
          supplierName: data.supplier?.name ?? '',
          fallbackModelName,
          ...(mergedProps && { props: mergedProps })
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
        
        // Базовые поля (заполняем только один раз): полный набор опций двери / ручки / ограничителя
        row.getCell(1).value = globalRowNumber++; // №
        row.getCell(2).value = getDisplayNameForExport(item); // Наименование из корзины
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
              
              const source = {
                item: item as any,
                supplierName: data.supplier?.name ?? '',
                props
              };
              logger.debug('Тип товара, заполняем поля', 'supplier-orders/excel', { itemType: item.type, sku: productData.sku });
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

    // Ширина колонок: Наименование — шире для полного текста
    worksheet.columns.forEach((column, index) => {
      if (index === 1) {
        column.width = 50; // Наименование
      } else if (index < 6) {
        column.width = 15;
      } else {
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

