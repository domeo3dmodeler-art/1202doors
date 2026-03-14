/**
 * DomeoDoors_Diamond_1 → DomeoDoors Diamond 1
 * Replaces underscores with spaces for UI display.
 */
export function formatModelName(name: string | null | undefined): string {
  if (!name || typeof name !== 'string') return '';
  return name.replace(/_/g, ' ').trim();
}

/**
 * Maps raw DB hardware kit names to user-facing names:
 * БАЗОВЫЙ (СИЛЬВЕР) / Silver → Стандарт
 * ГОЛД (GOLD) / Gold → Комфорт
 * Платинум / Platinum → Бизнес
 */
export function getKitDisplayName(kitName: string | null | undefined): string {
  if (!kitName) return '—';
  const normalized = kitName.replace(/^Комплект фурнитуры\s*[—\-]\s*/i, '').trim().toLowerCase();
  if (/сильвер|silver|базовый/.test(normalized)) return 'Стандарт';
  if (/голд|gold/.test(normalized)) return 'Комфорт';
  if (/платинум|platinum/.test(normalized)) return 'Бизнес';
  return kitName.replace(/^Комплект фурнитуры\s*[—\-]\s*/i, '').trim();
}

/**
 * Maps raw DB filling names to user-facing names:
 * Сильвер / Silver → Стандарт
 * Голд / Gold → Комфорт
 * Платинум / Platinum → Бизнес
 */
export function getFillingDisplayName(filling: string | null | undefined): string {
  if (!filling) return '—';
  const lower = filling.toLowerCase();
  if (/сильвер|silver/.test(lower)) return 'Стандарт';
  if (/голд|gold/.test(lower)) return 'Комфорт';
  if (/платинум|platinum/.test(lower)) return 'Бизнес';
  return filling;
}
