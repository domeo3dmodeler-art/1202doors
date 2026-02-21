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
  '--window-size=1920,1080',
];

/**
 * Возвращает путь к исполняемому файлу Chrome/Chromium.
 * На сервере (Linux) при отсутствии PUPPETEER_EXECUTABLE_PATH бросает.
 */
export function getPuppeteerExecutablePath(): string {
  const envPath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

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

  // Linux (сервер): только пути из apt. Snap Chromium не запускается из systemd (cgroup).
  const linuxPaths = [
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const p of linuxPaths) {
    if (fs.existsSync(p)) {
      const stat = fs.statSync(p);
      if (stat.isFile()) return p;
    }
  }
  throw new Error(
    'На сервере нужен Chrome/Chromium для PDF/Excel. Установите: sudo apt install chromium-browser (или google-chrome-stable) и в .env на ВМ задайте: PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser'
  );
}
