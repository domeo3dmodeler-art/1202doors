import { NextRequest, NextResponse } from "next/server";
import { prisma } from '@/lib/prisma';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError, NotFoundError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';
import * as XLSX from 'xlsx';

// Упрощенный импорт без маппинга
async function postHandler(req: NextRequest) {
    try {
        const user = await getAuthenticatedUser(req);
        logger.info('Упрощенный импорт без маппинга', 'admin/import/simplified', { userId: user.userId });
        
        const formData = await req.formData();
        const file = formData.get('file') as File;
        const categoryId = formData.get('category') as string;
        
        if (!file || !categoryId) {
            throw new ValidationError('Файл и категория обязательны');
        }

        logger.info('Начало импорта', 'admin/import/simplified', { fileName: file.name, categoryId });

        // Читаем Excel файл
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (data.length === 0) {
            throw new ValidationError('Файл пустой или не содержит данных');
        }

        // Первая строка - заголовки (они же поля шаблона)
        const headers = data[0] as string[];
        const rows = data.slice(1) as any[][];

        logger.info('Файл прочитан', 'admin/import/simplified', { headersCount: headers.length, rowsCount: rows.length });

        // Получаем категорию
        const category = await prisma.catalogCategory.findUnique({
            where: { id: categoryId }
        });

        if (!category) {
            throw new NotFoundError('Категория не найдена');
        }

        logger.info('Категория найдена', 'admin/import/simplified', { categoryName: category.name });

        // Обрабатываем товары
        const products = [];
        const errors = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            
            if (row.length === 0 || row.every(cell => !cell)) {
                if (i < 5) {
                    logger.debug(`Пропускаем пустую строку`, 'admin/import/simplified', { rowIndex: i + 2 });
                }
                continue;
            }

            if (i < 5) {
                logger.debug(`Обрабатываем строку`, 'admin/import/simplified', { rowIndex: i + 2, rowData: row.slice(0, 5).join(', ') });
            }

            try {
                // Создаем товар
                const product = {
                    sku: '',
                    name: '',
                    catalog_category_id: categoryId,
                    properties_data: {} as Record<string, unknown>,
                    base_price: 0,
                    currency: 'RUB',
                    stock_quantity: 0,
                    is_active: true
                };

                // Заголовки Excel = Поля шаблона (прямое соответствие)
                headers.forEach((header, headerIndex) => {
                    if (row[headerIndex] !== undefined && row[headerIndex] !== null && row[headerIndex] !== '') {
                        product.properties_data[header] = row[headerIndex];
                    }
                });

                // Извлекаем основные поля
                // SKU - обычно в колонке C (индекс 2)
                if (row[2]) {
                    product.sku = row[2].toString().trim();
                } else {
                    product.sku = `AUTO-${i + 1}`;
                }

                // Название - обычно в колонке D (индекс 3)
                if (row[3]) {
                    product.name = row[3].toString().trim();
                } else {
                    product.name = 'Без названия';
                }

                // Ищем цену по заголовкам
                const priceHeaders = headers.filter(h => 
                    h && h.toLowerCase().includes('цена')
                );
                
                if (priceHeaders.length > 0) {
                    const priceHeader = priceHeaders[0];
                    const priceIndex = headers.indexOf(priceHeader);
                    const priceValue = row[priceIndex];
                    
                    if (priceValue) {
                        const price = parseFloat(priceValue.toString().replace(/[^\d.,]/g, '').replace(',', '.'));
                        if (!isNaN(price)) {
                            product.base_price = price;
                            if (i < 5) {
                                logger.debug(`Цена найдена`, 'admin/import/simplified', { price, rowIndex: i + 2 });
                            }
                        }
                    }
                }

                // Проверяем обязательные поля
                if (!product.name || product.name === 'Без названия') {
                    errors.push(`Строка ${i + 2}: Отсутствует название товара`);
                    continue;
                }

                if (Object.keys(product.properties_data).length === 0) {
                    errors.push(`Строка ${i + 2}: Товар не содержит свойств`);
                    continue;
                }

                products.push(product);
                if (i < 5) {
                    logger.debug(`Товар добавлен`, 'admin/import/simplified', { productName: product.name, productSku: product.sku, rowIndex: i + 2 });
                }

            } catch (error) {
                logger.error(`Ошибка обработки строки`, 'admin/import/simplified', { rowIndex: i + 2, error: error instanceof Error ? error.message : String(error) });
                errors.push(`Строка ${i + 2}: Ошибка обработки - ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        logger.info(`Результаты обработки`, 'admin/import/simplified', { productsCount: products.length, errorsCount: errors.length });

        // Сохраняем товары в базу данных
        let savedCount = 0;
        const savedProducts = [];

        for (const product of products) {
            try {
                // Проверяем, не существует ли уже товар с таким SKU
                const existingProduct = await prisma.product.findUnique({
                    where: { sku: product.sku }
                });

                if (existingProduct) {
                    logger.debug(`Товар с SKU уже существует, обновляем`, 'admin/import/simplified', { productSku: product.sku });
                    
                    const updatedProduct = await prisma.product.update({
                        where: { sku: product.sku },
                        data: {
                            name: product.name,
                            properties_data: JSON.stringify(product.properties_data),
                            base_price: product.base_price,
                            updated_at: new Date()
                        }
                    });
                    
                    savedProducts.push(updatedProduct);
                } else {
                    logger.debug(`Создаем новый товар`, 'admin/import/simplified', { productName: product.name });
                    
                    const newProduct = await prisma.product.create({
                        data: {
                            sku: product.sku,
                            name: product.name,
                            catalog_category_id: product.catalog_category_id,
                            properties_data: JSON.stringify(product.properties_data),
                            base_price: product.base_price,
                            currency: product.currency,
                            stock_quantity: product.stock_quantity,
                            is_active: product.is_active
                        }
                    });
                    
                    savedProducts.push(newProduct);
                }
                
                savedCount++;
                
            } catch (error) {
                logger.error(`Ошибка сохранения товара`, 'admin/import/simplified', { productName: product.name, error: error instanceof Error ? error.message : String(error) });
                errors.push(`Товар "${product.name}": Ошибка сохранения - ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        // Обновляем счетчик товаров в категории
        const categoryProductsCount = await prisma.product.count({
            where: { 
                catalog_category_id: categoryId,
                is_active: true 
            }
        });

        await prisma.catalogCategory.update({
            where: { id: categoryId },
            data: { 
                products_count: categoryProductsCount,
                updated_at: new Date()
            }
        });

        // Создаем запись в истории импорта
        await prisma.importHistory.create({
            data: {
                catalog_category_id: categoryId,
                filename: file.name,
                file_size: file.size,
                imported_count: savedCount,
                error_count: errors.length,
                status: errors.length > 0 ? 'partial' : 'completed',
                errors: JSON.stringify(errors),
                import_data: JSON.stringify({
                    headers: headers,
                    total_rows: rows.length,
                    processed_rows: products.length,
                    saved_rows: savedCount
                })
            }
        });

        logger.info('Импорт завершен', 'admin/import/simplified', { 
            userId: user.userId,
            savedCount, 
            categoryProductsCount, 
            errorsCount: errors.length 
        });

        return apiSuccess({
            message: 'Импорт завершен успешно',
            data: {
                filename: file.name,
                category: category.name,
                headers: headers,
                total_rows: rows.length,
                processed_rows: products.length,
                saved_rows: savedCount,
                errors: errors,
                products_preview: savedProducts.slice(0, 5).map(p => ({
                    id: p.id,
                    sku: p.sku,
                    name: p.name,
                    base_price: p.base_price
                }))
            }
        });

    } catch (error) {
        logger.error('Критическая ошибка импорта', 'admin/import/simplified', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
        if (error instanceof ValidationError || error instanceof NotFoundError) {
            throw error;
        }
        return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка при импорте файла', 500);
    }
}

export const POST = withErrorHandling(
    requireAuthAndPermission(postHandler, 'ADMIN'),
    'admin/import/simplified/POST'
);

// GET - информация об упрощенном импорте
async function getHandler(req: NextRequest) {
    try {
        const user = await getAuthenticatedUser(req);
        logger.info('Получение информации об упрощенном импорте', 'admin/import/simplified', { userId: user.userId });
        
        return apiSuccess({
            message: "Упрощенный API импорта без маппинга",
            description: "Заголовки Excel = Поля шаблона (прямое соответствие)",
            usage: "POST запрос с FormData: file, category",
            features: [
                "Прямое соответствие заголовков Excel и полей шаблона",
                "Нет промежуточного маппинга",
                "Автоматическое определение цены",
                "Автоматическая генерация SKU",
                "Обновление существующих товаров",
                "Подсчет товаров в категории"
            ],
            example: {
                method: "POST",
                body: "FormData с полями: file (Excel файл), category (ID категории)"
            }
        });
    } catch (error) {
        logger.error('Error in simplified import GET', 'admin/import/simplified', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
        return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка получения информации об импорте', 500);
    }
}

export const GET = withErrorHandling(
    requireAuthAndPermission(getHandler, 'ADMIN'),
    'admin/import/simplified/GET'
);
