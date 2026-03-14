/**
 * Нагрузочный тест: 10 пользователей одновременно, активное использование.
 * Запросы: главная, complete-data, uploads (фото дверей).
 * Запуск: BASE_URL=http://178.154.244.83 npx tsx scripts/load-test-10-users.ts
 *        или: npx tsx scripts/load-test-10-users.ts  (по умолчанию localhost:3000)
 */
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const NUM_USERS = 10;
const DURATION_MS = 60 * 1000; // 1 минута активного использования
const UPLOAD_PATHS = [
  '/uploads/final-filled/doors/%D0%94%D0%B2%D0%B5%D1%80%D0%BD%D0%BE%D0%B5_%D0%BF%D0%BE%D0%BB%D0%BE%D1%82%D0%BD%D0%BE_Rimini_3_%D0%9F%D0%93_%D0%BA%D1%80._%D0%AD%D0%BC%D0%B0%D0%BB%D1%8C_%D0%91%D0%B5%D0%BB%D0%BE%D1%81%D0%BD%D0%B5%D0%B6%D0%BD%D1%8B%D0%B9_cover.png',
  '/uploads/final-filled/doors/%D0%94%D0%B2%D0%B5%D1%80%D0%BD%D0%BE%D0%B5_%D0%BF%D0%BE%D0%BB%D0%BE%D1%82%D0%BD%D0%BE_Rimini_10_%D0%9F%D0%93_%D0%BA%D1%80._%D0%AD%D0%BC%D0%B0%D0%BB%D1%8C_%D0%91%D0%B5%D0%BB%D0%BE%D1%81%D0%BD%D0%B5%D0%B6%D0%BD%D1%8B%D0%B9_cover.png',
  '/uploads/final-filled/doors/Pearl_6_%D0%91%D0%B5%D0%BB%D0%BE%D1%81%D0%BD%D0%B5%D0%B6%D0%BD%D1%8B%D0%B9.png',
  '/uploads/final-filled/doors/%D0%94%D0%B2%D0%B5%D1%80%D1%8C_Enika_1_%D0%94%D0%93_%D0%9F%D0%92%D0%A5_Emlayer_%D0%B1%D0%B5%D0%B6%D0%B5%D0%B2%D1%8B%D0%B9_cover.png',
  '/uploads/final-filled/doors/%D0%94%D0%B2%D0%B5%D1%80%D1%8C_Enika_6_%D0%94%D0%9E_%D0%9F%D0%92%D0%A5_Emlayer_%D0%B1%D0%B5%D0%B6%D0%B5%D0%B2%D1%8B%D0%B9_cover.png',
];

interface Stats {
  ok: number;
  err502: number;
  errOther: number;
  times: number[];
  /** Для диагностики: тип ошибки -> количество (и до N примеров URL/сообщения) */
  errorSamples: Map<string, { count: number; examples: string[] }>;
}

const MAX_SAMPLE_PER_TYPE = 5;

function recordError(stats: Stats, kind: string, detail: string): void {
  const key = kind;
  let entry = stats.errorSamples.get(key);
  if (!entry) {
    entry = { count: 0, examples: [] };
    stats.errorSamples.set(key, entry);
  }
  entry.count++;
  if (entry.examples.length < MAX_SAMPLE_PER_TYPE) {
    const ex = detail.length > 80 ? detail.slice(0, 77) + '...' : detail;
    if (!entry.examples.includes(ex)) entry.examples.push(ex);
  }
}

async function oneRequest(
  url: string,
  stats: Stats,
  pathLabel: string
): Promise<{ status: number; ms: number }> {
  const start = Date.now();
  try {
    const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(30000) });
    const ms = Date.now() - start;
    return { status: res.status, ms };
  } catch (e) {
    const ms = Date.now() - start;
    const err = e as Error;
    const msg = err.message || String(e);
    const name = (e as NodeJS.ErrnoException).code || err.name || 'Error';
    recordError(stats, `throw:${name}`, `${pathLabel} ${msg} (${ms}ms)`);
    const status = msg.includes('502') ? 502 : 0;
    return { status, ms };
  }
}

async function userLoop(userId: number, stats: Stats): Promise<void> {
  const until = Date.now() + DURATION_MS;
  while (Date.now() < until) {
    const r1 = await oneRequest(`${BASE_URL}/`, stats, 'GET /');
    if (r1.status === 200) stats.ok++;
    else if (r1.status === 502) stats.err502++;
    else {
      stats.errOther++;
      recordError(stats, `http:${r1.status}`, `GET / -> ${r1.status}`);
    }
    stats.times.push(r1.ms);

    const r2 = await oneRequest(`${BASE_URL}/api/catalog/doors/complete-data`, stats, 'GET complete-data');
    if (r2.status === 200) stats.ok++;
    else if (r2.status === 502) stats.err502++;
    else {
      stats.errOther++;
      recordError(stats, `http:${r2.status}`, `GET complete-data -> ${r2.status}`);
    }
    stats.times.push(r2.ms);

    for (const path of UPLOAD_PATHS) {
      const shortPath = path.length > 50 ? path.slice(0, 47) + '...' : path;
      const r = await oneRequest(`${BASE_URL}${path}`, stats, `GET ${shortPath}`);
      if (r.status === 200) stats.ok++;
      else if (r.status === 502) stats.err502++;
      else {
        stats.errOther++;
        recordError(stats, `http:${r.status}`, `GET uploads -> ${r.status}`);
      }
      stats.times.push(r.ms);
    }
  }
}

async function main(): Promise<void> {
  console.log(`Load test: ${NUM_USERS} users, ${DURATION_MS / 1000}s, ${BASE_URL}\n`);

  const stats: Stats = { ok: 0, err502: 0, errOther: 0, times: [], errorSamples: new Map() };
  const start = Date.now();
  await Promise.all(Array.from({ length: NUM_USERS }, (_, i) => userLoop(i, stats)));
  const elapsed = (Date.now() - start) / 1000;

  const total = stats.ok + stats.err502 + stats.errOther;
  const times = stats.times.length ? stats.times : [0];
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  console.log('--- Results ---');
  console.log(`Total requests: ${total}`);
  console.log(`200 OK: ${stats.ok}`);
  console.log(`502 Bad Gateway: ${stats.err502}`);
  console.log(`Other errors: ${stats.errOther}`);
  console.log(`Response time (ms): min=${min.toFixed(0)} avg=${avg.toFixed(0)} max=${max.toFixed(0)}`);
  console.log(`Duration: ${elapsed.toFixed(1)}s`);

  if (stats.errorSamples.size > 0) {
    console.log('\n--- Other errors breakdown ---');
    const sorted = [...stats.errorSamples.entries()].sort((a, b) => b[1].count - a[1].count);
    for (const [kind, { count, examples }] of sorted) {
      console.log(`  ${kind}: ${count}`);
      for (const ex of examples) console.log(`    ${ex}`);
    }
  }

  if (stats.err502 > 0) {
    process.exitCode = 1;
    console.log('\n[FAIL] 502 errors detected.');
  } else if (stats.errOther > 0) {
    console.log('\n[WARN] No 502, but other errors present (see breakdown above).');
  } else {
    console.log('\n[PASS] No errors.');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
