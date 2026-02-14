/**
 * Тесты конфигуратора дверей: формулы, связи, разные опции и конфигурации.
 * Минимум 20 тестов для проверки движка расчёта цены.
 */
import { describe, it, expect } from 'vitest';
import {
  getProductRrc,
  pickMaxPriceProduct,
  heightForMatching,
  filterProducts,
  calculateDoorPrice,
  HEIGHT_BAND_2301_2500,
  HEIGHT_BAND_2501_3000,
  type ProductWithProps,
  type PriceSelection
} from './doors-price-engine';

// Фикстура: товары дверей с разными свойствами
function doorProduct(overrides: Partial<ProductWithProps> & { properties_data: Record<string, unknown> }): ProductWithProps {
  return {
    id: 'door-1',
    sku: 'D-SKU',
    name: 'Дверь',
    base_price: 10000,
    ...overrides,
    properties_data: overrides.properties_data ?? {}
  };
}

describe('getProductRrc', () => {
  it('1. возвращает Цена РРЦ из properties_data', () => {
    const p = doorProduct({ properties_data: { 'Цена РРЦ': 15000 } });
    expect(getProductRrc(p)).toBe(15000);
  });

  it('2. возвращает base_price если РРЦ нет или 0', () => {
    const p = doorProduct({ properties_data: {}, base_price: 12000 });
    expect(getProductRrc(p)).toBe(12000);
  });
});

describe('heightForMatching', () => {
  it('3. высота 2350 (2301–2500) маппится в 2000 для подбора товара', () => {
    expect(heightForMatching(HEIGHT_BAND_2301_2500)).toBe(2000);
  });

  it('4. высота 2750 (2501–3000) маппится в 2000', () => {
    expect(heightForMatching(HEIGHT_BAND_2501_3000)).toBe(2000);
  });

  it('5. обычная высота возвращается как есть', () => {
    expect(heightForMatching(2000)).toBe(2000);
    expect(heightForMatching(2100)).toBe(2100);
  });
});

describe('pickMaxPriceProduct', () => {
  it('6. выбирает товар с максимальной РРЦ', () => {
    const products: ProductWithProps[] = [
      doorProduct({ id: 'a', properties_data: { 'Цена РРЦ': 10000 } }),
      doorProduct({ id: 'b', properties_data: { 'Цена РРЦ': 18000 } }),
      doorProduct({ id: 'c', properties_data: { 'Цена РРЦ': 12000 } })
    ];
    const picked = pickMaxPriceProduct(products);
    expect(picked.id).toBe('b');
    expect(getProductRrc(picked)).toBe(18000);
  });
});

describe('filterProducts', () => {
  const baseDoor = doorProduct({
    properties_data: {
      'Код модели Domeo (Web)': 'MODEL-A',
      'Domeo_Стиль Web': 'Современные',
      'Тип покрытия': 'ПВХ',
      'Domeo_Цвет': 'Белый',
      'Ширина/мм': 800,
      'Высота/мм': 2000,
      'Domeo_Опции_Название_наполнения': 'Голд',
      'Цена РРЦ': 15000
    }
  });

  it('7. фильтрует по модели и стилю', () => {
    const list = [baseDoor];
    const sel: PriceSelection = { model: 'MODEL-A', style: 'Современные' };
    expect(filterProducts(list, sel, true, false)).toHaveLength(1);
    expect(filterProducts(list, { ...sel, model: 'OTHER' }, true, false)).toHaveLength(0);
  });

  it('8. фильтрует по наполнению (filling)', () => {
    const list = [baseDoor];
    expect(filterProducts(list, { model: 'MODEL-A', filling: 'Голд' }, false, false)).toHaveLength(1);
    expect(filterProducts(list, { model: 'MODEL-A', filling: 'Сильвер' }, false, false)).toHaveLength(0);
  });

  it('9. фильтрует по ширине и высоте', () => {
    const list = [baseDoor];
    expect(filterProducts(list, { model: 'MODEL-A', width: 800, height: 2000 }, false, false)).toHaveLength(1);
    expect(filterProducts(list, { model: 'MODEL-A', width: 700 }, false, false)).toHaveLength(0);
  });

  it('10. при height 2350 ищет товар с Высота/мм 2000', () => {
    const list = [baseDoor]; // Высота/мм 2000
    const sel: PriceSelection = { model: 'MODEL-A', width: 800, height: HEIGHT_BAND_2301_2500 };
    expect(filterProducts(list, sel, false, false)).toHaveLength(1);
  });
});

