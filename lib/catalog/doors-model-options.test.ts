/**
 * Тесты каскада model-options: фильтры и сбор опций.
 */
import { describe, it, expect } from 'vitest';
import {
  getProductsByModelAndStyle,
  filterByReversible,
  filterByFilling,
  filterBySize,
  filterByFinish,
  filterByColor,
  heightForFilter,
  collectOptions,
  HEIGHT_BAND_2301_2500,
  HEIGHT_BAND_2501_3000,
  type ProductLike
} from './doors-model-options';

function product(properties: Record<string, unknown>): ProductLike {
  return { properties };
}

describe('getProductsByModelAndStyle', () => {
  it('оставляет только товары с совпадением кода модели', () => {
    const list = [
      product({ 'Код модели Domeo (Web)': 'M1', 'Domeo_Стиль Web': 'Современные' }),
      product({ 'Код модели Domeo (Web)': 'M2', 'Domeo_Стиль Web': 'Современные' }),
      product({ 'Код модели Domeo (Web)': 'M1', 'Domeo_Стиль Web': 'Классика' })
    ];
    const r = getProductsByModelAndStyle(list, 'M1');
    expect(r).toHaveLength(2);
  });

  it('при указании style фильтрует по стилю', () => {
    const list = [
      product({ 'Код модели Domeo (Web)': 'M1', 'Domeo_Стиль Web': 'Современные' }),
      product({ 'Код модели Domeo (Web)': 'M1', 'Domeo_Стиль Web': 'Классика' })
    ];
    const r = getProductsByModelAndStyle(list, 'M1', 'Современные');
    expect(r).toHaveLength(1);
    expect(r[0].properties['Domeo_Стиль Web']).toBe('Современные');
  });

  it('совпадает только по Код модели Domeo (Web)', () => {
    const list = [product({ 'Код модели Domeo (Web)': 'Классика', 'Domeo_Стиль Web': 'Современные' })];
    const r = getProductsByModelAndStyle(list, 'Классика');
    expect(r).toHaveLength(1);
  });
});

describe('filterByReversible', () => {
  it('при reversible=false возвращает всех', () => {
    const list = [
      product({ 'Domeo_Опции_Реверс_доступен': 'да' }),
      product({ 'Domeo_Опции_Реверс_доступен': 'нет' })
    ];
    expect(filterByReversible(list, false)).toHaveLength(2);
  });

  it('при reversible=true оставляет только с реверсом да', () => {
    const list = [
      product({ 'Domeo_Опции_Реверс_доступен': 'да' }),
      product({ 'Domeo_Опции_Реверс_доступен': 'нет' }),
      product({ 'Domeo_Опции_Реверс_доступен': 'Да' })
    ];
    const r = filterByReversible(list, true);
    expect(r).toHaveLength(2);
  });
});

describe('filterByFilling', () => {
  it('при пустом filling возвращает всех', () => {
    const list = [product({ 'Domeo_Опции_Название_наполнения': 'Голд' })];
    expect(filterByFilling(list, '')).toHaveLength(1);
  });

  it('фильтрует по названию наполнения', () => {
    const list = [
      product({ 'Domeo_Опции_Название_наполнения': 'Голд' }),
      product({ 'Domeo_Опции_Название_наполнения': 'Сильвер' })
    ];
    const r = filterByFilling(list, 'Голд');
    expect(r).toHaveLength(1);
    expect(r[0].properties['Domeo_Опции_Название_наполнения']).toBe('Голд');
  });
});

describe('filterBySize', () => {
  it('фильтрует по ширине и высоте', () => {
    const list = [
      product({ 'Ширина/мм': 800, 'Высота/мм': 2000 }),
      product({ 'Ширина/мм': 800, 'Высота/мм': 2100 }),
      product({ 'Ширина/мм': 700, 'Высота/мм': 2000 })
    ];
    expect(filterBySize(list, 800, null)).toHaveLength(2);
    expect(filterBySize(list, 800, 2000)).toHaveLength(1);
    expect(filterBySize(list, 700, 2000)).toHaveLength(1);
  });

});

describe('filterByFinish and filterByColor', () => {
  it('filterByFinish по типу покрытия', () => {
    const list = [
      product({ 'Тип покрытия': 'ПВХ' }),
      product({ 'Тип покрытия': 'Эмаль' })
    ];
    expect(filterByFinish(list, 'ПВХ')).toHaveLength(1);
  });

  it('filterByColor по цвету', () => {
    const list = [
      product({ 'Цвет/Отделка': 'Белый' }),
      product({ 'Цвет/Отделка': 'Венге' })
    ];
    expect(filterByColor(list, 'Белый')).toHaveLength(1);
  });

  it('filterByFinish без учёта регистра', () => {
    const list = [
      product({ 'Тип покрытия': 'Эмаль' }),
      product({ 'Тип покрытия': 'ПВХ' })
    ];
    expect(filterByFinish(list, 'эмаль')).toHaveLength(1);
    expect(filterByFinish(list, 'ЭМАЛЬ')).toHaveLength(1);
    expect(filterByFinish(list, 'Пвх')).toHaveLength(1);
  });
});

describe('heightForFilter', () => {
  it('2350 и 2750 маппятся в 2000 для фильтра', () => {
    expect(heightForFilter(HEIGHT_BAND_2301_2500)).toBe(2000);
    expect(heightForFilter(HEIGHT_BAND_2501_3000)).toBe(2000);
  });

  it('обычные высоты не меняются', () => {
    expect(heightForFilter(2000)).toBe(2000);
    expect(heightForFilter(2100)).toBe(2100);
  });

  it('null и 0 возвращают null', () => {
    expect(heightForFilter(null)).toBe(null);
    expect(heightForFilter(0)).toBe(null);
  });
});

