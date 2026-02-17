/**
 * Единый модуль экспорта позиций: тип и наименование определяются только здесь.
 * Все экспорты (PDF, Excel, CSV, HTML, по id документа, из заказа, из корзины) используют этот модуль.
 * Сохранённый в БД type/itemType не используется для вывода — тип выводится по форме позиции (model, width, limiterId и т.д.).
 */

export type ExportItemType = 'door' | 'handle' | 'backplate' | 'limiter';

export interface ExportItemShape {
  id?: string;
  type?: string;
  itemType?: string;
  model?: string;
  width?: number;
  height?: number;
  finish?: string;
  style?: string;
  color?: string;
  handleId?: string;
  handleName?: string;
  limiterId?: string;
  limiterName?: string;
  edge?: string;
  /** Название цвета кромки (для экспорта на фабрику) */
  edgeColorName?: string;
  edge_color_name?: string;
  /** Цвет стекла (для экспорта на фабрику) */
  glassColor?: string;
  glass_color?: string;
  reversible?: boolean;
  mirror?: string;
  threshold?: boolean;
  optionIds?: string[];
  hardwareKitName?: string;
  hardware?: string;
  [key: string]: unknown;
}

/**
 * Определяет тип позиции только по полям (model, width, finish, limiterId, id и т.д.).
 * Сохранённый type/itemType не учитывается — так старые ошибочные данные не ломают экспорт.
 * Порядок: дверь (признаки изделия) → ограничитель → завертка → ручка → по умолчанию дверь.
 */
export function getItemType(item: ExportItemShape): ExportItemType {
  const id = item.id ? String(item.id) : '';
  const model = item.model ? String(item.model) : '';

  const isDoorLike =
    model.includes('DomeoDoors') ||
    item.width != null ||
    (item.finish != null && item.finish !== '') ||
    (item.style != null && item.style !== '');
  if (isDoorLike) return 'door';

  if (item.limiterId || item.limiterName || id.startsWith('limiter-')) return 'limiter';
  if (id.startsWith('backplate-')) return 'backplate';
  if (item.handleId != null || item.handleName != null) return 'handle';

  return 'door';
}

function formatLimiterName(limiterName: string | undefined, fallbackName?: string): string {
  const raw = (limiterName || fallbackName || '').trim();
  if (!raw) return 'Ограничитель';
  const suffix = String(raw)
    .replace(/^Дверной ограничитель\s*/i, '')
    .replace(/^Ограничитель\s*/i, '')
    .trim()
    .replace(/,?\s*цвет\s+/gi, ' Цвет ');
  const trimmed = suffix.trim();
  return trimmed ? `Ограничитель ${trimmed}` : 'Ограничитель';
}

/** Убирает из строки подстановку "undefined" (баг при сохранении данных). */
function sanitizeSpec(s: string): string {
  return s.replace(/\bundefined\b/gi, '').replace(/\s+/g, ' ').trim();
}

function buildDoorName(item: ExportItemShape): string {
  const modelName = (item.model || 'Unknown').replace(/DomeoDoors_/g, '').replace(/_/g, ' ');
  const finishVal = sanitizeSpec(String(item.finish ?? '').trim());
  const colorVal = sanitizeSpec(String(item.color ?? '').trim());
  const specParts: string[] = [];
  if (finishVal) specParts.push(finishVal);
  if (colorVal) {
    const rest =
      finishVal &&
      (colorVal === finishVal ||
        colorVal.startsWith(finishVal + ';') ||
        colorVal.startsWith(finishVal + ' '))
        ? colorVal
            .replace(
              new RegExp(
                `^\\s*${String(finishVal).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*;?\\s*`,
                'i'
              )
            )
            .trim()
        : colorVal;
    if (rest) specParts.push(rest);
  }
  if (item.width != null && item.height != null) specParts.push(`${item.width} × ${item.height} мм`);
  if (item.edge === 'да') specParts.push('Кромка: да');
  if (item.reversible) specParts.push('Реверс: да');
  if (item.mirror) specParts.push('Зеркало: да');
  if (item.threshold) specParts.push('Порог: да');
  if (item.optionIds?.length) specParts.push('Наличники: да');
  const kitName = sanitizeSpec(
    (item.hardwareKitName || item.hardware || 'Базовый').replace(/^Комплект фурнитуры — /, '')
  );
  specParts.push(`Фурнитура: ${kitName || 'Базовый'}`);
  const specStr = specParts.filter((x) => x !== '—' && x !== '').join('; ');
  return specStr ? `Дверь DomeoDoors ${modelName}; ${specStr}` : `Дверь DomeoDoors ${modelName}`;
}

/**
 * Возвращает наименование позиции для экспорта. Тип берётся из getItemType(item), не из item.type.
 */
export function getItemDisplayName(item: ExportItemShape): string {
  const kind = getItemType(item);

  switch (kind) {
    case 'limiter':
      return formatLimiterName(item.limiterName, item.name as string | undefined);
    case 'backplate':
      return `Завертка ${item.handleName || item.handleId || 'Неизвестная завертка'}`;
    case 'handle':
      return `Ручка ${item.handleName || item.handleId || 'Неизвестная ручка'}`;
    case 'door':
    default:
      return buildDoorName(item);
  }
}

/**
 * Нормализует позицию для экспорта: подставляет type по getItemType(item).
 * Остальные поля не меняются.
 */
export function normalizeItemForExport<T extends ExportItemShape>(item: T): T & { type: ExportItemType; itemType: ExportItemType } {
  const type = getItemType(item);
  return { ...item, type, itemType: type };
}