describe('calculateDoorPrice — базовая дверь', () => {
  const products: ProductWithProps[] = [
    doorProduct({
      id: 'd1',
      sku: 'DOOR-800-2000',
      properties_data: {
        'Код модели Domeo (Web)': 'M1',
        'Domeo_Стиль Web': 'Современные',
        'Тип покрытия': 'ПВХ',
        'Domeo_Цвет': 'Белый',
        'Ширина/мм': 800,
        'Высота/мм': 2000,
        'Цена РРЦ': 20000
      }
    })
  ];

  const baseInput = {
    products,
    selection: {
      style: 'Современные',
      model: 'M1',
      finish: 'ПВХ',
      color: 'Белый',
      width: 800,
      height: 2000
    } as PriceSelection,
    hardwareKits: [],
    handles: [],
    getLimiter: () => null,
    getOptionProducts: () => []
  };

  it('11. итог = сумма breakdown (базовая дверь)', () => {
    const r = calculateDoorPrice(baseInput);
    expect(r.currency).toBe('RUB');
    expect(r.base).toBe(20000);
    expect(r.breakdown).toHaveLength(1);
    expect(r.breakdown[0].label).toBe('Дверь');
    expect(r.breakdown[0].amount).toBe(20000);
    expect(r.total).toBe(20000);
    const sumBreakdown = r.breakdown.reduce((s, b) => s + b.amount, 0);
    expect(r.total).toBe(sumBreakdown);
  });

  it('12. total округляется до целого', () => {
    const prodWithFloat = [
      doorProduct({
        properties_data: {
          ...(products[0].properties_data as Record<string, unknown>),
          'Цена РРЦ': 19999.7
        }
      })
    ];
    const r = calculateDoorPrice({ ...baseInput, products: prodWithFloat });
    expect(r.total).toBe(20000);
  });
});

describe('calculateDoorPrice — надбавка за высоту', () => {
  const product2350 = doorProduct({
    id: 'd2',
    properties_data: {
      'Код модели Domeo (Web)': 'M2',
      'Domeo_Стиль Web': 'Современные',
      'Тип покрытия': 'Эмаль',
      'Domeo_Цвет': 'Слоновая кость',
      'Ширина/мм': 800,
      'Высота/мм': 2000,
      'Цена РРЦ': 25000,
      'Domeo_Опции_Надбавка_2301_2500_процент': 15
    }
  });

  it('13. надбавка за высоту 2301–2500: процент от базы', () => {
    const r = calculateDoorPrice({
      products: [product2350],
      selection: {
        style: 'Современные',
        model: 'M2',
        finish: 'Эмаль',
        color: 'Слоновая кость',
        width: 800,
        height: HEIGHT_BAND_2301_2500
      },
      hardwareKits: [],
      handles: [],
      getLimiter: () => null,
      getOptionProducts: () => []
    });
    expect(r.base).toBe(25000);
    const surcharge = r.breakdown.find((b) => b.label.includes('2301–2500'));
    expect(surcharge).toBeDefined();
    expect(surcharge!.amount).toBe(Math.round((25000 * 15) / 100));
    expect(r.total).toBe(r.base + surcharge!.amount);
  });

  const product2750 = doorProduct({
    id: 'd3',
    properties_data: {
      'Код модели Domeo (Web)': 'M3',
      'Domeo_Стиль Web': 'Классика',
      'Тип покрытия': 'ПВХ',
      'Domeo_Цвет': 'Дуб',
      'Ширина/мм': 900,
      'Высота/мм': 2000,
      'Цена РРЦ': 18000,
      'Domeo_Опции_Надбавка_2501_3000_процент': 20
    }
  });

  it('14. надбавка за высоту 2501–3000: процент от базы', () => {
    const r = calculateDoorPrice({
      products: [product2750],
      selection: {
        style: 'Классика',
        model: 'M3',
        finish: 'ПВХ',
        color: 'Дуб',
        width: 900,
        height: HEIGHT_BAND_2501_3000
      },
      hardwareKits: [],
      handles: [],
      getLimiter: () => null,
      getOptionProducts: () => []
    });
    const surcharge = r.breakdown.find((b) => b.label.includes('2501–3000'));
    expect(surcharge).toBeDefined();
    expect(surcharge!.amount).toBe(Math.round((18000 * 20) / 100));
    expect(r.total).toBe(r.base + surcharge!.amount);
  });
});