describe('collectOptions', () => {
  it('собирает уникальные fillings, widths, heights, finishes', () => {
    const list = [
      product({
        'Domeo_Опции_Название_наполнения': 'Голд',
        'Ширина/мм': 800,
        'Высота/мм': 2000,
        'Тип покрытия': 'ПВХ',
        'Цвет/Отделка': 'Белый'
      }),
      product({
        'Domeo_Опции_Название_наполнения': 'Сильвер',
        'Ширина/мм': 800,
        'Высота/мм': 2100,
        'Тип покрытия': 'ПВХ',
        'Цвет/Отделка': 'Венге'
      })
    ];
    const opt = collectOptions(list);
    expect(opt.fillings).toEqual(expect.arrayContaining(['Голд', 'Сильвер']));
    expect(opt.widths).toEqual([800]);
    expect(opt.heights).toEqual([2000, 2100]);
    expect(opt.finishes).toEqual(['ПВХ']);
    expect(opt.colorsByFinish['ПВХ']).toEqual(expect.arrayContaining(['Белый', 'Венге']));
  });

  it('revers_available и mirror_available по наличию да', () => {
    const withRev = [product({ 'Domeo_Опции_Реверс_доступен': 'да' })];
    const withMirror = [product({ 'Domeo_Опции_Зеркало_доступно': 'да' })];
    const withThreshold = [product({ 'Domeo_Опции_Порог_доступен': 'да' })];
    expect(collectOptions(withRev).revers_available).toBe(true);
    expect(collectOptions(withMirror).mirror_available).toBe(true);
    expect(collectOptions(withThreshold).threshold_available).toBe(true);
  });

  it('пустой массив возвращает пустые массивы и false флаги', () => {
    const opt = collectOptions([]);
    expect(opt.fillings).toEqual([]);
    expect(opt.widths).toEqual([]);
    expect(opt.heights).toEqual([]);
    expect(opt.finishes).toEqual([]);
    expect(opt.colorsByFinish).toEqual({});
    expect(opt.edges).toEqual([]);
    expect(opt.revers_available).toBe(false);
    expect(opt.mirror_available).toBe(false);
    expect(opt.threshold_available).toBe(false);
  });

  it('edges собираются из Кромка и из Domeo_Кромка_* при кромке в базе', () => {
    const list = [
      product({
        'Кромка': 'Матовый хром',
        'Domeo_Кромка_в_базе_включена': 'нет'
      }),
      product({
        'Кромка': '',
        'Domeo_Кромка_в_базе_включена': 'да',
        'Domeo_Кромка_базовая_цвет': 'Матовый хром',
        'Domeo_Кромка_Цвет_2': 'Матовое золото',
        'Domeo_Кромка_Цвет_3': ''
      })
    ];
    const opt = collectOptions(list);
    expect(opt.edges).toContain('Матовый хром');
    expect(opt.edges).toContain('Матовое золото');
    expect(opt.edges.sort()).toEqual(['Матовое золото', 'Матовый хром'].sort());
  });

  it('edges только из Domeo_Кромка_* когда поле Кромка пусто (Эмаль/ПВХ)', () => {
    const list = [
      product({
        'Кромка': '',
        'Domeo_Кромка_в_базе_включена': 'да',
        'Domeo_Кромка_базовая_цвет': 'Базовый',
        'Domeo_Кромка_Цвет_2': 'Цвет 2'
      })
    ];
    const opt = collectOptions(list);
    expect(opt.edges).toContain('Базовый');
    expect(opt.edges).toContain('Цвет 2');
  });
});

describe('каскад целиком', () => {
  const products: ProductLike[] = [
    product({
      'Код модели Domeo (Web)': 'MOD',
      'Domeo_Стиль Web': 'Современные',
      'Domeo_Опции_Реверс_доступен': 'да',
      'Domeo_Опции_Название_наполнения': 'Голд',
      'Ширина/мм': 800,
      'Высота/мм': 2000,
      'Тип покрытия': 'ПВХ',
      'Цвет/Отделка': 'Белый'
    }),
    product({
      'Код модели Domeo (Web)': 'MOD',
      'Domeo_Стиль Web': 'Современные',
      'Domeo_Опции_Реверс_доступен': 'нет',
      'Domeo_Опции_Название_наполнения': 'Сильвер',
      'Ширина/мм': 800,
      'Высота/мм': 2000,
      'Тип покрытия': 'Эмаль',
      'Цвет/Отделка': 'Слоновая кость'
    })
  ];

  it('последовательность модель→реверс→наполнение→размер→покрытие→цвет сужает набор', () => {
    let f = getProductsByModelAndStyle(products, 'MOD', 'Современные');
    expect(f).toHaveLength(2);

    f = filterByReversible(f, true);
    expect(f).toHaveLength(1);
    expect(f[0].properties['Domeo_Опции_Название_наполнения']).toBe('Голд');

    f = filterByFilling(f, 'Голд');
    expect(f).toHaveLength(1);

    f = filterBySize(f, 800, 2000);
    expect(f).toHaveLength(1);

    f = filterByFinish(f, 'ПВХ');
    expect(f).toHaveLength(1);

    f = filterByColor(f, 'Белый');
    expect(f).toHaveLength(1);

    const opt = collectOptions(f);
    expect(opt.fillings).toEqual(['Голд']);
    expect(opt.finishes).toEqual(['ПВХ']);
    expect(opt.colorsByFinish['ПВХ']).toEqual(['Белый']);
  });

  it('при height=2350 фильтр по размеру использует 2000 и находит товары с Высота/мм 2000', () => {
    const height = heightForFilter(2350);
    expect(height).toBe(2000);
    const f = filterBySize(products, 800, height);
    expect(f).toHaveLength(2);
  });
});
