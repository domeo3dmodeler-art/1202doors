// Утилиты для компонентов дверей
import type { BasicState } from './types';

export const fmtInt = (n: number): string =>
  Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

export const fmt2 = (n: number): string => (Math.round(n * 100) / 100).toFixed(2);

export const uid = (): string => Math.random().toString(36).slice(2, 9);

export const hasBasic = (s: Partial<BasicState>): boolean =>
  !!(s.style && s.model && s.finish && s.color && s.width && s.height);

export const API: string | null =
  typeof window !== "undefined" ? ((window as any).__API_URL__ as string) : null;

export const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

// Функция для сброса зависимых параметров по иерархии
export const resetDependentParams = (currentSel: Partial<BasicState>, changedParam: keyof BasicState): Partial<BasicState> => {
  const newSel = { ...currentSel };
  
  switch (changedParam) {
    case 'style':
      // При смене стиля сбрасываем все зависимые параметры
      newSel.model = undefined;
      newSel.finish = undefined;
      newSel.color = undefined;
      newSel.width = undefined;
      newSel.height = undefined;
      // newSel.edge = undefined;
      // newSel.edge_note = undefined;
      newSel.hardware_kit = undefined;
      newSel.handle = undefined;
      break;
      
    case 'model':
      // При смене модели сбрасываем покрытие и все зависимые
      newSel.finish = undefined;
      newSel.color = undefined;
      newSel.width = undefined;
      newSel.height = undefined;
      // newSel.edge = undefined;
      // newSel.edge_note = undefined;
      newSel.hardware_kit = undefined;
      newSel.handle = undefined;
      break;
      
    case 'finish':
      // При смене покрытия сбрасываем цвет и все зависимые
      newSel.color = undefined;
      newSel.width = undefined;
      newSel.height = undefined;
      // newSel.edge = undefined;
      // newSel.edge_note = undefined;
      newSel.hardware_kit = undefined;
      newSel.handle = undefined;
      break;
      
    case 'color':
      // При смене цвета сбрасываем размеры и все зависимые
      newSel.width = undefined;
      newSel.height = undefined;
      // newSel.edge = undefined;
      // newSel.edge_note = undefined;
      newSel.hardware_kit = undefined;
      newSel.handle = undefined;
      break;
      
    case 'width':
    case 'height':
      // При смене размеров НЕ сбрасываем фурнитуру - она не зависит от размеров
      // newSel.edge = undefined;
      // newSel.edge_note = undefined;
      // newSel.hardware_kit = undefined;
      // newSel.handle = undefined;
      break;
      
    // case 'edge':
    //   // При смене кромки сбрасываем фурнитуру и стоимость
    //   newSel.edge_note = undefined;
    //   newSel.edge_cost = undefined;
    //   newSel.hardware_kit = undefined;
    //   newSel.handle = undefined;
    //   break;
      
    // type не влияет на другие параметры
    // hardware_kit и handle не влияют на другие параметры
  }
  
  return newSel;
};

export { formatModelName } from '@/lib/utils/format-model-name';

// DomeoDoors_Diamond_1 → DomeoDoors Diamond 1 (для карточек и превью)
export const formatModelNameForCard = (modelName: string): string => {
  if (!modelName || typeof modelName !== 'string') return '';
  return modelName.replace(/_/g, ' ').trim();
};

export const formatModelNameForPreview = (modelName: string): string => {
  if (!modelName || typeof modelName !== 'string') return '';
  return modelName.replace(/_/g, ' ').trim();
};

export const imageCandidates = (obj: { sku_1c?: string | number | null; model?: string | null }): string[] => {
  const sku = obj?.sku_1c != null ? String(obj.sku_1c).trim() : "";
  const enc = obj?.model ? encodeURIComponent(obj.model) : "";
  const slug = obj?.model ? slugify(obj.model) : "";
  const stems = [sku, enc, slug].filter(Boolean) as string[];
  const out: string[] = [];
  for (const stem of stems) {
    out.push(`/assets/doors/${stem}.jpg`, `/assets/doors/${stem}.png`);
  }
  return out;
};

// Безопасный поиск ручки по ID
export function findHandleById(handles: Record<string, import('./types').Handle[]>, handleId: string | undefined): import('./types').Handle | undefined {
  if (!handleId || !handles || typeof handles !== 'object') return undefined;
  try {
    const handlesArray = Object.values(handles).flat();
    if (!Array.isArray(handlesArray) || handlesArray.length === 0) return undefined;
    return handlesArray.find((h) => h && typeof h === 'object' && 'id' in h && h.id === handleId);
  } catch {
    return undefined;
  }
}

// Безопасный поиск комплекта фурнитуры по ID
export function findHardwareKitById(hardwareKits: import('./types').HardwareKit[], kitId: string | undefined): import('./types').HardwareKit | undefined {
  if (!kitId || !Array.isArray(hardwareKits) || hardwareKits.length === 0) return undefined;
  try {
    return hardwareKits.find((k) => k && typeof k === 'object' && 'id' in k && k.id === kitId);
  } catch {
    return undefined;
  }
}

