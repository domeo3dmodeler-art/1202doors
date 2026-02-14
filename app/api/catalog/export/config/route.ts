import { NextRequest, NextResponse } from 'next/server';
import { exportService } from '@/lib/services/export.service';
import { logger } from '@/lib/logging/logger';

// POST /api/catalog/export/config - Сохранить настройки экспорта
export async function POST(request: NextRequest) {
  let catalogCategoryId: string | undefined;
  let exportType: string | undefined;
  try {
    const data = await request.json();
    catalogCategoryId = data.catalogCategoryId;
    exportType = data.exportType;
    const { config } = data;

    if (!catalogCategoryId) {
      return NextResponse.json(
        { error: 'ID категории каталога не указан' },
        { status: 400 }
      );
    }

    if (!exportType || !['quote', 'invoice', 'supplier_order'].includes(exportType)) {
      return NextResponse.json(
        { error: 'Неверный тип экспорта' },
        { status: 400 }
      );
    }

    if (!config) {
      return NextResponse.json(
        { error: 'Конфигурация не предоставлена' },
        { status: 400 }
      );
    }

    await exportService.saveExportConfig(catalogCategoryId!, exportType as 'quote' | 'invoice' | 'supplier_order', config);

    return NextResponse.json({ success: true });

  } catch (error) {
    logger.error('Error saving export config', 'catalog/export/config', error instanceof Error ? { error: error.message, stack: error.stack, catalogCategoryId: catalogCategoryId ?? undefined, exportType: exportType ?? undefined } : { error: String(error), catalogCategoryId: catalogCategoryId ?? undefined, exportType: exportType ?? undefined });
    return NextResponse.json(
      { error: 'Ошибка при сохранении настроек экспорта' },
      { status: 500 }
    );
  }
}

// DELETE /api/catalog/export/config - Удалить настройки экспорта
export async function DELETE(request: NextRequest) {
  let catalogCategoryId: string | null = null;
  let exportType: string | null = null;
  try {
    const { searchParams } = new URL(request.url);
    catalogCategoryId = searchParams.get('catalogCategoryId');
    exportType = searchParams.get('exportType');

    if (!catalogCategoryId) {
      return NextResponse.json(
        { error: 'ID категории каталога не указан' },
        { status: 400 }
      );
    }

    if (!exportType || !['quote', 'invoice', 'supplier_order'].includes(exportType)) {
      return NextResponse.json(
        { error: 'Неверный тип экспорта' },
        { status: 400 }
      );
    }

    await exportService.deleteExportConfig(catalogCategoryId, exportType as 'quote' | 'invoice' | 'supplier_order');

    return NextResponse.json({ success: true });

  } catch (error) {
    logger.error('Error deleting export config', 'catalog/export/config', error instanceof Error ? { error: error.message, stack: error.stack, catalogCategoryId: catalogCategoryId ?? undefined, exportType: exportType ?? undefined } : { error: String(error), catalogCategoryId: catalogCategoryId ?? undefined, exportType: exportType ?? undefined });
    return NextResponse.json(
      { error: 'Ошибка при удалении настроек экспорта' },
      { status: 500 }
    );
  }
}
