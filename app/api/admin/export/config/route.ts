import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuthAndPermission } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';

// ===================== НАСТРОЙКИ ЭКСПОРТА =====================

async function getHandler(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const catalogCategoryId = searchParams.get('catalogCategoryId');
    const exportType = searchParams.get('exportType') || 'default';

    if (!catalogCategoryId) {
      throw new ValidationError('catalogCategoryId обязателен');
    }

    logger.info('Получение настроек экспорта', 'admin/export/config', { userId: user.userId, catalogCategoryId, exportType });

    // Получаем настройки экспорта
    let exportSetting = await prisma.exportSetting.findUnique({
      where: {
        catalog_category_id_export_type: {
          catalog_category_id: catalogCategoryId!,
          export_type: exportType
        }
      }
    });

    // Если настройки нет, создаем по умолчанию
    if (!exportSetting) {
      const defaultConfig = getDefaultExportConfig(exportType);
      exportSetting = await prisma.exportSetting.create({
        data: {
          catalog_category_id: catalogCategoryId!,
          export_type: exportType,
          fields_config: JSON.stringify(defaultConfig.fields),
          display_config: JSON.stringify(defaultConfig.display)
        }
      });
    }

    const fieldsConfig = JSON.parse(exportSetting.fields_config || '[]');
    const displayConfig = JSON.parse(exportSetting.display_config || '{}');

    logger.info('Настройки экспорта получены', 'admin/export/config', { catalogCategoryId, exportType });

    return apiSuccess({
      config: {
        id: exportSetting.id,
        exportType: exportSetting.export_type,
        fields: fieldsConfig,
        display: displayConfig
      }
    });

  } catch (error) {
    logger.error('Error getting export config', 'admin/export/config', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof ValidationError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка получения настроек экспорта', 500);
  }
}

export const GET = withErrorHandling(
  requireAuthAndPermission(getHandler, 'ADMIN'),
  'admin/export/config/GET'
);

async function postHandler(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const { 
      catalogCategoryId, 
      exportType, 
      fields, 
      display 
    } = body;

    if (!catalogCategoryId) {
      throw new ValidationError('catalogCategoryId обязателен');
    }

    // Валидируем поля
    if (!Array.isArray(fields) || fields.length === 0) {
      throw new ValidationError('Поля экспорта не могут быть пустыми');
    }

    // Проверяем уникальность ключей полей
    const fieldKeys = fields.map(field => field.key);
    const uniqueKeys = new Set(fieldKeys);
    if (uniqueKeys.size !== fieldKeys.length) {
      throw new ValidationError('Ключи полей должны быть уникальными');
    }

    logger.info('Сохранение настроек экспорта', 'admin/export/config', { userId: user.userId, catalogCategoryId, exportType });

    // Сохраняем или обновляем настройки
    const exportSetting = await prisma.exportSetting.upsert({
      where: {
        catalog_category_id_export_type: {
          catalog_category_id: catalogCategoryId,
          export_type: exportType
        }
      },
      update: {
        fields_config: JSON.stringify(fields),
        display_config: JSON.stringify(display)
      },
      create: {
        catalog_category_id: catalogCategoryId,
        export_type: exportType,
        fields_config: JSON.stringify(fields),
        display_config: JSON.stringify(display)
      }
    });

    logger.info('Настройки экспорта сохранены', 'admin/export/config', { catalogCategoryId, exportType, configId: exportSetting.id });

    return apiSuccess({
      config: {
        id: exportSetting.id,
        exportType: exportSetting.export_type,
        fields: JSON.parse(exportSetting.fields_config || '[]'),
        display: JSON.parse(exportSetting.display_config || '{}')
      }
    });

  } catch (error) {
    logger.error('Error saving export config', 'admin/export/config', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof ValidationError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка сохранения настроек экспорта', 500);
  }
}

export const POST = withErrorHandling(
  requireAuthAndPermission(postHandler, 'ADMIN'),
  'admin/export/config/POST'
);

// ===================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====================

function getDefaultExportConfig(exportType: string) {
  const baseFields = [
    { key: 'sku', label: 'SKU', source: 'product', format: 'text', required: true },
    { key: 'name', label: 'Название', source: 'product', format: 'text', required: true },
    { key: 'supplier_sku', label: 'Артикул поставщика', source: 'properties', propertyKey: 'Артикул поставщика', format: 'text', required: true },
    { key: 'model_name', label: 'Название модели', source: 'properties', propertyKey: 'Domeo_Название модели для Web', format: 'text', required: true },
    { key: 'width', label: 'Ширина/мм', source: 'properties', propertyKey: 'Ширина/мм', format: 'number', required: true },
    { key: 'height', label: 'Высота/мм', source: 'properties', propertyKey: 'Высота/мм', format: 'number', required: true },
    { key: 'thickness', label: 'Толщина/мм', source: 'properties', propertyKey: 'Толщина/мм', format: 'number', required: false },
    { key: 'color', label: 'Цвет', source: 'properties', propertyKey: 'Цвет/Отделка', format: 'text', required: false },
    { key: 'supplier', label: 'Поставщик', source: 'properties', propertyKey: 'Поставщик', format: 'text', required: false },
    { key: 'price_rrc', label: 'Цена РРЦ', source: 'properties', propertyKey: 'Цена РРЦ', format: 'currency', required: true },
    { key: 'price_opt', label: 'Цена опт', source: 'properties', propertyKey: 'Цена опт', format: 'currency', required: true },
    { key: 'base_price', label: 'Цена базовая', source: 'product', format: 'currency', required: false },
    { key: 'stock', label: 'Остаток', source: 'product', format: 'number', required: false }
  ];

  const displayConfig = {
    title: getTitleForExportType(exportType),
    company_name: 'ООО "Домео"',
    company_address: 'г. Москва, ул. Примерная, д. 1',
    company_phone: '+7 (495) 123-45-67',
    company_email: 'info@domeo.ru',
    show_totals: true,
    show_tax: false,
    tax_rate: 0,
    currency: 'RUB',
    date_format: 'DD.MM.YYYY',
    number_format: '#,##0.00'
  };

  // Фильтруем поля в зависимости от типа экспорта
  let filteredFields = baseFields;
  
  switch (exportType) {
    case 'price_list':
      // Прайс-лист - основные поля для клиентов
      filteredFields = baseFields.filter(field => 
        ['sku', 'name', 'supplier_sku', 'model_name', 'width', 'height', 'color', 'price_rrc', 'base_price', 'stock'].includes(field.key)
      );
      break;
      
    case 'supplier_order':
      // Заказ поставщику - поля для заказа
      filteredFields = baseFields.filter(field => 
        ['sku', 'name', 'supplier_sku', 'model_name', 'width', 'height', 'thickness', 'supplier', 'price_opt'].includes(field.key)
      );
      break;
      
    case 'catalog':
      // Каталог - полная информация
      filteredFields = baseFields;
      break;
      
    case 'calculator':
      // Калькулятор - поля для расчета
      filteredFields = baseFields.filter(field => 
        ['sku', 'name', 'width', 'height', 'thickness', 'price_rrc', 'price_opt'].includes(field.key)
      );
      break;
  }

  return {
    fields: filteredFields,
    display: displayConfig
  };
}

function getTitleForExportType(exportType: string): string {
  const titles: Record<string, string> = {
    'price_list': 'Прайс-лист',
    'supplier_order': 'Заказ поставщику',
    'catalog': 'Каталог товаров',
    'calculator': 'Данные для калькулятора',
    'default': 'Экспорт товаров'
  };
  
  return titles[exportType] || titles['default'];
}
