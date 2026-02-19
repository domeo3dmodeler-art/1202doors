/**
 * Проход по final_filled 30.01.xlsx: скачивание всех фото по ссылкам из каждой вкладки
 * и привязка путей к товарам в БД (ProductImage, PropertyPhoto).
 *
 * Вкладки и столбцы с фото:
 *   Наличники          — «Наличник: Фото (ссылка)»
 *   Цвет               — «Ссылка на обложку», «Ссылки на галерею (через ;)»
 *   04 Ручки Завертки  — «Фото (ссылка)», «Фото завертки (ссылка)»
 *   05 Ограничители    — «Фото (путь)»
 *
 * Запуск:
 *   npx tsx scripts/download-and-bind-photos-from-final-filled.ts
 *
 * Опции:
 *   --dry-run          только показать ссылки и привязки, не качать и не писать в БД
 *   --skip-download    не качать, только привязать (по уже лежащим в out-dir файлам + Excel)
 *   --bind-only        то же что --skip-download: привязка по существующим файлам, без скачивания
 *   --skip-sheets=LIST не качать/не привязывать эти вкладки (через запятую)
 *   --no-nalichniki    не качать Наличники (они уже собраны)
 *   --token=TOKEN      OAuth-токен Яндекс.Диска (иначе берётся из YANDEX_DISK_TOKEN в .env)
 *   --out-dir=DIR      папка для сохранения (по умолчанию public/uploads/final-filled)
 *   --file=PATH        путь к xlsx (по умолчанию 1002/final_filled 30.01.xlsx)
 *   --entries-json=PATH  взять записи из JSON (например scripts/photo-entries.json от collect-photo-entries.ts)
 *   --wait-login       пауза 60 сек после открытия браузера (успеете войти в Яндекс)
 *   --headed           открыть окно браузера (по умолчанию)
 *   --headless         без окна браузера
 *
 * Без токена: для ссылок disk.360.yandex.ru скрипт открывает каждую страницу в браузере
 * (puppeteer-extra + stealth), забирает URL картинки со страницы и скачивает её.
 * При --wait-login: откроется окно браузера — при появлении «Я не робот» пройдите проверку
 * вручную в этом окне в течение 60 сек. Фото берутся приоритетно из ссылок «Скачать», затем
 * самые большие img на странице. С токеном YANDEX_DISK_TOKEN — скачивание через Cloud API.
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';
import * as https from 'https';
import * as http from 'http';
import { DOOR_COLOR_PROPERTY, upsertPropertyPhoto } from '../lib/property-photos';

const prisma = new PrismaClient();
const YANDEX_API = 'https://cloud-api.yandex.net/v1/disk';

const FILE_PATH_DEFAULT = path.join(__dirname, '..', '1002', 'final_filled 30.01.xlsx');
const IDS_PATH = path.join(__dirname, 'catalog-tree-ids.json');
const OUT_DIR_DEFAULT = path.join(__dirname, '..', 'public', 'uploads', 'final-filled');

function getColumn(row: Record<string, unknown>, logicalName: string): string {
  const need = logicalName.replace(/\s+/g, ' ').trim();
  for (const k of Object.keys(row)) {
    if (k.replace(/\s+/g, ' ').trim() === need) return String(row[k] ?? '').trim();
  }
  return String(row[logicalName] ?? '').trim();
}

function slug(str: string): string {
  return String(str)
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\wа-яё_-]/gi, '')
    .slice(0, 80) || 'item';
}

function safeDirName(str: string): string {
  return String(str).replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').slice(0, 120) || 'item';
}

function isHttpUrl(s: string): boolean {
  const t = s.trim();
  return t.startsWith('http://') || t.startsWith('https://');
}

/** Ссылка на страницу просмотра/файл Яндекс.Диска (360) — по GET вернётся HTML. */
function isYandexDiskPageUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.includes('yandex') && (h.includes('360') || h.includes('disk'));
  } catch {
    return false;
  }
}

