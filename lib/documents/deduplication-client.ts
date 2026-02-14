// lib/documents/deduplication-client.ts
// Клиентские функции дедубликации (без Prisma)

/** Элемент корзины на входе (из API или cart_data) */
export interface CartItemInput {
  type?: string;
  itemType?: string;
  style?: string;
  model?: string;
  name?: string;
  finish?: string;
  color?: string;
  width?: number;
  height?: number;
  qty?: number;
  quantity?: number;
  unitPrice?: number;
  price?: number;
  hardwareKitId?: string;
  handleId?: string;
  limiterId?: string;
  sku_1c?: string | number | null;
}

/** Нормализованная позиция «дверь» для сравнения */
export interface NormalizedDoor {
  type: 'door';
  style: string;
  model: string;
  finish: string;
  color: string;
  width: number;
  height: number;
  quantity: number;
  unitPrice: number;
  hardwareKitId: string;
  handleId: string;
  limiterId: string;
  sku_1c: string;
}

/** Нормализованная позиция «ручка» или «завертка» */
export interface NormalizedHandleLike {
  type: 'handle' | 'backplate';
  handleId: string;
  quantity: number;
  unitPrice: number;
}

/** Нормализованная позиция «ограничитель» */
export interface NormalizedLimiter {
  type: 'limiter';
  limiterId: string;
  quantity: number;
  unitPrice: number;
}

export type NormalizedCartItem = NormalizedDoor | NormalizedHandleLike | NormalizedLimiter;

// Нормализация items для сравнения
export function normalizeItems(items: CartItemInput[]): NormalizedCartItem[] {
  return items.map(item => {
    const rawType = item.type || item.itemType;
    const type = rawType
      ? String(rawType).toLowerCase()
      : (item.limiterId ? 'limiter' : item.handleId ? 'handle' : 'door');
    const normalized: NormalizedDoor = {
      type: 'door',
      style: String(item.style || '').toLowerCase().trim(),
      model: String(item.model || item.name || '').toLowerCase().trim(),
      finish: String(item.finish || '').toLowerCase().trim(),
      color: String(item.color || '').toLowerCase().trim(),
      width: Number(item.width || 0),
      height: Number(item.height || 0),
      quantity: Number(item.qty || item.quantity || 1),
      unitPrice: Number(item.unitPrice || item.price || 0),
      hardwareKitId: String(item.hardwareKitId || '').trim(),
      handleId: String(item.handleId || '').trim(),
      limiterId: String(item.limiterId || '').trim(),
      sku_1c: String(item.sku_1c || '').trim()
    };

    if (type === 'handle' || type === 'backplate') {
      const out: NormalizedHandleLike = {
        type: type as 'handle' | 'backplate',
        handleId: normalized.handleId,
        quantity: normalized.quantity,
        unitPrice: normalized.unitPrice
      };
      return out;
    }
    if (type === 'limiter') {
      const out: NormalizedLimiter = {
        type: 'limiter',
        limiterId: normalized.limiterId,
        quantity: normalized.quantity,
        unitPrice: normalized.unitPrice
      };
      return out;
    }

    return normalized;
  }).sort((a, b) => {
    const key = (x: NormalizedCartItem) =>
      `${x.type}:${('limiterId' in x ? x.limiterId : 'handleId' in x ? x.handleId : (x as NormalizedDoor).model) || ''}:${('finish' in x ? (x as NormalizedDoor).finish : '')}:${('color' in x ? (x as NormalizedDoor).color : '')}:${('width' in x ? (x as NormalizedDoor).width : '')}:${('height' in x ? (x as NormalizedDoor).height : '')}:${('hardwareKitId' in x ? (x as NormalizedDoor).hardwareKitId : '')}`;
    return key(a).localeCompare(key(b));
  });
}

// Сравнение содержимого корзины (клиентская версия)
export function compareCartContent(items1: CartItemInput[], items2String: string | null): boolean {
  try {
    if (!items2String) return false;

    const parsed2: unknown = JSON.parse(items2String);
    const items2: CartItemInput[] = Array.isArray(parsed2)
      ? (parsed2 as CartItemInput[])
      : ((parsed2 as { items?: CartItemInput[] }).items ?? []);

    const normalized1 = normalizeItems(items1);
    const normalized2 = normalizeItems(items2);

    if (normalized1.length !== normalized2.length) {
      return false;
    }

    for (let i = 0; i < normalized1.length; i++) {
      const item1 = normalized1[i];
      const item2 = normalized2[i];

      if (item1.type === 'handle' || item2.type === 'handle' || item1.type === 'backplate' || item2.type === 'backplate') {
        const h1 = item1 as NormalizedHandleLike;
        const h2 = item2 as NormalizedHandleLike;
        if (h1.type !== h2.type ||
            h1.handleId !== h2.handleId ||
            h1.quantity !== h2.quantity ||
            Math.abs((h1.unitPrice ?? 0) - (h2.unitPrice ?? 0)) > 0.01) {
          return false;
        }
        continue;
      }
      if (item1.type === 'limiter' || item2.type === 'limiter') {
        const l1 = item1 as NormalizedLimiter;
        const l2 = item2 as NormalizedLimiter;
        if (l1.type !== l2.type ||
            l1.limiterId !== l2.limiterId ||
            l1.quantity !== l2.quantity ||
            Math.abs((l1.unitPrice ?? 0) - (l2.unitPrice ?? 0)) > 0.01) {
          return false;
        }
        continue;
      }

      const d1 = item1 as NormalizedDoor;
      const d2 = item2 as NormalizedDoor;
      if (d1.type !== d2.type ||
          d1.style !== d2.style ||
          d1.model !== d2.model ||
          d1.finish !== d2.finish ||
          d1.color !== d2.color ||
          d1.width !== d2.width ||
          d1.height !== d2.height ||
          d1.hardwareKitId !== d2.hardwareKitId ||
          d1.handleId !== d2.handleId ||
          d1.quantity !== d2.quantity ||
          Math.abs((d1.unitPrice ?? 0) - (d2.unitPrice ?? 0)) > 0.01) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

