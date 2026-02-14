import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, withErrorHandling } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

interface ConfiguratorCategory {
  id: string;
  name: string;
  slug: string;
}

interface CatalogCategory {
  id: string;
  name: string;
  level: number;
  path: string;
}

interface CategoryLink {
  id: string;
  configurator_category_id: string;
  catalog_category_id: string;
  link_type: 'main' | 'additional';
  display_order: number;
  is_required: boolean;
  pricing_type: 'separate' | 'included' | 'formula';
  formula?: string;
  export_as_separate: boolean;
  catalog_category: CatalogCategory;
}

interface Product {
  id: string;
  name: string;
  price: number;
  sku: string;
  description?: string;
  properties_data?: string;
}

interface CartItem {
  id: string;
  product: Product;
  quantity: number;
  category_link: CategoryLink;
  calculated_price?: number;
}

interface ExportData {
  configurator_category: ConfiguratorCategory;
  cart_items: CartItem[];
  export_type: 'quote' | 'invoice' | 'order';
  total_price: number;
  export_setting_id?: string;
}

// POST /api/configurator/export - Экспорт документов
async function postHandler(
  request: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const body: ExportData = await request.json();
  const { configurator_category, cart_items, export_type, total_price, export_setting_id } = body;

  if (!cart_items || cart_items.length === 0) {
    throw new ValidationError('Корзина пуста');
  }

  logger.debug('Экспорт документов', 'configurator/export/POST', {
    exportType: export_type,
    cartItemsCount: cart_items.length,
    exportSettingId: export_setting_id
  }, loggingContext);

  // Загружаем настройки экспорта если указаны
  let exportSettings = null;
  if (export_setting_id) {
    const setting = await prisma.exportSetting.findUnique({
      where: { id: export_setting_id }
    });
    
    if (setting) {
      const displayConfig = (setting.display_config && JSON.parse(setting.display_config)) as Record<string, unknown> | null;
      exportSettings = {
        fields_config: JSON.parse(setting.fields_config),
        display_options: displayConfig ?? {},
        header_config: (displayConfig?.header_config as Record<string, unknown>) ?? {},
        footer_config: (displayConfig?.footer_config as Record<string, unknown>) ?? {}
      };
      logger.debug('Настройки экспорта загружены', 'configurator/export/POST', {
        exportSettingId: export_setting_id
      }, loggingContext);
    }
  }

    // Группируем товары по настройкам экспорта
    const groupedItems: any[] = [];
    const processedMainItems = new Set<string>();

    cart_items.forEach(item => {
      if (item.category_link.link_type === 'main') {
        // Основной товар
        const additionalItems = cart_items.filter(ci => 
          ci.category_link.link_type === 'additional' &&
          ci.category_link.pricing_type === 'included' &&
          ci.category_link.configurator_category_id === item.category_link.configurator_category_id &&
          !ci.category_link.export_as_separate
        );

        if (additionalItems.length > 0) {
          // Создаем объединенную позицию
          const additionalNames = additionalItems.map(ai => ai.product.name).join(', ');
          const totalPrice = item.quantity * (item.calculated_price || item.product.price) +
            additionalItems.reduce((sum, ai) => sum + ai.quantity * (ai.calculated_price || ai.product.price), 0);

          groupedItems.push({
            name: `${item.product.name} + ${additionalNames}`,
            sku: item.product.sku,
            quantity: item.quantity,
            unit_price: totalPrice / item.quantity,
            total_price: totalPrice,
            category: item.category_link.catalog_category.name,
            type: 'grouped'
          });

          // Отмечаем обработанные товары
          processedMainItems.add(item.id);
          additionalItems.forEach(ai => processedMainItems.add(ai.id));
        } else {
          // Обычный основной товар
          groupedItems.push({
            name: item.product.name,
            sku: item.product.sku,
            quantity: item.quantity,
            unit_price: item.calculated_price || item.product.price,
            total_price: item.quantity * (item.calculated_price || item.product.price),
            category: item.category_link.catalog_category.name,
            type: 'main'
          });
          processedMainItems.add(item.id);
        }
      }
    });

    // Добавляем дополнительные товары, которые экспортируются отдельно
    cart_items.forEach(item => {
      if (!processedMainItems.has(item.id)) {
        groupedItems.push({
          name: item.product.name,
          sku: item.product.sku,
          quantity: item.quantity,
          unit_price: item.calculated_price || item.product.price,
          total_price: item.quantity * (item.calculated_price || item.product.price),
          category: item.category_link.catalog_category.name,
          type: 'additional'
        });
      }
    });

    // Создаем Excel файл
    const worksheetData = [];
    
    // Заголовок документа
    const documentTitles = {
      quote: 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ',
      invoice: 'СЧЕТ НА ОПЛАТУ',
      order: 'ЗАКАЗ ПОСТАВЩИКУ'
    };

    // Заголовок с настройками компании
    if (exportSettings?.header_config) {
      const header = exportSettings.header_config;
      if (header.company_name) {
        worksheetData.push([header.company_name]);
      }
      if (header.company_address) {
        worksheetData.push([header.company_address]);
      }
      if (header.company_phone) {
        worksheetData.push([`Тел: ${header.company_phone}`]);
      }
      if (header.company_email) {
        worksheetData.push([`Email: ${header.company_email}`]);
      }
      worksheetData.push([]);
    }

    worksheetData.push([documentTitles[export_type]]);
    worksheetData.push([]);
    worksheetData.push([`Конфигуратор: ${configurator_category.name}`]);
    worksheetData.push([`Дата: ${new Date().toLocaleDateString()}`]);
    worksheetData.push([]);
    
    // Заголовки таблицы на основе настроек
    const headers = ['№', 'Наименование'];
    
    if (exportSettings?.fields_config) {
      const fields = exportSettings.fields_config;
      if (fields.show_sku) headers.push('Артикул');
      if (fields.show_category) headers.push('Категория');
      if (fields.show_quantity) headers.push('Количество');
      if (fields.show_unit_price) headers.push('Цена за единицу');
      if (fields.show_total_price) headers.push('Сумма');
      if (fields.show_description) headers.push('Описание');
    } else {
      // По умолчанию
      headers.push('Артикул', 'Категория', 'Количество', 'Цена за единицу', 'Сумма');
    }

    worksheetData.push(headers);

    // Товары
    groupedItems.forEach((item, index) => {
      const row = [index + 1, item.name];
      
      if (exportSettings?.fields_config) {
        const fields = exportSettings.fields_config;
        if (fields.show_sku) row.push(item.sku);
        if (fields.show_category) row.push(item.category);
        if (fields.show_quantity) row.push(item.quantity);
        if (fields.show_unit_price) row.push(item.unit_price);
        if (fields.show_total_price) row.push(item.total_price);
        if (fields.show_description) row.push(item.description || '');
      } else {
        // По умолчанию
        row.push(item.sku, item.category, item.quantity, item.unit_price, item.total_price);
      }
      
      worksheetData.push(row);
    });

    // Итого
    if (exportSettings?.display_options?.show_totals !== false) {
      worksheetData.push([]);
      
      let totalRow = ['', '', '', '', '', 'ИТОГО:', total_price];
      
      // Применяем налог если настроен
      if (exportSettings?.display_options?.show_tax) {
        const taxRate = Number((exportSettings.display_options as Record<string, unknown>)?.tax_rate) || 0;
        const taxAmount = total_price * (taxRate / 100);
        const totalWithTax = total_price + taxAmount;
        
        worksheetData.push(['', '', '', '', '', `Налог (${taxRate}%):`, taxAmount]);
        worksheetData.push(['', '', '', '', '', 'ИТОГО С НАЛОГОМ:', totalWithTax]);
      }
    }

    // Подвал с настройками
    if (exportSettings?.footer_config) {
      const footer = exportSettings.footer_config;
      worksheetData.push([]);
      if (footer.terms_conditions) {
        worksheetData.push(['Условия:', footer.terms_conditions]);
      }
      if (footer.payment_terms) {
        worksheetData.push(['Условия оплаты:', footer.payment_terms]);
      }
      if (footer.delivery_terms) {
        worksheetData.push(['Условия доставки:', footer.delivery_terms]);
      }
    }

    // Создаем рабочую книгу
    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Документ');

    // Настраиваем ширину колонок
    const columnWidths = [
      { wch: 5 },   // №
      { wch: 40 },  // Наименование
      { wch: 15 },  // Артикул
      { wch: 20 },  // Категория
      { wch: 10 },  // Количество
      { wch: 15 },  // Цена за единицу
      { wch: 15 }   // Сумма
    ];
    worksheet['!cols'] = columnWidths;

    // Создаем буфер
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    // Возвращаем файл
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    responseHeaders.set('Content-Disposition', `attachment; filename="${documentTitles[export_type]}.xlsx"`);

    logger.info('Документ экспортирован', 'configurator/export/POST', {
      exportType: export_type,
      itemsCount: groupedItems.length
    }, loggingContext);

    return new NextResponse(buffer, { headers: responseHeaders });
}

export const POST = withErrorHandling(
  requireAuth(postHandler),
  'configurator/export/POST'
);