/** Из ссылки вида disk.360.yandex.ru/...?idDialog=%2Fdisk%2F... извлекаем путь на диске. */
function parsePathFromPageUrl(url: string): string | null {
  try {
    const u = new URL(url);
    let rawPath = '';
    const idDialog = u.searchParams.get('idDialog');
    if (idDialog) {
      let decoded = decodeURIComponent(idDialog);
      if (decoded.includes('%')) decoded = decodeURIComponent(decoded);
      rawPath = decoded.startsWith('/disk/') ? decoded.slice(6) : decoded.replace(/^\//, '');
    } else {
      const pathMatch = url.match(/\/client\/disk\/([^?]+)/);
      if (pathMatch) rawPath = decodeURIComponent(pathMatch[1].replace(/%2F/g, '/'));
    }
    if (!rawPath) return null;
    const normalized = rawPath.replace(/\/+/g, '/').replace(/^\//, '').trim();
    return normalized || null;
  } catch {
    return null;
  }
}

function yandexApiRequest(token: string, method: string, pathname: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(YANDEX_API + pathname);
    const opts: https.RequestOptions = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method,
      headers: { Authorization: `OAuth ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    };
    const req = https.request(opts, (res) => {
      let body = '';
      res.on('data', (ch) => (body += ch));
      res.on('end', () => resolve({ status: res.statusCode || 0, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

/** Получить прямую ссылку на скачивание по пути на диске (нужен YANDEX_DISK_TOKEN). */
async function getYandexDownloadLink(
  token: string,
  diskFilePath: string,
  logError?: (msg: string) => void
): Promise<string | null> {
  const pathForApi = diskFilePath.startsWith('disk:') ? diskFilePath : 'disk:/' + diskFilePath.replace(/^\//, '');
  const encoded = encodeURIComponent(pathForApi);
  const { status, body } = await yandexApiRequest(token, 'GET', `/resources/download?path=${encoded}`);
  if (status !== 200) {
    if (logError) logError(`API ${status}: ${body.slice(0, 200)}`);
    return null;
  }
  try {
    const data = JSON.parse(body);
    return data.href || null;
  } catch {
    return null;
  }
}

/** Из страницы 360 Яндекс.Диска достать URL картинки. Приоритет: ссылки на скачивание, затем самые большие img. */
function extractImageUrlFromYandexPage(): string[] {
  const seen = new Set<string>();
  const candidates: { url: string; size: number; isDownload: boolean }[] = [];

  document.querySelectorAll('a[href]').forEach((a) => {
    const href = (a as HTMLAnchorElement).href || '';
    if (!href || seen.has(href)) return;
    try {
      const u = new URL(href);
      const isYandex = u.hostname.includes('yandex') || u.hostname.includes('yadi.sk');
      const looksLikeFile = /\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i.test(u.pathname + u.search);
      if (isYandex && (looksLikeFile || u.pathname.includes('download') || u.pathname.includes('get'))) {
        seen.add(href);
        candidates.push({ url: href, size: 999999999, isDownload: true });
      }
    } catch {}
  });

  document.querySelectorAll('img[src]').forEach((img) => {
    const el = img as HTMLImageElement;
    let src = el.src || '';
    if (!src || src.startsWith('data:') || seen.has(src)) return;
    try {
      const u = new URL(src);
      if (
        u.hostname.includes('yandex') ||
        u.hostname.includes('avatars') ||
        u.hostname.includes('storage.yandex')
      ) {
        u.searchParams.delete('size');
        u.searchParams.delete('width');
        u.searchParams.delete('height');
        const s = u.toString();
        if (seen.has(s)) return;
        seen.add(s);
        const w = (el.naturalWidth || el.width || 0) || 300;
        const h = (el.naturalHeight || el.height || 0) || 300;
        candidates.push({ url: s, size: w * h, isDownload: false });
      }
    } catch {}
  });

  candidates.sort((a, b) => {
    if (a.isDownload && !b.isDownload) return -1;
    if (!a.isDownload && b.isDownload) return 1;
    return b.size - a.size;
  });
  return candidates.map((c) => c.url);
}

/** Скачать страницу Яндекс.Диска через браузер: открыть страницу, взять URL картинки, скачать. */
async function downloadYandexViaBrowser(
  page: { goto: (url: string, opts?: { waitUntil?: string; timeout?: number }) => Promise<{ buffer: () => Promise<Buffer> } | null>; evaluate: <T>(fn: () => T) => Promise<T> },
  pageUrl: string,
  destPath: string
): Promise<string | null> {
  try {
    const gotoOpts = { waitUntil: 'domcontentloaded' as const, timeout: 60000 };
    await page.goto(pageUrl, gotoOpts).catch(() => null);
    await new Promise((r) => setTimeout(r, 2000));
    const imageUrls = await page.evaluate(extractImageUrlFromYandexPage);
    const imageUrl = imageUrls.length > 0 ? imageUrls[0] : null;
    if (!imageUrl) return null;
    const res = await page.goto(imageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    if (!res) return null;
    const ct = (res.headers()['content-type'] || '').toLowerCase();
    if (!ct.includes('image/')) return null;
    const buf = await res.buffer();
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(destPath, buf);
    return destPath;
  } catch {
    return null;
  }
}

/** Скачать URL в файл. Возвращает путь при успехе, null если ответ не изображение или ошибка. */
function downloadToFile(url: string, destPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const u = new URL(url);
    const protocol = u.protocol === 'https:' ? https : http;
    const req = protocol.get(
      url,
      { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DomeoDownload/1.0)' }, maxRedirects: 5 },
      (res) => {
        const code = res.statusCode || 0;
        if (code === 301 || code === 302) {
          const loc = res.headers.location;
          if (loc) return downloadToFile(loc, destPath).then(resolve);
        }
        const ct = (res.headers['content-type'] || '').toLowerCase();
        if (!ct.includes('image/')) {
          resolve(null);
          return;
        }
        const dir = path.dirname(destPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const file = fs.createWriteStream(destPath);
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(destPath);
        });
        file.on('error', () => {
          fs.unlink(destPath, () => {});
          resolve(null);
        });
      }
    );
    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

function getExtFromUrl(url: string): string {
  try {
    const u = new URL(url);
    let p = u.pathname;
    const idDialog = u.searchParams.get('idDialog');
    if (idDialog) p = decodeURIComponent(idDialog);
    const m = p.match(/\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i);
    if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  } catch {}
  return 'jpg';
}

interface PhotoEntry {
  sheet: string;
  productKey: string;
  photoType: string;
  url: string;
  /** для Цвет: propertyValue = modelName|coatingType|colorName */
  propertyValue?: string;
}

function collectPhotoEntries(workbook: XLSX.WorkBook): PhotoEntry[] {
  const entries: PhotoEntry[] = [];
  const toJson = (sheetName: string) => {
    const ws = workbook.Sheets[sheetName];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '', raw: false });
  };

  // Наличники
  for (const row of toJson('Наличники')) {
    const name = getColumn(row, 'Наличник: Название');
    const photoUrl = String(row['Наличник: Фото (ссылка)'] ?? '').trim();
    if (!name || !photoUrl || !isHttpUrl(photoUrl)) continue;
    entries.push({ sheet: 'Наличники', productKey: `nal_${slug(name)}`, photoType: 'cover', url: photoUrl });
  }

  // Цвет: обложка и галерея
  for (const row of toJson('Цвет')) {
    const modelName = getColumn(row, 'Название модели');
    const coatingType = String(row['Тип покрытия'] ?? '').trim();
    const colorName = String(row['Цвет/отделка'] ?? '').trim();
    const propertyValue = `${modelName}|${coatingType}|${colorName}`;
    const coverUrl = String(row['Ссылка на обложку'] ?? '').trim();
    if (coverUrl && isHttpUrl(coverUrl)) {
      entries.push({ sheet: 'Цвет', productKey: propertyValue, photoType: 'cover', url: coverUrl, propertyValue });
    }
    const galleryStr = String(row['Ссылки на галерею (через ;)'] ?? '').trim();
    const galleryUrls = galleryStr ? galleryStr.split(';').map((s: string) => s.trim()).filter(isHttpUrl) : [];
    galleryUrls.forEach((url, i) => {
      entries.push({ sheet: 'Цвет', productKey: propertyValue, photoType: `gallery_${i + 1}`, url, propertyValue });
    });
  }

  // Ручки
  for (const row of toJson('04 Ручки Завертки')) {
    const name = String(row['Название (Domeo_наименование для Web)'] ?? '').trim();
    if (!name) continue;
    const key = `handle_${slug(name)}`;
    const photoUrl = String(row['Фото (ссылка)'] ?? '').trim();
    if (photoUrl && isHttpUrl(photoUrl)) entries.push({ sheet: '04 Ручки Завертки', productKey: key, photoType: 'main', url: photoUrl });
    const photoZav = String(row['Фото завертки (ссылка)'] ?? '').trim();
    if (photoZav && isHttpUrl(photoZav)) entries.push({ sheet: '04 Ручки Завертки', productKey: key, photoType: 'zaverтка', url: photoZav });
  }

  // Ограничители
  for (const row of toJson('05 Ограничители')) {
    const name = String(row['Название'] ?? '').trim();
    const photoUrl = String(row['Фото (путь)'] ?? '').trim();
    if (!name || !photoUrl || !isHttpUrl(photoUrl)) continue;
    entries.push({ sheet: '05 Ограничители', productKey: `lim_${slug(name)}`, photoType: 'cover', url: photoUrl });
  }

  return entries;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const skipDownload = process.argv.includes('--skip-download') || process.argv.includes('--bind-only');
  const waitLogin = process.argv.includes('--wait-login');
  const headless = process.argv.includes('--headless');
  const fileArg = process.argv.find((a) => a.startsWith('--file='));
  const outDirArg = process.argv.find((a) => a.startsWith('--out-dir='));
  const entriesJsonArg = process.argv.find((a) => a.startsWith('--entries-json='));
  const skipSheetsArg = process.argv.find((a) => a.startsWith('--skip-sheets='));
  const noNalichniki = process.argv.includes('--no-nalichniki');
  const skipSheets = new Set<string>(
    skipSheetsArg ? skipSheetsArg.slice('--skip-sheets='.length).trim().split(',').map((s) => s.trim()).filter(Boolean) : []
  );
  if (noNalichniki) skipSheets.add('Наличники');
  const outDir = outDirArg ? path.resolve(outDirArg.slice('--out-dir='.length).trim()) : OUT_DIR_DEFAULT;

  let entries: PhotoEntry[];
  if (entriesJsonArg) {
    const jsonPath = path.resolve(entriesJsonArg.slice('--entries-json='.length).trim());
    if (!fs.existsSync(jsonPath)) {
      console.error('Файл не найден:', jsonPath);
      process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    entries = Array.isArray(data.entries) ? data.entries : data;
    if (skipSheets.size) {
      const before = entries.length;
      entries = entries.filter((e: PhotoEntry) => !skipSheets.has(e.sheet));
      console.log('Загружено из JSON:', entries.length, '(исключено по --skip-sheets:', before - entries.length, ')');
    } else {
      console.log('Загружено записей из JSON:', entries.length);
    }
  } else {
    const filePath = fileArg ? path.resolve(fileArg.slice('--file='.length).trim()) : FILE_PATH_DEFAULT;
    if (!fs.existsSync(filePath)) {
      console.error('Файл не найден:', filePath);
      process.exit(1);
    }
    const workbook = XLSX.readFile(filePath, { cellDates: true, raw: false });
    entries = collectPhotoEntries(workbook);
    console.log('Найдено записей с фото:', entries.length);
  }

  if (skipSheets.size) {
    const before = entries.length;
    entries = entries.filter((e) => !skipSheets.has(e.sheet));
    console.log('После --skip-sheets=' + [...skipSheets].join(',') + ': записей', entries.length, '(исключено', before - entries.length, ')');
  }

  const urlToLocalPath = new Map<string, string>();

  // Всегда: по уже лежащим файлам заполняем urlToLocalPath, чтобы не скачивать лишнее
  if (fs.existsSync(outDir)) {
    for (const e of entries) {
      if (urlToLocalPath.has(e.url)) continue;
      const ext = getExtFromUrl(e.url);
      const subDir = safeDirName(e.sheet);
      const baseName = safeDirName(e.productKey) + '_' + e.photoType + (ext ? '.' + ext : '.jpg');
      const relPath = path.join(subDir, baseName);
      const destPath = path.join(outDir, relPath);
      if (fs.existsSync(destPath)) {
        urlToLocalPath.set(e.url, '/uploads/final-filled/' + relPath.replace(/\\/g, '/'));
      }
    }
    console.log('Уже на диске (пропускаем):', urlToLocalPath.size);
  }

  const entriesToDownload = entries.filter((e) => !urlToLocalPath.has(e.url));
  const bySheet: Record<string, number> = {};
  for (const e of entriesToDownload) {
    bySheet[e.sheet] = (bySheet[e.sheet] ?? 0) + 1;
  }
  console.log('Осталось скачать:', entriesToDownload.length, bySheet);
  if (entriesToDownload.length > 0 && entriesToDownload.length <= 20) {
    for (const e of entriesToDownload) {
      const ext = getExtFromUrl(e.url);
      const subDir = safeDirName(e.sheet);
      const baseName = safeDirName(e.productKey) + '_' + e.photoType + (ext ? '.' + ext : '.jpg');
      console.log('  —', path.join(subDir, baseName));
    }
  }

  const tokenArg = process.argv.find((a) => a.startsWith('--token='));
  const yandexToken = (tokenArg ? tokenArg.slice('--token='.length).trim() : process.env.YANDEX_DISK_TOKEN?.trim()) || undefined;
  const hasYandexUrlsToDownload = entriesToDownload.some((e) => isYandexDiskPageUrl(e.url));
  const useBrowser = hasYandexUrlsToDownload && !yandexToken;
  if (!skipDownload && !dryRun && entriesToDownload.length > 0 && hasYandexUrlsToDownload && !yandexToken) {
    console.error('Недостающие фото с Яндекс.Диска (disk.360). Добавьте в .env.local строку:');
    console.error('  YANDEX_DISK_TOKEN=ваш_токен');
    console.error('Токен: https://oauth.yandex.ru → выдать права «Яндекс.Диск» → скопировать.');
    process.exit(1);
  }

  if (!skipDownload && !dryRun && entriesToDownload.length > 0 && yandexToken && hasYandexUrlsToDownload) {
    const { status } = await yandexApiRequest(yandexToken, 'GET', '/');
    if (status !== 200) {
      console.error('YANDEX_DISK_TOKEN: API вернул', status, '- проверьте токен на https://oauth.yandex.ru');
      process.exit(1);
    }
    console.log('Токен Яндекс.Диска проверен, скачивание через API.');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let browser: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let page: any = null;

  let apiErrorLogCount = 0;
  const logApiError = (msg: string) => {
    if (apiErrorLogCount++ < 5) console.error('  ', msg);
  };

  if (!skipDownload && !dryRun && entriesToDownload.length > 0) {
    fs.mkdirSync(outDir, { recursive: true });
    if (useBrowser) {
      const puppeteer = await import('puppeteer-core');
      const { getPuppeteerExecutablePath, DEFAULT_PUPPETEER_ARGS } = await import('../lib/export/puppeteer-executable');
      browser = await puppeteer.default.launch({
        executablePath: getPuppeteerExecutablePath(),
        headless,
        defaultViewport: { width: 1280, height: 800 },
        args: [...DEFAULT_PUPPETEER_ARGS, '--disable-blink-features=AutomationControlled'],
      });
      page = await browser.newPage();
      await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
      );
      const firstYandex = entriesToDownload.find((e) => isYandexDiskPageUrl(e.url))?.url;
      if (firstYandex && waitLogin) {
        console.log('Открываю первую ссылку — войдите в аккаунт Яндекс при необходимости. Ожидание 90 сек загрузки + 60 сек на вход...');
        await page.goto(firstYandex, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch(() => {});
        await new Promise((r) => setTimeout(r, 60000));
      }
    }

    let done = 0;
    for (const e of entriesToDownload) {
      const ext = getExtFromUrl(e.url);
      const subDir = safeDirName(e.sheet);
      const baseName = safeDirName(e.productKey) + '_' + e.photoType + (ext ? '.' + ext : '.jpg');
      const relPath = path.join(subDir, baseName);
      const destPath = path.join(outDir, relPath);
      const localPathStr = '/uploads/final-filled/' + relPath.replace(/\\/g, '/');
      process.stdout.write(`[${++done}/${entriesToDownload.length}] ${e.sheet} ${e.photoType} ... `);

      let result: string | null = null;
      if (isYandexDiskPageUrl(e.url)) {
        if (yandexToken) {
          const diskPath = parsePathFromPageUrl(e.url);
          if (diskPath) {
            const direct = await getYandexDownloadLink(yandexToken, diskPath, logApiError);
            if (direct) result = await downloadToFile(direct, destPath);
          } else if (apiErrorLogCount < 5) logApiError('parsePathFromPageUrl вернул null для ' + e.url.slice(0, 60) + '...');
        } else if (page) {
          for (let attempt = 0; attempt < 2 && !result; attempt++) {
            try {
              result = await downloadYandexViaBrowser(page, e.url, destPath);
            } catch (err) {
              if (attempt === 0) await new Promise((r) => setTimeout(r, 1000));
            }
          }
        }
      }
      if (!result) result = await downloadToFile(e.url, destPath);

      if (result) {
        urlToLocalPath.set(e.url, '/uploads/final-filled/' + relPath.replace(/\\/g, '/'));
        console.log('OK');
      } else {
        console.log('skip (не изображение или ошибка)');
      }
      await new Promise((r) => setTimeout(r, 300));
    }

    if (browser) await browser.close();
    console.log('Всего с путём (уже было + скачано):', urlToLocalPath.size);
  } else if (!skipDownload && !dryRun && entriesToDownload.length === 0) {
    console.log('Недостающих фото нет — скачивание не требуется.');
  }

  // Один URL — один файл на диске, но несколько товаров с разными путями: копируем в все ожидаемые пути
  if (!dryRun && urlToLocalPath.size > 0 && fs.existsSync(outDir)) {
    const publicDir = path.join(outDir, '..', '..');
    let copied = 0;
    for (const e of entries) {
      const localPath = urlToLocalPath.get(e.url);
      if (!localPath) continue;
      const ext = getExtFromUrl(e.url);
      const subDir = safeDirName(e.sheet);
      const baseName = safeDirName(e.productKey) + '_' + e.photoType + (ext ? '.' + ext : '.jpg');
      const relPath = path.join(subDir, baseName);
      const destPath = path.join(outDir, relPath);
      const srcPath = path.join(publicDir, localPath.replace(/^\//, '').split('?')[0]);
      if (srcPath !== destPath && fs.existsSync(srcPath) && !fs.existsSync(destPath)) {
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(srcPath, destPath);
        copied++;
      }
    }
    if (copied > 0) console.log('Скопировано в остальные пути (тот же URL):', copied);
  }

  if (dryRun) {
    entries.slice(0, 30).forEach((e, i) => {
      console.log(`${i + 1}. [${e.sheet}] ${e.productKey} ${e.photoType} ${e.url.slice(0, 70)}...`);
    });
    if (entries.length > 30) console.log('... и ещё', entries.length - 30);
    return;
  }

  // Загрузка ID категорий
  let categoryIds: Record<string, string>;
  if (fs.existsSync(IDS_PATH)) {
    categoryIds = JSON.parse(fs.readFileSync(IDS_PATH, 'utf8'));
  } else {
    const list = await prisma.catalogCategory.findMany({
      where: { name: { in: ['Межкомнатные двери', 'Наличники', 'Комплекты фурнитуры', 'Ручки и завертки', 'Ограничители'] } },
      select: { id: true, name: true },
    });
    categoryIds = {};
    list.forEach((c) => (categoryIds[c.name] = c.id));
  }
  const doorsCatId = categoryIds['Межкомнатные двери'];
  const nalichnikiCatId = categoryIds['Наличники'];
  const ruchkiCatId = categoryIds['Ручки и завертки'];
  const limitersCatId = categoryIds['Ограничители'];

  let boundNal = 0,
    boundColor = 0,
    boundRuchki = 0,
    boundLim = 0;

  for (const e of entries) {
    const localPath = urlToLocalPath.get(e.url) || e.url;
    if (e.sheet === 'Наличники' && nalichnikiCatId) {
      const product = await prisma.product.findFirst({ where: { sku: e.productKey, catalog_category_id: nalichnikiCatId } });
      if (product) {
        const existing = await prisma.productImage.findFirst({ where: { product_id: product.id } });
        if (!existing) {
          await prisma.productImage.create({
            data: {
              product_id: product.id,
              filename: path.basename(localPath),
              original_name: 'nalichnik.jpg',
              url: localPath,
              mime_type: 'image/jpeg',
              is_primary: true,
              sort_order: 0,
            },
          });
          boundNal++;
        } else if (localPath.startsWith('/uploads/')) {
          await prisma.productImage.update({ where: { id: existing.id }, data: { url: localPath } });
          boundNal++;
        }
      }
    } else if (e.sheet === 'Цвет' && doorsCatId && e.propertyValue) {
      await upsertPropertyPhoto(doorsCatId, DOOR_COLOR_PROPERTY, e.propertyValue, localPath, e.photoType);
      boundColor++;
    } else if (e.sheet === '04 Ручки Завертки' && ruchkiCatId) {
      const product = await prisma.product.findFirst({ where: { sku: e.productKey, catalog_category_id: ruchkiCatId } });
      if (product) {
        const existingImages = await prisma.productImage.findMany({ where: { product_id: product.id }, orderBy: { sort_order: 'asc' } });
        const isMain = e.photoType === 'main';
        const sortOrder = isMain ? 0 : 1;
        const sameSlot = existingImages.find((i) => i.sort_order === sortOrder);
        if (!sameSlot) {
          await prisma.productImage.create({
            data: {
              product_id: product.id,
              filename: path.basename(localPath),
              original_name: isMain ? 'handle.jpg' : 'zaverтка.jpg',
              url: localPath,
              mime_type: 'image/jpeg',
              is_primary: isMain,
              sort_order: sortOrder,
            },
          });
          boundRuchki++;
        } else if (localPath.startsWith('/uploads/')) {
          await prisma.productImage.update({ where: { id: sameSlot.id }, data: { url: localPath } });
          boundRuchki++;
        }
      }
    } else if (e.sheet === '05 Ограничители' && limitersCatId) {
      const product = await prisma.product.findFirst({ where: { sku: e.productKey, catalog_category_id: limitersCatId } });
      if (product) {
        const existing = await prisma.productImage.findFirst({ where: { product_id: product.id } });
        if (!existing) {
          await prisma.productImage.create({
            data: {
              product_id: product.id,
              filename: path.basename(localPath),
              original_name: 'limiter.jpg',
              url: localPath,
              mime_type: 'image/jpeg',
              is_primary: true,
              sort_order: 0,
            },
          });
          boundLim++;
        } else if (localPath.startsWith('/uploads/')) {
          await prisma.productImage.update({ where: { id: existing.id }, data: { url: localPath } });
          boundLim++;
        }
      }
    }
  }

  // Заменить все оставшиеся http-ссылки на локальные пути (по уже построенному urlToLocalPath)
  if (urlToLocalPath.size > 0) {
    const ppWithHttp = await prisma.propertyPhoto.findMany({
      where: { photoPath: { startsWith: 'http' } },
      select: { id: true, photoPath: true },
    });
    const piWithHttp = await prisma.productImage.findMany({
      where: { url: { startsWith: 'http' } },
      select: { id: true, url: true },
    });
    let replacedPp = 0,
      replacedPi = 0;
    for (const ph of ppWithHttp) {
      const local = urlToLocalPath.get(ph.photoPath);
      if (local) {
        await prisma.propertyPhoto.update({ where: { id: ph.id }, data: { photoPath: local } });
        replacedPp++;
      }
    }
    for (const img of piWithHttp) {
      const local = urlToLocalPath.get(img.url);
      if (local) {
        await prisma.productImage.update({ where: { id: img.id }, data: { url: local } });
        replacedPi++;
      }
    }
    if (replacedPp > 0 || replacedPi > 0) {
      console.log('Заменено http→локальный путь: PropertyPhoto', replacedPp, ', ProductImage', replacedPi);
    }
  }

  console.log('Привязки в БД: наличники', boundNal, 'цвет/PropertyPhoto', boundColor, 'ручки', boundRuchki, 'ограничители', boundLim);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
