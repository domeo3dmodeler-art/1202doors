'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchWithAuth } from '@/lib/utils/fetch-with-auth';
import { parseApiResponse } from '@/lib/utils/parse-api-response';
import type { DoorModel, DoorCoating, DoorEdge, DoorOption, DoorHandle, DoorLimiter } from './api';

/**
 * Хук для загрузки базовых данных конфигуратора (модели, ручки, ограничители)
 */
/** Опции по модели (реверс, зеркало, порог, наполнение) — из листа «Опции», агрегированы по всем товарам модели */
export interface DoorModelOptions {
  revers_available?: boolean;
  revers_surcharge_rub?: number;
  threshold_available?: boolean;
  threshold_price_rub?: number;
  mirror_available?: boolean;
  mirror_one_rub?: number;
  mirror_both_rub?: number;
  /** Первое/основное наполнение (для обратной совместимости) */
  filling_name?: string;
}

/** Расширение модели из complete-data: опции + список всех наполнений модели */
export type DoorModelWithOptions = DoorModel & {
  doorOptions?: DoorModelOptions;
  /** Все варианты наполнения по модели (объединение по товарам с одним Код модели Domeo (Web)) */
  filling_names?: string[];
};

export function useConfiguratorData() {
  const [models, setModels] = useState<DoorModelWithOptions[]>([]);
  const [rawModels, setRawModels] = useState<any[]>([]);
  const [handles, setHandles] = useState<DoorHandle[]>([]);
  const [limiters, setLimiters] = useState<DoorLimiter[]>([]);
  const [architraves, setArchitraves] = useState<DoorOption[]>([]);
  const [kits, setKits] = useState<Array<{ id: string; name: string; price: number; priceGroup?: string; isBasic?: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        setLoading(true);
        setError(null);

        // При ?refresh=1 в URL запрашиваем данные без кэша (после правок в БД)
        const refreshQ = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('refresh') === '1' ? '?refresh=1' : '';
        const [modelsResponse, handlesRes, limitersRes, architravesRes, kitsRes] = await Promise.all([
          fetch('/api/catalog/doors/complete-data' + refreshQ, { cache: 'no-store' }),
          fetch('/api/catalog/hardware?type=handles'),
          fetch('/api/catalog/hardware?type=limiters'),
          fetch('/api/catalog/hardware?type=architraves'),
          fetch('/api/catalog/hardware?type=kits'),
        ]);

        if (!cancelled && modelsResponse.ok) {
          const responseData = await modelsResponse.json();
          const modelsData = parseApiResponse<{ ok?: boolean; models: any[]; totalModels?: number; styles?: string[] }>(responseData);
          if (modelsData && (modelsData.ok !== false) && modelsData.models && Array.isArray(modelsData.models)) {
            setRawModels(modelsData.models);
            setModels(modelsData.models.map((m: any) => ({
              id: m.modelKey || m.model || String(Math.random()),
              model: m.modelKey || m.model || '',
              model_name: m.model || '',
              style: m.style || '',
              suppliers: Array.isArray(m.suppliers) ? m.suppliers : [],
              photo: m.photo ?? m.photos?.cover ?? null,
              photos: m.photos ?? { cover: m.photo, gallery: [] },
              sizes: m.products?.map((p: any) => ({
                width: Number(p.properties?.['Ширина/мм']) || 800,
                height: Number(p.properties?.['Высота/мм']) || 2000,
              })).filter((s: any) => s.width && s.height) || [],
              doorOptions: m.doorOptions,
              filling_names: m.filling_names ?? (m.doorOptions?.filling_name ? [m.doorOptions.filling_name] : []),
            })));
          }
        } else if (!modelsResponse.ok && !cancelled) {
          throw new Error(`HTTP error! status: ${modelsResponse.status}`);
        }

        if (!cancelled && handlesRes.ok) {
          try {
            const handlesData = await handlesRes.json();
            const grouped = parseApiResponse<Record<string, Array<{ id: string; name: string; group?: string; price?: number; photos?: string[]; color?: string | null; description?: string | null; backplate_price_rrc?: number }>>>(handlesData);
            if (grouped && typeof grouped === 'object') {
              const flat: DoorHandle[] = [];
              for (const group of Object.values(grouped)) {
                if (Array.isArray(group)) {
                  for (const h of group) {
                    flat.push({
                      id: h.id || '',
                      name: h.name || '',
                      photo_path: (h.photos && h.photos[0]) ? h.photos[0] : null,
                      photos: Array.isArray(h.photos) ? h.photos : undefined,
                      price_rrc: Number(h.price) || 0,
                      price_opt: 0,
                      series: h.group,
                      color: h.color ?? undefined,
                      description: h.description ?? undefined,
                      backplate_price_rrc: Number(h.backplate_price_rrc) || 0,
                    });
                  }
                }
              }
              setHandles(flat);
            }
          } catch {
            setHandles([]);
          }
        }

        if (!cancelled && limitersRes.ok) {
          try {
            const limitersData = await limitersRes.json();
            const list = parseApiResponse<Array<{ id: string; name: string; photo_path?: string | null; price_rrc?: number; price_opt?: number }>>(limitersData);
            if (Array.isArray(list)) {
              setLimiters(list.map((l) => ({
                id: l.id,
                name: l.name || '',
                photo_path: l.photo_path ?? null,
                price_rrc: l.price_rrc ?? 0,
                price_opt: l.price_opt ?? 0,
              })));
            }
          } catch {
            setLimiters([]);
          }
        }

        if (!cancelled && architravesRes.ok) {
          try {
            const architravesData = await architravesRes.json();
            const list = parseApiResponse<Array<{ id: string; option_type?: string; option_name?: string; price_surcharge?: number; photo_path?: string | null; supplier?: string }>>(architravesData);
            if (Array.isArray(list)) {
              setArchitraves(list.map((a) => ({
                id: a.id,
                option_type: a.option_type || 'наличники',
                option_name: a.option_name || '',
                name: a.option_name || a.name || '',
                price_surcharge: a.price_surcharge,
                photo_path: a.photo_path ?? null,
                supplier: a.supplier ?? undefined,
              })));
            }
          } catch {
            setArchitraves([]);
          }
        }

        if (!cancelled && kitsRes.ok) {
          try {
            const kitsData = await kitsRes.json();
            const list = parseApiResponse<Array<{ id: string; name: string; price?: number; priceGroup?: string; isBasic?: boolean }>>(kitsData);
            if (Array.isArray(list)) {
              setKits(list.map((k) => ({
                id: k.id,
                name: k.name || '',
                price: Number(k.price) || 0,
                priceGroup: k.priceGroup,
                isBasic: k.isBasic,
              })));
            }
          } catch {
            setKits([]);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Ошибка загрузки данных'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  return { models, rawModels, handles, limiters, architraves, kits, loading, error };
}

/**
 * Хук для загрузки деталей модели (покрытия, кромки, опции)
 */
/** Типы покрытия и цвета по типам для одной модели (из листа "Цвет") */
export interface ColorsByFinish {
  [coatingType: string]: Array<{ id: string; color_name: string; photo_path: string | null }>;
}

function applyFoundModel(
  foundModel: any,
  modelId: string,
  setModel: (m: DoorModel | null) => void,
  setCoatings: (c: DoorCoating[]) => void,
  setEdges: (e: DoorEdge[]) => void,
  setOptions: (o: DoorOption[]) => void,
  setFinishes: (f: string[]) => void,
  setColorsByFinish: (c: ColorsByFinish) => void
) {
  const formattedModel: DoorModel = {
    id: foundModel.modelKey || foundModel.model || modelId,
    model_name: foundModel.model || '',
    style: foundModel.style || '',
    suppliers: Array.isArray(foundModel.suppliers) ? foundModel.suppliers : [],
    photo: foundModel.photo ?? foundModel.photos?.cover ?? null,
    photos: foundModel.photos ?? { cover: foundModel.photo ?? null, gallery: [] },
    sizes: foundModel.products?.map((p: any) => ({
      width: Number(p.properties?.['Ширина/мм']) || 800,
      height: Number(p.properties?.['Высота/мм']) || 2000,
    })).filter((s: any) => s.width && s.height) || [],
    glassColors: Array.isArray(foundModel.glassColors) ? foundModel.glassColors : [],
    revers_available: foundModel.doorOptions?.revers_available ?? false,
    edge_in_base: foundModel.edge_in_base === true,
  };
  setModel(formattedModel);

  const coatingsMap = new Map<string, DoorCoating>();
  const edgesMap = new Map<string, DoorEdge>();

  if (foundModel.coatings && Array.isArray(foundModel.coatings) && foundModel.coatings.length > 0) {
    foundModel.coatings.forEach((c: { id?: string; coating_type?: string; color_name?: string; photo_path?: string | null }) => {
      const key = c.id || `${c.coating_type}_${c.color_name}`;
      coatingsMap.set(key, {
        id: key,
        coating_type: c.coating_type || '',
        color_name: c.color_name || '',
        photo_path: c.photo_path ?? null,
      });
    });
  } else {
    foundModel.products?.forEach((product: any) => {
      const props = product.properties || {};
      if (props['Тип покрытия'] && props['Цвет/Отделка']) {
        const coatingKey = `${props['Тип покрытия']}_${props['Цвет/Отделка']}`;
        if (!coatingsMap.has(coatingKey)) {
          coatingsMap.set(coatingKey, {
            id: coatingKey,
            coating_type: props['Тип покрытия'] || '',
            color_name: props['Цвет/Отделка'] || '',
            photo_path: null,
          });
        }
      }
    });
  }

  if (foundModel.edge_options && Array.isArray(foundModel.edge_options) && foundModel.edge_options.length > 0) {
    setEdges(foundModel.edge_options.map((e: { id: string; name: string; surcharge?: number }) => ({
      id: e.id,
      edge_color_name: e.name,
      surcharge: e.surcharge ?? 0,
      photo_path: null as string | null,
    })));
  } else {
    foundModel.products?.forEach((product: any) => {
      const props = product.properties || {};
      if (props['Кромка'] && props['Кромка'] !== '-' && props['Кромка'] !== '') {
        const edgeKey = props['Кромка'];
        if (!edgesMap.has(edgeKey)) {
          edgesMap.set(edgeKey, {
            id: edgeKey,
            edge_color_name: props['Кромка'] || '',
            surcharge: undefined,
            photo_path: null,
          });
        }
      }
    });
    setEdges(Array.from(edgesMap.values()));
  }

  setCoatings(Array.from(coatingsMap.values()));

  const doorOpts = foundModel.doorOptions;
  const optsList: DoorOption[] = [];
  if (doorOpts?.mirror_available) {
    optsList.push({ id: 'mirror_one', option_type: 'зеркало', option_name: 'Одна сторона', price_surcharge: doorOpts.mirror_one_rub || 0 });
    optsList.push({ id: 'mirror_both', option_type: 'зеркало', option_name: 'Две стороны', price_surcharge: doorOpts.mirror_both_rub || 0 });
  }
  if (doorOpts?.threshold_available) {
    optsList.push({ id: 'threshold', option_type: 'порог', option_name: 'Порог', price_surcharge: doorOpts.threshold_price_rub || 0 });
  }
  setOptions(optsList);

  const apiFinishes = foundModel.options?.finishes ?? (foundModel.colorsByFinish ? Object.keys(foundModel.colorsByFinish || {}).sort() : [...new Set(Array.from(coatingsMap.values()).map((c) => c.coating_type))].filter(Boolean).sort());
  setFinishes(apiFinishes);
  setColorsByFinish(
    foundModel.colorsByFinish || foundModel.options?.colorsByFinish || (() => {
      const byFinish: ColorsByFinish = {};
      coatingsMap.forEach((c) => {
        const t = c.coating_type || '';
        if (!t) return;
        if (!byFinish[t]) byFinish[t] = [];
        byFinish[t].push({ id: c.id, color_name: c.color_name, photo_path: c.photo_path ?? null });
      });
      return byFinish;
    })()
  );
}

export function useModelDetails(modelId: string | null, rawModels?: any[], selectedStyle?: string | null) {
  const [model, setModel] = useState<DoorModel | null>(null);
  const [coatings, setCoatings] = useState<DoorCoating[]>([]);
  const [finishes, setFinishes] = useState<string[]>([]);
  const [colorsByFinish, setColorsByFinish] = useState<ColorsByFinish>({});
  const [edges, setEdges] = useState<DoorEdge[]>([]);
  const [options, setOptions] = useState<DoorOption[]>([]);
  const [loading, setLoading] = useState(false);

  // Если есть rawModels и выбран modelId — берём данные из кэша. При нескольких записях с одним modelKey (разные стили) выбираем запись с style === selectedStyle.
  useEffect(() => {
    if (!modelId) {
      setModel(null);
      setCoatings([]);
      setFinishes([]);
      setColorsByFinish({});
      setEdges([]);
      setOptions([]);
      return;
    }
    if (rawModels && rawModels.length > 0) {
      const match = (m: any) => (m.modelKey || m.model) === modelId || m.model === modelId;
      const foundModel = selectedStyle
        ? rawModels.find((m: any) => match(m) && (m.style || '') === selectedStyle) ?? rawModels.find((m: any) => match(m))
        : rawModels.find((m: any) => match(m));
      if (foundModel) {
        setLoading(false);
        applyFoundModel(foundModel, modelId, setModel, setCoatings, setEdges, setOptions, setFinishes, setColorsByFinish);
        return;
      }
    }

    let cancelled = false;

    async function loadModelDetails() {
      try {
        setLoading(true);

        const refreshQ = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('refresh') === '1' ? '?refresh=1' : '';
        const response = await fetch('/api/catalog/doors/complete-data' + refreshQ, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const responseData = await response.json();
        const data = parseApiResponse<{ ok?: boolean; models: any[]; totalModels?: number; styles?: string[] }>(responseData);

        if (!cancelled && data && (data.ok !== false) && data.models && Array.isArray(data.models)) {
          const match = (m: any) => (m.modelKey || m.model) === modelId || m.model === modelId;
          const foundModel = selectedStyle
            ? data.models.find((m: any) => match(m) && (m.style || '') === selectedStyle) ?? data.models.find((m: any) => match(m))
            : data.models.find((m: any) => match(m));
          if (foundModel) {
            applyFoundModel(foundModel, modelId, setModel, setCoatings, setEdges, setOptions, setFinishes, setColorsByFinish);
          }
        }
      } catch (err) {
        console.error('Ошибка загрузки деталей модели:', err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadModelDetails();

    return () => {
      cancelled = true;
    };
  }, [modelId, rawModels, selectedStyle]);

  return { model, coatings, finishes, colorsByFinish, edges, options, loading };
}

/**
 * Интерфейс для параметров расчета цены
 */
export interface PriceCalculationParams {
  door_model_id?: string;
  style?: string;
  finish?: string;
  /** Название цвета (Цвет/Отделка) для точного подбора товара */
  color?: string;
  coating_id?: string;
  edge_id?: string;
  /** ID опций-товаров (наличники); зеркало/порог передаются отдельно mirror/threshold */
  option_ids?: string[];
  handle_id?: string;
  limiter_id?: string;
  width?: number;
  height?: number;
  /** Реверс двери — надбавка из опций модели */
  reversible?: boolean;
  /** Зеркало: 'none' | 'one' | 'both' (или 'mirror_one'/'mirror_both') — опция, не отдельная строка в корзине */
  mirror?: 'none' | 'one' | 'both' | 'mirror_one' | 'mirror_both';
  /** Порог — опция, не отдельная строка в корзине */
  threshold?: boolean;
  /** Наполнение (название из каталога: Голд, Сильвер и т.д.) — для подбора товара по цене */
  filling?: string;
  /** Комплект фурнитуры (отдельный товар в корзине) */
  hardware_kit_id?: string;
  /** Завертка к ручке — участвует в расчёте цены */
  backplate?: boolean;
  /** Поставщик выбранного наличника — фильтрует вариант двери для заказа (модель по коду может быть у нескольких поставщиков) */
  supplier?: string;
}

/** Вариант двери из БД для корзины/экспорта (без повторного поиска) */
export interface PriceDoorVariant {
  modelName: string;
  supplier: string;
  priceOpt: string | number;
  priceRrc: string | number;
  material: string;
  width: number | string;
  height: number | string;
  color: string;
  skuInternal: string;
  productId?: string;
  productSku?: string | null;
}

/**
 * Интерфейс результата расчета цены
 */
export interface PriceData {
  currency: string;
  base: number;
  breakdown: Array<{ label: string; amount: number }>;
  total: number;
  sku?: string;
  /** Название модели из БД (подмодель по текущим фильтрам) — в корзину и в экспорт Excel */
  model_name?: string | null;
  /** Все подходящие по фильтру варианты (подмодели) — в корзину/заказ/экспорт */
  matchingVariants?: PriceDoorVariant[];
}

/**
 * Хук для расчета цены
 */
export function usePriceCalculation() {
  const [calculating, setCalculating] = useState(false);
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const lastRequestIdRef = useRef(0);

  const calculate = useCallback(async (params: PriceCalculationParams) => {
    if (!params.door_model_id) {
      setPriceData(null);
      return;
    }

    const requestId = lastRequestIdRef.current + 1;
    lastRequestIdRef.current = requestId;

    try {
      setCalculating(true);

      // Преобразуем параметры в формат API (model = Код модели Domeo (Web))
      const selection: any = {
        model: params.door_model_id,
      };
      if (params.style) selection.style = params.style;
      if (params.finish) selection.finish = params.finish;
      if (params.color) selection.color = params.color;
      if (params.width) selection.width = params.width;
      if (params.height) selection.height = params.height;
      if (params.edge_id) selection.edge_id = params.edge_id;
      if (params.limiter_id) selection.limiter_id = params.limiter_id;
      if (params.option_ids?.length) selection.option_ids = params.option_ids;
      if (params.handle_id) selection.handle = { id: params.handle_id };
      if (params.hardware_kit_id) selection.hardware_kit = { id: params.hardware_kit_id };
      if (params.reversible !== undefined) selection.reversible = params.reversible;
      if (params.mirror !== undefined && params.mirror !== 'none') selection.mirror = params.mirror;
      if (params.threshold !== undefined) selection.threshold = params.threshold;
      if (params.filling) selection.filling = params.filling;
      if (params.backplate !== undefined) selection.backplate = params.backplate;
      if (params.supplier) selection.supplier = params.supplier;

      // Расчет цены - публичный endpoint
      const response = await fetch('/api/price/doors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ selection }),
      });

      // Игнорируем ответ, если уже запущен новый расчёт (смена модели и т.д.)
      if (requestId !== lastRequestIdRef.current) return;

      if (!response.ok) {
        setPriceData(null);
        if (process.env.NODE_ENV === 'development') {
          const errBody = await response.json().catch(() => ({}));
          console.warn('Расчет цены: товар не найден или ошибка', response.status, errBody);
        }
        return;
      }
      const responseData = await response.json();
      const data = parseApiResponse(responseData);

      if (requestId !== lastRequestIdRef.current) return;

      if (data && data.notFound) {
        setPriceData(null);
      } else if (data && data.total !== undefined) {
        setPriceData({
          currency: data.currency || 'RUB',
          base: data.base || 0,
          breakdown: data.breakdown || [],
          total: data.total || 0,
          sku: data.sku,
          model_name: data.model_name ?? undefined,
          matchingVariants: Array.isArray(data.matchingVariants) ? data.matchingVariants : undefined,
        });
      } else {
        setPriceData(null);
      }
    } catch (err) {
      if (requestId !== lastRequestIdRef.current) return;
      console.error('Ошибка расчета цены:', err);
      setPriceData(null);
    } finally {
      if (requestId === lastRequestIdRef.current) setCalculating(false);
    }
  }, []);

  const clearPrice = useCallback(() => {
    setPriceData(null);
  }, []);

  return { calculate, calculating, priceData, clearPrice };
}

