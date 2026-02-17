/**
 * Маппинг «код модели» → «название модели» для подбора фото.
 * Используется в match-propertyvalue-to-door-photo.ts: по коду подставляется
 * правильное название модели при поиске файла (Дверное_полотно_..._cover.png).
 *
 * Источник: файл сопоставления кодов и моделей (Excel/CSV), загружается в
 * scripts/output/code-to-model-photo-mapping.json.
 * Формат JSON: { "Код": "Название модели" } или { "Код": ["Название1", "Название2"] }
 */

import * as path from 'path';
import * as fs from 'fs';

const MAPPING_PATH = path.join(process.cwd(), 'scripts', 'output', 'code-to-model-photo-mapping.json');

export type CodeToModelMapping = Record<string, string | string[]>;

let cached: Map<string, string[]> | null = null;

/**
 * Загружает маппинг из JSON. Для каждого кода возвращает массив названий моделей (первое — основное).
 * Пустой Map, если файла нет или он пустой.
 */
export function getCodeToModelPhotoMapping(): Map<string, string[]> {
  if (cached !== null) return cached;
  cached = new Map();
  try {
    if (!fs.existsSync(MAPPING_PATH)) return cached;
    const raw = fs.readFileSync(MAPPING_PATH, 'utf8');
    const data = JSON.parse(raw) as CodeToModelMapping;
    for (const [code, value] of Object.entries(data)) {
      const codeTrim = String(code ?? '').trim();
      if (!codeTrim) continue;
      const names = Array.isArray(value) ? value.map((v) => String(v).trim()).filter(Boolean) : [String(value ?? '').trim()].filter(Boolean);
      if (names.length) cached.set(codeTrim, names);
    }
  } catch {
    // ignore
  }
  return cached;
}

/**
 * Сброс кэша (например после обновления JSON).
 */
export function clearCodeToModelPhotoMappingCache(): void {
  cached = null;
}