describe('calculateDoorPrice — реверс, зеркало, порог', () => {
  const productWithOptions = doorProduct({
    id: 'd4',
    properties_data: {
      'Код модели Domeo (Web)': 'M4',
      'Domeo_Стиль Web': 'Современные',
      'Тип покрытия': 'ПВХ',
      'Domeo_Цвет': 'Белый',
      'Ширина/мм': 800,
      'Высота/мм': 2000,
      'Цена РРЦ': 22000,
      'Domeo_Опции_Надбавка_реверс_руб': 500,
      'Domeo_Опции_Зеркало_одна_сторона_руб': 1500,
      'Domeo_Опции_Зеркало_две_стороны_руб': 2800,
      'Domeo_Опции_Цена_порога_руб': 800
    }
  });

  it('15. реверс добавляет надбавку в breakdown и total', () => {
    const r = calculateDoorPrice({
      products: [productWithOptions],
      selection: {
        style: 'Современные',
        model: 'M4',
        finish: 'ПВХ',
        color: 'Белый',
        width: 800,
        height: 2000,
        reversible: true
      },
      hardwareKits: [],
      handles: [],
      getLimiter: () => null,
      getOptionProducts: () => []
    });
    const rev = r.breakdown.find((b) => b.label === 'Реверс');
    expect(rev).toBeDefined();
    expect(rev!.amount).toBe(500);
    expect(r.total).toBe(22000 + 500);
  });

  it('16. зеркало одна сторона (one / mirror_one)', () => {
    const r = calculateDoorPrice({
      products: [productWithOptions],
      selection: {
        style: 'Современные',
        model: 'M4',
        finish: 'ПВХ',
        color: 'Белый',
        width: 800,
        height: 2000,
        mirror: 'one'
      },
      hardwareKits: [],
      handles: [],
      getLimiter: () => null,
      getOptionProducts: () => []
    });
    const mirror = r.breakdown.find((b) => b.label.includes('одна сторона'));
    expect(mirror?.amount).toBe(1500);
    expect(r.total).toBe(22000 + 1500);
  });

  it('17. зеркало две стороны (both / mirror_both)', () => {
    const r = calculateDoorPrice({
      products: [productWithOptions],
      selection: {
        style: 'Современные',
        model: 'M4',
        finish: 'ПВХ',
        color: 'Белый',
        width: 800,
        height: 2000,
        mirror: 'mirror_both'
      },
      hardwareKits: [],
      handles: [],
      getLimiter: () => null,
      getOptionProducts: () => []
    });
    const mirror = r.breakdown.find((b) => b.label.includes('две стороны'));
    expect(mirror?.amount).toBe(2800);
    expect(r.total).toBe(22000 + 2800);
  });

  it('18. порог добавляет цену из опций', () => {
    const r = calculateDoorPrice({
      products: [productWithOptions],
      selection: {
        style: 'Современные',
        model: 'M4',
        finish: 'ПВХ',
        color: 'Белый',
        width: 800,
        height: 2000,
        threshold: true
      },
      hardwareKits: [],
      handles: [],
      getLimiter: () => null,
      getOptionProducts: () => []
    });
    const th = r.breakdown.find((b) => b.label === 'Порог');
    expect(th?.amount).toBe(800);
    expect(r.total).toBe(22000 + 800);
  });
});

