/**
 * Юнит-тесты для normalizeItems и compareCartContent
 */
import { describe, it, expect } from 'vitest';
import {
  normalizeItems,
  compareCartContent,
  type CartItemInput,
  type NormalizedCartItem,
  type NormalizedDoor,
  type NormalizedHandleLike,
  type NormalizedLimiter
} from './deduplication-client';

describe('normalizeItems', () => {
  it('нормализует дверь по полному набору полей', () => {
    const items: CartItemInput[] = [
      {
        type: 'door',
        model: 'Model A',
        style: 'Современные',
        finish: 'ПВХ',
        color: 'Белый',
        width: 800,
        height: 2000,
        qty: 1,
        unitPrice: 15000
      }
    ];
    const result = normalizeItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('door');
    const door = result[0] as NormalizedDoor;
    expect(door.model).toBe('model a');
    expect(door.style).toBe('современные');
    expect(door.width).toBe(800);
    expect(door.height).toBe(2000);
    expect(door.quantity).toBe(1);
    expect(door.unitPrice).toBe(15000);
  });

  it('нормализует ручку по type и handleId', () => {
    const items: CartItemInput[] = [
      { type: 'handle', handleId: 'handle-1', qty: 2, unitPrice: 1500 }
    ];
    const result = normalizeItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('handle');
    const h = result[0] as NormalizedHandleLike;
    expect(h.handleId).toBe('handle-1');
    expect(h.quantity).toBe(2);
    expect(h.unitPrice).toBe(1500);
  });

  it('нормализует завертку как backplate', () => {
    const items: CartItemInput[] = [
      { type: 'backplate', handleId: 'handle-2', qty: 1, unitPrice: 800 }
    ];
    const result = normalizeItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('backplate');
    const h = result[0] as NormalizedHandleLike;
    expect(h.handleId).toBe('handle-2');
  });

  it('нормализует ограничитель по limiterId', () => {
    const items: CartItemInput[] = [
      { type: 'limiter', limiterId: 'lim-1', qty: 1, unitPrice: 500 }
    ];
    const result = normalizeItems(items);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('limiter');
    const l = result[0] as NormalizedLimiter;
    expect(l.limiterId).toBe('lim-1');
    expect(l.quantity).toBe(1);
    expect(l.unitPrice).toBe(500);
  });

  it('выводит тип по handleId/limiterId при отсутствии type', () => {
    expect(normalizeItems([{ handleId: 'h1', qty: 1, unitPrice: 100 }])[0].type).toBe('handle');
    expect(normalizeItems([{ limiterId: 'l1', qty: 1, unitPrice: 100 }])[0].type).toBe('limiter');
    expect(normalizeItems([{ model: 'M', qty: 1, unitPrice: 100 }])[0].type).toBe('door');
  });

  it('сортирует позиции по ключу', () => {
    const items: CartItemInput[] = [
      { type: 'handle', handleId: 'b', qty: 1, unitPrice: 1 },
      { type: 'door', model: 'A', qty: 1, unitPrice: 1 },
      { type: 'limiter', limiterId: 'c', qty: 1, unitPrice: 1 }
    ];
    const result = normalizeItems(items);
    const types = result.map((r: NormalizedCartItem) => r.type);
    expect(types).toEqual(['door', 'handle', 'limiter']);
  });
});

describe('compareCartContent', () => {
  it('считает одинаковые корзины (двери) равными', () => {
    const items1: CartItemInput[] = [
      { type: 'door', model: 'M', style: 'S', color: 'white', width: 800, height: 2000, qty: 1, unitPrice: 10000 }
    ];
    const items2 = JSON.stringify(items1);
    expect(compareCartContent(items1, items2)).toBe(true);
  });

  it('считает разный состав корзин разными', () => {
    const items1: CartItemInput[] = [
      { type: 'door', model: 'M1', qty: 1, unitPrice: 10000 }
    ];
    const items2: CartItemInput[] = [
      { type: 'door', model: 'M2', qty: 1, unitPrice: 10000 }
    ];
    expect(compareCartContent(items1, JSON.stringify(items2))).toBe(false);
  });

  it('считает корзины с ручкой и заверткой разными при разном handleId', () => {
    const items1: CartItemInput[] = [
      { type: 'handle', handleId: 'h1', qty: 1, unitPrice: 500 }
    ];
    const items2: CartItemInput[] = [
      { type: 'handle', handleId: 'h2', qty: 1, unitPrice: 500 }
    ];
    expect(compareCartContent(items1, JSON.stringify(items2))).toBe(false);
  });

  it('считает одинаковые ручки равными', () => {
    const items: CartItemInput[] = [
      { type: 'handle', handleId: 'h1', qty: 2, unitPrice: 500 }
    ];
    expect(compareCartContent(items, JSON.stringify(items))).toBe(true);
  });

  it('считает одинаковые ограничители равными', () => {
    const items: CartItemInput[] = [
      { type: 'limiter', limiterId: 'lim-1', qty: 1, unitPrice: 300 }
    ];
    expect(compareCartContent(items, JSON.stringify(items))).toBe(true);
  });

  it('допускает разницу в цене до 0.01 для ручек', () => {
    const items1: CartItemInput[] = [{ type: 'handle', handleId: 'h1', qty: 1, unitPrice: 100.005 }];
    const items2: CartItemInput[] = [{ type: 'handle', handleId: 'h1', qty: 1, unitPrice: 100.01 }];
    expect(compareCartContent(items1, JSON.stringify(items2))).toBe(true);
  });

  it('парсит cart_data как массив или объект с items', () => {
    const items: CartItemInput[] = [{ type: 'door', model: 'M', qty: 1, unitPrice: 1000 }];
    expect(compareCartContent(items, JSON.stringify(items))).toBe(true);
    expect(compareCartContent(items, JSON.stringify({ items }))).toBe(true);
  });

  it('возвращает false при null/пустой строке или невалидном JSON', () => {
    const items: CartItemInput[] = [{ type: 'door', model: 'M', qty: 1, unitPrice: 1000 }];
    expect(compareCartContent(items, null)).toBe(false);
    expect(compareCartContent(items, '')).toBe(false);
    expect(compareCartContent(items, 'invalid')).toBe(false);
  });
});
