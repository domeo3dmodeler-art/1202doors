/**
 * Нагрузочный тест, приближённый к реальности: страница конфигуратора и все фото за ≤3 с.
 * 1) GET /api/catalog/doors/complete-data
 * 2) Собирает все URL фото из ответа (модели, покрытия, цвета)
 * 3) Загружает все фото параллельно (до 50 одновременных)
 * 4) Замер: время от старта до загрузки последнего фото.
 *
 * Запуск: BASE_URL=http://178.154.244.83 npx tsx scripts/load-test-photo-speed.ts
 */
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TARGET_MS = 3000;
const CONCURRENT_IMAGES = 50;

function collectPhotoUrls(data: { models?: unknown[] }): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();

  const add = (path: string | null | undefined) => {
    if (!path || typeof path !== 'string') return;
    const p = path.trim();
    if (!p.startsWith('/uploads/') && !p.startsWith('http')) return;
    const url = p.startsWith('http') ? p : `${BASE_URL}${p.startsWith('/') ? p : '/' + p}`;
    if (seen.has(url)) return;
    seen.add(url);
    urls.push(url);
  };

  const models = data.models as Array<{
    photo?: string | null;
    photos?: { cover?: string | null; gallery?: string[] };
    coatings?: Array<{ photo_path?: string | null }>;
    colorsByFinish?: Record<string, Array<{ photo_path?: string | null }>>;
  }> | undefined;

  if (!Array.isArray(models)) return urls;

  for (const m of models) {
    add(m.photo);
    add(m.photos?.cover);
    if (Array.isArray(m.photos?.gallery)) m.photos.gallery.forEach(add);
    if (Array.isArray(m.coatings)) {
      for (const c of m.coatings) add(c.photo_path);
    }
    if (m.colorsByFinish && typeof m.colorsByFinish === 'object') {
      for (const arr of Object.values(m.colorsByFinish)) {
        if (Array.isArray(arr)) for (const c of arr) add(c.photo_path);
      }
    }
  }
  return urls;
}

async function fetchWithTiming(url: string): Promise<{ ok: boolean; ms: number }> {
  const start = Date.now();
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(15000) });
    const ms = Date.now() - start;
    return { ok: res.ok, ms };
  } catch {
    return { ok: false, ms: Date.now() - start };
  }
}

async function runParallel<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = index++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

async function main(): Promise<void> {
  console.log(`Photo speed test: complete-data + all images ≤${TARGET_MS}ms, ${BASE_URL}\n`);

  const t0 = Date.now();

  const res = await fetch(`${BASE_URL}/api/catalog/doors/complete-data`, { signal: AbortSignal.timeout(60000) });
  if (!res.ok) {
    console.error(`complete-data failed: ${res.status}`);
    process.exit(1);
  }
  const data = await res.json();
  const dataMs = Date.now() - t0;

  let urls = collectPhotoUrls(data);
  if (urls.length === 0) {
    const fallback = [
      '/uploads/final-filled/doors/%D0%94%D0%B2%D0%B5%D1%80%D0%BD%D0%BE%D0%B5_%D0%BF%D0%BE%D0%BB%D0%BE%D1%82%D0%BD%D0%BE_Rimini_3_%D0%9F%D0%93_%D0%BA%D1%80._%D0%AD%D0%BC%D0%B0%D0%BB%D1%8C_%D0%91%D0%B5%D0%BB%D0%BE%D1%81%D0%BD%D0%B5%D0%B6%D0%BD%D1%8B%D0%B9_cover.png',
      '/uploads/final-filled/doors/Pearl_6_%D0%91%D0%B5%D0%BB%D0%BE%D1%81%D0%BD%D0%B5%D0%B6%D0%BD%D1%8B%D0%B9.png',
    ];
    urls = fallback.map((p) => `${BASE_URL}${p}`);
    console.log(`complete-data: ${dataMs}ms, models: 0, using ${urls.length} fallback image URLs`);
  } else {
    console.log(`complete-data: ${dataMs}ms, models: ${(data.models ?? []).length}, image URLs: ${urls.length}`);
  }

  const loadStart = Date.now();
  const outcomes = await runParallel(urls, CONCURRENT_IMAGES, fetchWithTiming);
  const loadEnd = Date.now();
  const totalMs = loadEnd - t0;
  const loadMs = loadEnd - loadStart;

  const ok = outcomes.filter((o) => o.ok).length;
  const fail = outcomes.length - ok;
  const times = outcomes.map((o) => o.ms).filter((m) => m > 0);
  const p50 = times.length ? times.sort((a, b) => a - b)[Math.floor(times.length * 0.5)] ?? 0 : 0;
  const p95 = times.length ? times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)] ?? 0 : 0;

  console.log(`\n--- Results ---`);
  console.log(`Total time (doc + data + all images): ${totalMs}ms`);
  console.log(`Images load window: ${loadMs}ms`);
  console.log(`Images: ${ok} OK, ${fail} failed`);
  console.log(`Latency (ms): p50=${p50} p95=${p95}`);

  if (totalMs <= TARGET_MS && fail === 0) {
    console.log(`\n[PASS] Page + all photos loaded in ≤${TARGET_MS}ms, no failures.`);
  } else {
    if (totalMs > TARGET_MS) console.log(`\n[FAIL] Total time ${totalMs}ms > ${TARGET_MS}ms target.`);
    if (fail > 0) console.log(`[FAIL] ${fail} image(s) failed to load.`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