describe('calculateDoorPrice — кромка, комплект, ручка, завертка, ограничитель, опции', () => {
  const door = doorProduct({
    id: 'd5',
    properties_data: {
      'Код модели Domeo (Web)': 'M5',
      'Domeo_Стиль Web': 'Современные',
      'Тип покрытия': 'ПВХ',
      'Domeo_Цвет': 'Белый',
      'Ширина/мм': 800,
      'Высота/мм': 2000,
      'Цена РРЦ': 17000,
      'Domeo_Кромка_базовая_цвет': 'Базовый',
      'Domeo_Кромка_Цвет_2': 'Цветная',
      'Domeo_Кромка_Наценка_Цвет_2': 300
    }
  });

  it('19. кромка с наценкой (не базовая) добавляется в breakdown', () => {
    const r = calculateDoorPrice({
      products: [door],
      selection: {
        style: 'Современные',
        model: 'M5',
        finish: 'ПВХ',
        color: 'Белый',
        width: 800,
        height: 2000,
        edge_id: 'Цветная'
      },
      hardwareKits: [],
      handles: [],
      getLimiter: () => null,
      getOptionProducts: () => []
    });
    const edge = r.breakdown.find((b) => b.label.includes('Кромка'));
    expect(edge?.amount).toBe(300);
    expect(r.total).toBe(17000 + 300);
  });

  it('20. комплект фурнитуры добавляет цену', () => {
    const kit: ProductWithProps = {
      id: 'kit-1',
      name: 'Комплект базовый',
      base_price: 2500,
      properties_data: { 'Группа_цена': 2500, 'Наименование для Web': 'Базовый комплект' }
    };
    const r = calculateDoorPrice({
      products: [door],
      selection: {
        style: 'Современные',
        model: 'M5',
        finish: 'ПВХ',
        color: 'Белый',
        width: 800,
        height: 2000,
        hardware_kit: { id: 'kit-1' }
      },
      hardwareKits: [kit],
      handles: [],
      getLimiter: () => null,
      getOptionProducts: () => []
    });
    const kitRow = r.breakdown.find((b) => b.label.includes('Комплект'));
    expect(kitRow?.amount).toBe(2500);
    expect(r.total).toBe(17000 + 2500);
  });

  it('21. ручка и завертка добавляют свои суммы', () => {
    const handle: ProductWithProps = {
      id: 'h1',
      name: 'Ручка А',
      base_price: 1200,
      properties_data: {
        'Domeo_цена группы Web': 1200,
        'Domeo_наименование ручки_1С': 'Ручка А',
        'Завертка, цена РРЦ': 600
      }
    };
    const r = calculateDoorPrice({
      products: [door],
      selection: {
        style: 'Современные',
        model: 'M5',
        finish: 'ПВХ',
        color: 'Белый',
        width: 800,
        height: 2000,
        handle: { id: 'h1' },
        backplate: true
      },
      hardwareKits: [],
      handles: [handle],
      getLimiter: () => null,
      getOptionProducts: () => []
    });
    const handleRow = r.breakdown.find((b) => b.label.includes('Ручка'));
    const backplateRow = r.breakdown.find((b) => b.label.includes('Завертка'));
    expect(handleRow?.amount).toBe(1200);
    expect(backplateRow?.amount).toBe(600);
    expect(r.total).toBe(17000 + 1200 + 600);
  });

  it('22. ограничитель добавляется по limiter_id', () => {
    const limiter: ProductWithProps = {
      id: 'lim-1',
      name: 'Ограничитель напольный',
      base_price: 400,
      properties_data: { 'Цена РРЦ': 450 }
    };
    const r = calculateDoorPrice({
      products: [door],
      selection: {
        style: 'Современные',
        model: 'M5',
        finish: 'ПВХ',
        color: 'Белый',
        width: 800,
        height: 2000,
        limiter_id: 'lim-1'
      },
      hardwareKits: [],
      handles: [],
      getLimiter: (id) => (id === 'lim-1' ? limiter : null),
      getOptionProducts: () => []
    });
    const limRow = r.breakdown.find((b) => b.label.includes('Ограничитель'));
    expect(limRow?.amount).toBe(450);
    expect(r.total).toBe(17000 + 450);
  });

  it('23. опции (option_ids) — наличники и т.д. суммируются', () => {
    const opt1: ProductWithProps = {
      id: 'opt-1',
      name: 'Наличник 80мм',
      base_price: 800,
      properties_data: { 'Цена РРЦ': 850 }
    };
    const r = calculateDoorPrice({
      products: [door],
      selection: {
        style: 'Современные',
        model: 'M5',
        finish: 'ПВХ',
        color: 'Белый',
        width: 800,
        height: 2000,
        option_ids: ['opt-1']
      },
      hardwareKits: [],
      handles: [],
      getLimiter: () => null,
      getOptionProducts: (ids) => (ids.includes('opt-1') ? [opt1] : [])
    });
    const optRow = r.breakdown.find((b) => b.label.includes('Наличник'));
    expect(optRow?.amount).toBe(850);
    expect(r.total).toBe(17000 + 850);
  });
});

