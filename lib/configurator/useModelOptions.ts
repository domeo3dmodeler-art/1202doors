'use client';

import { useState, useEffect, useCallback } from 'react';

export interface ModelOptionsData {
  revers_available: boolean;
  fillings: string[];
  widths: number[];
  heights: number[];
  finishes: string[];
  colorsByFinish: Record<string, string[]>;
  edges: string[];
  /** Кромка в базе по отфильтрованному набору (текущее покрытие/подмодель). Base 1 = 4 подмодели; при ПЭТ только одна, без кромки в базе. */
  edge_in_base: boolean;
  mirror_available: boolean;
  threshold_available: boolean;
  filteredCount: number;
}

const emptyOptions: ModelOptionsData = {
  revers_available: false,
  fillings: [],
  widths: [],
  heights: [],
  finishes: [],
  colorsByFinish: {},
  edges: [],
  edge_in_base: false,
  mirror_available: false,
  threshold_available: false,
  filteredCount: 0,
};

/**
 * Каскадные опции по выбранной модели и текущим фильтрам.
 * Опция доступна, если она есть хотя бы у одного товара в отфильтрованном наборе.
 */
export function useModelOptions(
  modelId: string | null,
  style: string | null,
  params: {
    reversible?: boolean;
    filling?: string | null;
    width?: number | null;
    height?: number | null;
    finish?: string | null;
    color?: string | null;
  }
): { data: ModelOptionsData; loading: boolean } {
  const [data, setData] = useState<ModelOptionsData>(emptyOptions);
  const [loading, setLoading] = useState(false);

  const fetchOptions = useCallback(async () => {
    if (!modelId || !modelId.trim()) {
      setData(emptyOptions);
      return;
    }

    setLoading(true);
    try {
      const searchParams = new URLSearchParams();
      searchParams.set('model', modelId);
      if (style) searchParams.set('style', style);
      if (params.reversible === true) searchParams.set('reversible', 'true');
      if (params.reversible === false) searchParams.set('reversible', 'false');
      if (params.filling) searchParams.set('filling', params.filling);
      if (params.width != null && params.width > 0) searchParams.set('width', String(params.width));
      if (params.height != null && params.height > 0) searchParams.set('height', String(params.height));
      if (params.finish) searchParams.set('finish', params.finish);
      if (params.color) searchParams.set('color', params.color);

      const res = await fetch(`/api/catalog/doors/model-options?${searchParams.toString()}`);
      if (!res.ok) {
        setData(emptyOptions);
        return;
      }
      const json = await res.json();
      const payload = json?.data ?? json;
      if (payload && typeof payload === 'object') {
        setData({
          revers_available: Boolean(payload.revers_available),
          fillings: Array.isArray(payload.fillings) ? payload.fillings : [],
          widths: Array.isArray(payload.widths) ? payload.widths : [],
          heights: Array.isArray(payload.heights) ? payload.heights : [],
          finishes: Array.isArray(payload.finishes) ? payload.finishes : [],
          colorsByFinish: payload.colorsByFinish && typeof payload.colorsByFinish === 'object' ? payload.colorsByFinish : {},
          edges: Array.isArray(payload.edges) ? payload.edges : [],
          edge_in_base: payload.edge_in_base !== undefined ? Boolean(payload.edge_in_base) : false,
          mirror_available: Boolean(payload.mirror_available),
          threshold_available: Boolean(payload.threshold_available),
          filteredCount: Number(payload.filteredCount) || 0,
        });
      } else {
        setData(emptyOptions);
      }
    } catch {
      setData(emptyOptions);
    } finally {
      setLoading(false);
    }
  }, [
    modelId,
    style,
    params.reversible,
    params.filling,
    params.width,
    params.height,
    params.finish,
    params.color,
  ]);

  useEffect(() => {
    fetchOptions();
  }, [fetchOptions]);

  return { data, loading };
}
