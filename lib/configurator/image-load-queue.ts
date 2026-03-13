/**
 * Очередь загрузки картинок: ограничение числа одновременных запросов к /uploads/.
 * Поддерживает отмену (cancel) — обязательна для предотвращения утечки слотов при unmount.
 */
const MAX_CONCURRENT = 20;
let inFlight = 0;

interface QueueEntry {
  cb: (release: () => void) => void;
  cancelled: boolean;
}

const queue: QueueEntry[] = [];

function processQueue(): void {
  while (queue.length > 0 && inFlight < MAX_CONCURRENT) {
    const entry = queue.shift()!;
    if (entry.cancelled) continue;
    inFlight++;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      inFlight = Math.max(0, inFlight - 1);
      processQueue();
    };
    try {
      entry.cb(release);
    } catch {
      release();
    }
  }
}

/**
 * Добавить загрузку в очередь. Возвращает функцию отмены.
 * При вызове cancel():
 * - если запись ещё в очереди — помечается cancelled, слот не занимается
 * - если слот уже выдан — ничего (release() должен вызвать ThrottledImage)
 */
export function enqueueImageLoad(callback: (release: () => void) => void): () => void {
  const entry: QueueEntry = { cb: callback, cancelled: false };
  queue.push(entry);
  processQueue();
  return () => { entry.cancelled = true; };
}

export function isUploadsPath(src: string | null | undefined): boolean {
  if (!src || typeof src !== 'string') return false;
  const t = src.trim();
  return t.startsWith('/uploads/') || t.startsWith('/api/uploads/');
}
