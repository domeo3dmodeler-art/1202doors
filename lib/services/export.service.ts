// lib/services/export.service.ts
// Сервис для экспорта документов в различные форматы

import { 
  exportDocumentWithPDF 
} from '@/lib/export/puppeteer-generator';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { exportDocumentRequestSchema, type ExportDocumentRequestInput } from '@/lib/validation/document.schemas';
import type {
  DocumentType,
  DocumentItem
} from '@/lib/types/documents';
import type { CartItem as CartItemType } from '@/lib/cart/types';

export type ExportFormat = 'pdf' | 'excel' | 'csv';

export interface ExportDocumentRequest {
  type: DocumentType;
  format: ExportFormat;
  clientId: string;
  items: DocumentItem[];
  totalAmount: number;
  parentDocumentId?: string | null;
  cartSessionId?: string | null;
}

export interface ExportDocumentResponse {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  documentId?: string | null;
  documentType?: string;
  documentNumber?: string;
}

export class ExportService {
  /**
   * Экспортирует документ в указанном формате
   */
  async exportDocument(request: ExportDocumentRequestInput): Promise<ExportDocumentResponse> {
    // Валидация через Zod
    const validation = exportDocumentRequestSchema.safeParse(request);
    if (!validation.success) {
      const errors = validation.error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
      throw new Error(`Ошибка валидации: ${errors}`);
    }

    const validatedRequest = validation.data;
    const {
      type,
      format,
      clientId,
      items,
      totalAmount,
      parentDocumentId,
      cartSessionId
    } = validatedRequest;

    logger.info(`Экспорт документа типа ${type} в формате ${format}`, 'EXPORT_SERVICE', {
      type,
      format,
      clientId,
      itemsCount: items.length,
      totalAmount
    });

    // Экспортируем документ
    const result = await exportDocumentWithPDF(
      type,
      format,
      clientId,
      items,
      totalAmount,
      cartSessionId || null,
      parentDocumentId || null
    );

    return {
      buffer: result.buffer,
      filename: result.filename,
      mimeType: result.mimeType,
      documentId: result.documentId,
      documentType: result.documentType,
      documentNumber: result.documentNumber
    };
  }

  /**
   * Сохранить настройки экспорта для категории и типа
   */
  async saveExportConfig(
    catalogCategoryId: string,
    exportType: 'quote' | 'invoice' | 'supplier_order',
    config: Record<string, unknown>
  ): Promise<void> {
    await prisma.exportSetting.upsert({
      where: {
        catalog_category_id_export_type: { catalog_category_id: catalogCategoryId, export_type: exportType },
      },
      create: {
        catalog_category_id: catalogCategoryId,
        export_type: exportType,
        fields_config: JSON.stringify((config as { fields?: unknown }).fields ?? []),
        display_config: JSON.stringify((config as { display?: unknown }).display ?? {}),
      },
      update: {
        fields_config: JSON.stringify((config as { fields?: unknown }).fields ?? []),
        display_config: JSON.stringify((config as { display?: unknown }).display ?? {}),
      },
    });
  }

  /**
   * Удалить настройки экспорта
   */
  async deleteExportConfig(
    catalogCategoryId: string,
    exportType: 'quote' | 'invoice' | 'supplier_order'
  ): Promise<void> {
    await prisma.exportSetting.deleteMany({
      where: { catalog_category_id: catalogCategoryId, export_type: exportType },
    });
  }

  /**
   * Получить настройки экспорта для категории
   */
  async getExportConfigs(catalogCategoryId: string): Promise<Record<string, unknown>[]> {
    const rows = await prisma.exportSetting.findMany({
      where: { catalog_category_id: catalogCategoryId },
    });
    return rows.map((r) => ({
      exportType: r.export_type,
      fieldsConfig: r.fields_config,
      displayConfig: r.display_config,
    }));
  }

  /**
   * Экспорт товаров категории в Excel (заглушка — полная реализация в отдельном модуле)
   */
  async exportToExcel(
    _catalogCategoryId: string,
    _exportType: string,
    _productIds?: string[]
  ): Promise<{ success: boolean; error?: string }> {
    logger.warn('exportToExcel not fully implemented', 'EXPORT_SERVICE', {});
    return { success: false, error: 'Экспорт в Excel не реализован' };
  }

  /**
   * Валидация запроса на экспорт (deprecated - используйте Zod схемы)
   * @deprecated Используйте exportDocumentRequestSchema для валидации
   */
  private validateExportRequest(request: ExportDocumentRequest): void {
    // Эта функция больше не используется, валидация через Zod
    // Оставлена для обратной совместимости
  }
}

// Экспортируем типы для клиентских компонентов
export type CartItem = CartItemType;

export interface ExportOptions {
  format?: 'html' | 'pdf' | 'excel' | 'csv' | 'xlsx';
  openInNewTab?: boolean;
  [key: string]: unknown;
}

export interface ExportResult {
  success: boolean;
  error?: string;
  url?: string;
  filename?: string;
}

// Экспортируем singleton instance
export const exportService = new ExportService();
