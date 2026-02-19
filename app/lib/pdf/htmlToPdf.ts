// lib/pdf/htmlToPdf.ts (копия логики из @/lib/pdf/htmlToPdf для совместимости)
import puppeteer from 'puppeteer-core';
import { getPuppeteerExecutablePath, DEFAULT_PUPPETEER_ARGS } from '@/lib/export/puppeteer-executable';

export type HtmlToPdfOptions = {
  format?: 'A4' | 'Letter' | 'Legal';
  printBackground?: boolean;
  margin?: {
    top?: string;
    right?: string;
    bottom?: string;
    left?: string;
  };
  preferCSSPageSize?: boolean;
};

/**
 * Генерация PDF из HTML. puppeteer-core + системный Chrome (PUPPETEER_EXECUTABLE_PATH на сервере).
 */
export async function htmlToPdfBuffer(
  html: string,
  opts: HtmlToPdfOptions = {}
): Promise<Buffer> {
  const executablePath = getPuppeteerExecutablePath();
  const browser = await puppeteer.launch({
    args: DEFAULT_PUPPETEER_ARGS,
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();

    // по умолчанию viewport ставить не обязательно; при желании можно:
    // await page.setViewport({ width: 1280, height: 800 });

    await page.setContent(html, {
      waitUntil: ['load', 'domcontentloaded', 'networkidle0'],
    });

    const pdf = await page.pdf({
      format: opts.format ?? 'A4',
      printBackground: opts.printBackground ?? true,
      preferCSSPageSize: opts.preferCSSPageSize ?? false,
      margin: {
        top: opts.margin?.top ?? '10mm',
        right: opts.margin?.right ?? '10mm',
        bottom: opts.margin?.bottom ?? '10mm',
        left: opts.margin?.left ?? '10mm',
      },
    });

    return pdf as Buffer;
  } finally {
    await browser.close();
  }
}

export default htmlToPdfBuffer;
