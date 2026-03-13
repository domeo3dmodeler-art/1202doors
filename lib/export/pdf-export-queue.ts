/**
 * Очередь экспорта PDF: ограничение числа одновременных запусков Chrome (Puppeteer)
 * для снижения риска OOM и 502 на малопамятных ВМ.
 *
 * Максимум 2 экспорта одновременно (настраивается через PUPPETEER_MAX_CONCURRENT_PDF).
 * Остальные запросы ждут в очереди; таймаут ожидания — 5 минут.
 */

import { logger } from '@/lib/logging/logger';

const DEFAULT_MAX_CONCURRENT = 2;
const DEFAULT_QUEUE_TIMEOUT_MS = 5 * 60 * 1000; // 5 минут

function getMaxConcurrent(): number {
  const env = process.env.PUPPETEER_MAX_CONCURRENT_PDF;
  if (env === undefined || env === '') return DEFAULT_MAX_CONCURRENT;
  const n = parseInt(env, 10);
  if (Number.isNaN(n) || n < 1) return DEFAULT_MAX_CONCURRENT;
  return Math.min(n, 5); // не более 5
}

function getQueueTimeoutMs(): number {
  const env = process.env.PUPPETEER_QUEUE_TIMEOUT_MS;
  if (env === undefined || env === '') return DEFAULT_QUEUE_TIMEOUT_MS;
  const n = parseInt(env, 10);
  if (Number.isNaN(n) || n < 10000) return DEFAULT_QUEUE_TIMEOUT_MS;
  return n;
}

let currentRunning = 0;
const waitQueue: Array<() => void> = [];

function release(): void {
  currentRunning--;
  if (waitQueue.length > 0) {
    const next = waitQueue.shift()!;
    next();
  }
}

/**
 * Выполняет функцию в слоте очереди PDF-экспорта.
 * Если слотов нет — ждёт освобождения (до timeoutMs), затем выполняет.
 * @throws Error с текстом про таймаут очереди, если не удалось войти в слот за timeoutMs
 */
export async function runInPdfQueue<T>(fn: () => Promise<T>): Promise<T> {
  const maxConcurrent = getMaxConcurrent();
  const timeoutMs = getQueueTimeoutMs();

  const acquire = (): Promise<void> => {
    if (currentRunning < maxConcurrent) {
      currentRunning++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const idx = waitQueue.indexOf(onRun);
        if (idx !== -1) waitQueue.splice(idx, 1);
        logger.warn('PDF export queue timeout', 'pdf-export-queue', {
          queueLength: waitQueue.length,
          currentRunning,
          timeoutMs,
        });
        reject(new Error('Сервер занят экспортом PDF. Попробуйте через минуту.'));
      }, timeoutMs);

      const onRun = (): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        currentRunning++;
        resolve();
      };
      waitQueue.push(onRun);
    });
  };

  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

export function getPdfQueueStats(): { currentRunning: number; queueLength: number; maxConcurrent: number } {
  return {
    currentRunning,
    queueLength: waitQueue.length,
    maxConcurrent: getMaxConcurrent(),
  };
}
