import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';
import { apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError, NotFoundError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';
import * as XLSX from 'xlsx';
import { validateAndFixData } from '@/lib/encoding-utils';

async function getHandler(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const catalogCategoryId = searchParams.get('catalogCategoryId');
    
    if (!catalogCategoryId) {
      throw new ValidationError('catalogCategoryId обязателен');
    }

    logger.info('Экспорт прайса в Excel для категории', 'admin/export/price-list', { userId: user.userId, catalogCategoryId });

    // Получаем категорию
    const category = await prisma.catalogCategory.findUnique({
      where: { id: catalogCategoryId },
      select: { name: true }
    });

    if (!category) {
      throw new NotFoundError('Category not found');
    }

    logger.info('Категория найдена', 'admin/export/price-list', { categoryName: category.name });

    // Получаем товары с ограничением для производительности
    const products = await prisma.product.findMany({
      where: { catalog_category_id: catalogCategoryId },
      select: {
        id: true,
        sku: true,
        name: true,
        properties_data: true,
        base_price: true,
        stock_quantity: true
      },
      take: 10000, // Ограничиваем до 10,000 товаров для производительности
      orderBy: { sku: 'asc' }
    });

    logger.info(`Найдено товаров для экспорта: ${products.length}`, 'admin/export/price-list', { catalogCategoryId, productsCount: products.length });

    // Получаем шаблон для fallback
    const template = await prisma.importTemplate.findUnique({
      where: { catalog_category_id: catalogCategoryId }
    });

    // Получаем настройки экспорта
    const exportConfigResponse = await fetch(`${req.url.split('/api')[0]}/api/admin/export/config?catalogCategoryId=${catalogCategoryId}&exportType=price_list`);
    let exportConfig = null;
    
    if (exportConfigResponse.ok) {
      const configData = await exportConfigResponse.json();
      if (configData.success) {
        exportConfig = configData.config;
      }
    }

    // Собираем все уникальные поля свойств из всех товаров
    const allPropertyFields = new Set<string>();
    
    products.forEach(product => {
      if (product.properties_data) {
        try {
          const properties = typeof product.properties_data === 'string' 
            ? JSON.parse(product.properties_data) 
            : product.properties_data;
          
          Object.keys(properties).forEach(key => {
            if (key && key.trim() !== '') {
              allPropertyFields.add(key);
            }
          });
        } catch (e) {
          logger.warn(`Ошибка парсинга свойств для товара`, 'admin/export/price-list', { productId: product.id, error: e instanceof Error ? e.message : String(e) });
        }
      }
    });

    // Сортируем поля для консистентности
    let sortedPropertyFields = Array.from(allPropertyFields).sort();
    
    // Проверяем, есть ли "SKU внутреннее" в properties
    const skuInternalField = 'SKU внутреннее';
    const hasSkuInternal = sortedPropertyFields.includes(skuInternalField);
    
    // Убираем "SKU внутреннее" из сортированного списка (если есть)
    if (hasSkuInternal) {
      sortedPropertyFields = sortedPropertyFields.filter(field => field !== skuInternalField);
    }
    
    // Проверяем, есть ли поля цен в properties
    // Варианты названий для цены РРЦ
    const priceRrcVariants = [
      'Цена ррц (включая цену полотна, короба, наличников, доборов)',
      'Цена РРЦ',
      'Цена ррц',
      'Цена розница',
      'РРЦ'
    ];
    
    // Варианты названий для цены опт
    const priceOptVariants = [
      'Цена опт',
      'Цена оптовая',
      'Опт'
    ];
    
    // Проверяем, есть ли уже эти поля в properties
    // НЕ удаляем их из sortedPropertyFields - они должны остаться в экспорте
    const hasPriceRrc = priceRrcVariants.some(variant => sortedPropertyFields.includes(variant));
    const hasPriceOpt = priceOptVariants.some(variant => sortedPropertyFields.includes(variant));
    
    // Создаем заголовки
    // "SKU внутреннее" всегда в начале (из properties, если есть, иначе из product.sku)
    // Затем все остальные поля свойств (ВКЛЮЧАЯ поля цен, если они есть в properties)
    // Затем добавляем стандартные поля цен в конце ТОЛЬКО если их нет в properties
    const headers = [
      skuInternalField, // Всегда в начале
      ...sortedPropertyFields, // Все поля свойств (включая цены, если они есть)
      ...(hasPriceRrc ? [] : ['Цена ррц (включая цену полотна, короба, наличников, доборов)']),
      ...(hasPriceOpt ? [] : ['Цена опт'])
    ];
    
    const data: (string | number)[][] = [];

    // Добавляем данные товаров
    products.forEach((product) => {
      const row: (string | number)[] = [];

      // Парсим свойства товара с исправлением кодировки
      let properties: Record<string, unknown> = {};
      if (product.properties_data) {
        try {
          const rawProperties = typeof product.properties_data === 'string' 
            ? JSON.parse(product.properties_data) as Record<string, unknown>
            : (product.properties_data as Record<string, unknown>);
          properties = validateAndFixData(rawProperties) as Record<string, unknown>;
        } catch (e) {
          logger.error(`Ошибка парсинга свойств для товара`, 'admin/export/price-list', { productId: product.id, error: e instanceof Error ? e.message : String(e) });
        }
      }

      // SKU внутреннее всегда первое - берем из properties, если есть, иначе из product.sku
      const skuRaw = hasSkuInternal ? properties[skuInternalField] : undefined;
      const skuValue = (typeof skuRaw === 'string' || typeof skuRaw === 'number' ? String(skuRaw) : product.sku || '') || '-';
      row.push(skuValue);

      // Добавляем все поля свойств в том же порядке (без "SKU внутреннее" и цен, если они были)
      sortedPropertyFields.forEach((field: string) => {
        const value = properties[field];
        
        // Обрабатываем пустые значения (в ячейку только string | number)
        if (value === undefined || value === null || value === '') {
          row.push('-');
        } else if (typeof value === 'number') {
          row.push(value);
        } else if (typeof value === 'string') {
          row.push(!isNaN(Number(value)) ? Number(value) : value);
        } else {
          row.push(JSON.stringify(value));
        }
      });

      // Добавляем цену ррц только если её нет в properties
      if (!hasPriceRrc) {
        const priceRrcFull = properties['Цена ррц (включая цену полотна, короба, наличников, доборов)'] 
          || properties['Цена РРЦ'] 
          || properties['Цена ррц']
          || properties['Цена розница']
          || '';
        row.push(priceRrcFull && !isNaN(Number(priceRrcFull)) ? Number(priceRrcFull) : '-');
      }

      // Добавляем цену опт только если её нет в properties
      if (!hasPriceOpt) {
        const priceOpt = properties['Цена опт'] || properties['Цена оптовая'] || '';
        row.push(priceOpt && !isNaN(Number(priceOpt)) ? Number(priceOpt) : '-');
      }

      data.push(row);
    });

    // Создаем Excel файл
    const worksheet = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Прайс');

    // Генерируем Excel файл
    const excelBuffer = XLSX.write(workbook, { 
      type: 'buffer', 
      bookType: 'xlsx',
      compression: true
    });

    // Создаем безопасное имя файла
    const safeCategoryName = category.name.replace(/[^a-zA-Z0-9а-яА-Я\s]/g, '_');
    const fileName = `price_${safeCategoryName}_${new Date().toISOString().split('T')[0]}.xlsx`;

    logger.info('Excel файл создан', 'admin/export/price-list', { fileName, productsCount: products.length });

    // Возвращаем Excel файл
    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

  } catch (error) {
    logger.error('Error exporting price list', 'admin/export/price-list', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка экспорта прайс-листа', 500);
  }
}

export const GET = withErrorHandling(
  requireAuthAndPermission(getHandler, 'ADMIN'),
  'admin/export/price-list/GET'
);