describe('calculateDoorPrice — связи и граничные случаи', () => {
  it('24. при отсутствии подходящего товара выбрасывается ошибка', () => {
    const products = [
      doorProduct({
        properties_data: {
          'Код модели Domeo (Web)': 'X',
          'Domeo_Стиль Web': 'Современные',
          'Тип покрытия': 'ПВХ',
          'Domeo_Цвет': 'Белый',
          'Ширина/мм': 800,
          'Высота/мм': 2000,
          'Цена РРЦ': 10000
        }
      })
    ];
    expect(() =>
      calculateDoorPrice({
        products,
        selection: { model: 'Y', style: 'Современные', width: 800, height: 2000 },
        hardwareKits: [],
        handles: [],
        getLimiter: () => null,
        getOptionProducts: () => []
      })
    ).toThrow(/Товар с указанными параметрами не найден/);
  });

  it('25. итоговая сумма всегда равна сумме breakdown', () => {
    const doorFull = doorProduct({
      properties_data: {
        'Код модели Domeo (Web)': 'M6',
        'Domeo_Стиль Web': 'Классика',
        'Тип покрытия': 'Эмаль',
        'Domeo_Цвет': 'Венге',
        'Ширина/мм': 900,
        'Высота/мм': 2000,
        'Цена РРЦ': 28000,
        'Domeo_Опции_Надбавка_реверс_руб': 600,
        'Domeo_Опции_Цена_порога_руб': 900
      }
    });
    const kit: ProductWithProps = {
      id: 'k2',
      name: 'Кит',
      base_price: 3000,
      properties_data: { 'Группа_цена': 3000 }
    };
    const handle: ProductWithProps = {
      id: 'h2',
      name: 'Ручка',
      base_price: 1500,
      properties_data: { 'Domeo_цена группы Web': 1500 }
    };
    const r = calculateDoorPrice({
      products: [doorFull],
      selection: {
        style: 'Классика',
        model: 'M6',
        finish: 'Эмаль',
        color: 'Венге',
        width: 900,
        height: 2000,
        reversible: true,
        threshold: true,
        hardware_kit: { id: 'k2' },
        handle: { id: 'h2' }
      },
      hardwareKits: [kit],
      handles: [handle],
      getLimiter: () => null,
      getOptionProducts: () => []
    });
    const sumBreakdown = r.breakdown.reduce((s, b) => s + b.amount, 0);
    expect(r.total).toBe(sumBreakdown);
    expect(r.total).toBe(28000 + 600 + 900 + 3000 + 1500);
  });
});
