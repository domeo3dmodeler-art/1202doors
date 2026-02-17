/**
 * Кэш complete-data (модели дверей). Используется в API и при сбросе кэша.
 */
const completeDataCache = new Map<string, { data: unknown; timestamp: number }>();

export function getCompleteDataCache(): Map<string, { data: unknown; timestamp: number }> {
  return completeDataCache;
}

export function clearCompleteDataCache(): void {
  completeDataCache.clear();
}
