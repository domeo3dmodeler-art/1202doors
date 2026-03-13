/**
 * Разрешение пути к Chrome/Chromium для Puppeteer.
 * Безопасная схема: только env + фиксированные пути, без загрузки браузера через npm.
 * На сервере (Linux) обязателен PUPPETEER_EXECUTABLE_PATH.
 */

import path from 'path';
import fs from 'fs';

const isWindows = process.platform === 'win32';
const isDarwin = process.platform === 'darwin';

/** Безопасные аргументы запуска для headless Chrome на VPS */
export const DEFAULT_PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-software-rasterizer',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-sync',
  '--metrics-recording-only',
  '--no-first-run',
  '--no-default-browser-check',
  '--mute-audio',
  '--hide-scrollbars',
  '--window-size=794,1123', // A4 @ 96dpi — меньше буферов растеризации
];

/**
 * Дополнительные аргументы для снижения потребления RAM при генерации PDF/Excel.
 * Не отключаем то, без чего headless PDF ломается (рендер, шрифты).
 */
export const MEMORY_SAVING_PUPPETEER_ARGS = [
  '--disable-gpu-compositing',
  '--disable-gpu-rasterization',
  '--disable-gpu-sandbox',
  '--disable-features=TranslateUI,BackForwardCache',
  '--disable-default-apps',
  '--no-zygote', // меньше процессов на Linux
  '--js-flags=--max-old-space-size=128', // лимит кучи V8 в рендерере (128 МБ для простого HTML→PDF)
];

/** На Linux: /usr/bin/chromium-browser на Ubuntu 22+ — это скрипт-обёртка под snap; Puppeteer нужен реальный бинарник. */
function isLikelyBinary(filePath: string): boolean {
  try {
    const buf = Buffer.alloc(20);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, 20, 0);
    fs.closeSync(fd);
    if (buf[0] === 0x23 && buf[1] === 0x21) return false; // #!
    if (buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) return true; // ELF
    return true; // неизвестный формат — считаем бинарником
  } catch {
    return false;
  }
}

/** Если путь ведёт к скрипту (например /opt/google/chrome/google-chrome), пробуем бинарник chrome в той же папке. */
function tryChromeBinaryInSameDir(scriptOrSymlinkPath: string): string | null {
  try {
    const realPath = fs.realpathSync(scriptOrSymlinkPath);
    if (isLikelyBinary(realPath)) return null;
    const dir = path.dirname(realPath);
    const chromePath = path.join(dir, 'chrome');
    if (fs.existsSync(chromePath) && isLikelyBinary(chromePath)) return chromePath;
  } catch {
    // ignore
  }
  return null;
}

/** На Linux при отсутствии переменной в process.env пробуем прочитать .env (systemd/next dev могут не передавать EnvironmentFile). */
function loadPuppeteerPathFromEnvFile(): string | null {
  if (process.platform !== 'linux') return null;
  const home = process.env.HOME || '/home/ubuntu';
  const dirs = [
    process.cwd(),
    path.join(process.cwd(), '..'),
    path.join(home, 'domeo-app'),
    path.join(home, '1002doors'),
  ];
  for (const dir of dirs) {
    const envFile = path.join(dir, '.env');
    try {
      if (!fs.existsSync(envFile)) continue;
      const content = fs.readFileSync(envFile, 'utf8');
      const match = content.match(/^\s*PUPPETEER_EXECUTABLE_PATH\s*=\s*(.+)/m);
      if (match) {
        const value = match[1].trim().replace(/^["']|["']$/g, '');
        if (value && fs.existsSync(value) && (process.platform !== 'linux' || isLikelyBinary(value))) return value;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

/**
 * Возвращает путь к исполняемому файлу Chrome/Chromium.
 * На сервере (Linux) при отсутствии PUPPETEER_EXECUTABLE_PATH пробует .env и стандартные пути.
 */
export function getPuppeteerExecutablePath(): string {
  let envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (!envPath || !fs.existsSync(envPath)) {
    const fromEnvFile = loadPuppeteerPathFromEnvFile();
    if (fromEnvFile) envPath = fromEnvFile;
  }
  // На Linux не используем путь к скрипту (напр. обёртка chromium-browser → snap); только реальный бинарник
  if (envPath && fs.existsSync(envPath) && (process.platform !== 'linux' || isLikelyBinary(envPath))) return envPath;
  // Google Chrome .deb: /usr/bin/google-chrome-stable → скрипт в /opt/google/chrome; бинарник — chrome в той же папке
  if (process.platform === 'linux' && envPath && fs.existsSync(envPath)) {
    const alt = tryChromeBinaryInSameDir(envPath);
    if (alt) return alt;
  }

  if (isWindows) {
    const winPaths = [
      path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    ].filter(Boolean);
    for (const p of winPaths) {
      if (p && fs.existsSync(p)) return p;
    }
    throw new Error(
      'Chrome не найден. Задайте PUPPETEER_EXECUTABLE_PATH или установите Google Chrome.'
    );
  }

  if (isDarwin) {
    const home = process.env.HOME || '';
    const macPaths = [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      path.join(home, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
    ].filter(Boolean);
    for (const p of macPaths) {
      if (p && fs.existsSync(p)) return p;
    }
    throw new Error(
      'Chrome не найден. Задайте PUPPETEER_EXECUTABLE_PATH или установите Google Chrome.'
    );
  }

  // Linux (сервер): только реальные бинарники. /usr/bin/chromium-browser на Ubuntu 22+ — скрипт под snap, не подходит.
  const linuxPaths = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const p of linuxPaths) {
    if (fs.existsSync(p)) {
      const stat = fs.statSync(p);
      if (stat.isFile() && isLikelyBinary(p)) return p;
    }
  }
  throw new Error(
    'На сервере нужен Chrome/Chromium для PDF/Excel. На Ubuntu 22+ apt chromium-browser — это обёртка snap; установите Google Chrome: см. scripts/setup-vm-chromium.ps1 и задайте в .env: PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable'
  );
}
