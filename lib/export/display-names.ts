/**
 * Реэкспорт из единого модуля экспорта. Вся логика типа и наименования — в export-items.ts.
 * @see lib/export/export-items.ts
 */

import {
  getItemDisplayName,
  getItemType,
  normalizeItemForExport,
  type ExportItemType,
  type ExportItemShape
} from '@/lib/export/export-items';

export type { ExportItemType, ExportItemShape };

export const getItemDisplayNameForExport = getItemDisplayName;
export const getItemTypeForExport = getItemType;

/** Для обратной совместимости: нормализует позицию (подставляет type по форме позиции). */
export function normalizeItemForDisplay(item: Record<string, unknown>): Record<string, unknown> {
  return normalizeItemForExport(item as ExportItemShape) as Record<string, unknown>;
}
