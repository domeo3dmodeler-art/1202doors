import { NextRequest, NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import ExcelJS from 'exceljs';
import { logger } from '@/lib/logging/logger';
import { getPuppeteerExecutablePath, DEFAULT_PUPPETEER_ARGS } from '@/lib/export/puppeteer-executable';

// POST /api/test/export-performance - Тест производительности экспорта
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemCount = 5, format = 'pdf' } = body;

    logger.info('Тестируем производительность экспорта', 'test/export-performance', { itemCount, format });

    const startTime = Date.now();

    if (format === 'pdf') {
      // Тестируем только генерацию PDF без БД
      const title = 'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ';
      
      const htmlContent = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 20mm; }
    .header { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #000; padding: 8px; text-align: left; }
    th { background-color: #e0e0e0; font-weight: bold; }
  </style>
</head>
<body>
  <div class="header">${title}</div>
  <table>
    <thead>
      <tr>
        <th>№</th>
        <th>Артикул</th>
        <th>Наименование</th>
        <th>Цена за ед.</th>
        <th>Кол-во</th>
        <th>Сумма</th>
      </tr>
    </thead>
    <tbody>
      ${Array.from({ length: itemCount }, (_, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>SKU_${i}</td>
          <td>Тестовая дверь ${i}</td>
          <td>${(45000 + i * 1000).toLocaleString('ru-RU')} ₽</td>
          <td>1</td>
          <td>${(45000 + i * 1000).toLocaleString('ru-RU')} ₽</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
</body>
</html>`;

      const executablePath = getPuppeteerExecutablePath();
      const browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: DEFAULT_PUPPETEER_ARGS,
        timeout: 30000
      });

      const page = await browser.newPage();
      await page.setContent(htmlContent, { 
        waitUntil: 'networkidle0',
        timeout: 30000 
      });

      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm'
        },
        timeout: 30000
      });

      await browser.close();
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      logger.info('PDF сгенерирован', 'test/export-performance', { itemCount, format, duration, itemsPerSecond: Math.round((itemCount / duration) * 1000) });

      return NextResponse.json({
        success: true,
        performance: {
          itemCount,
          format,
          duration,
          itemsPerSecond: Math.round((itemCount / duration) * 1000),
          averageTimePerItem: Math.round(duration / itemCount)
        },
        fileSize: pdfBuffer.length
      });
    } else if (format === 'excel') {
      // Тестируем только генерацию Excel без БД
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Тест');
      
      // Заголовки
      worksheet.getRow(1).values = ['№', 'Артикул', 'Наименование', 'Количество', 'Цена', 'Сумма'];
      worksheet.getRow(1).font = { bold: true };
      
      // Тестовые данные
      for (let i = 0; i < itemCount; i++) {
        const row = worksheet.getRow(i + 2);
        row.values = [
          i + 1,
          `SKU_${i}`,
          `Тестовая дверь ${i}`,
          1,
          45000 + (i * 1000),
          45000 + (i * 1000)
        ];
      }
      
      const buffer = await workbook.xlsx.writeBuffer() as Buffer;
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      logger.info('Excel сгенерирован', 'test/export-performance', { itemCount, format, duration, itemsPerSecond: Math.round((itemCount / duration) * 1000) });

      return NextResponse.json({
        success: true,
        performance: {
          itemCount,
          format,
          duration,
          itemsPerSecond: Math.round((itemCount / duration) * 1000),
          averageTimePerItem: Math.round(duration / itemCount)
        },
        fileSize: buffer.length
      });
    }

    return NextResponse.json({
      success: false,
      error: 'Неподдерживаемый формат для теста'
    });

  } catch (error) {
    logger.error('Performance test error', 'test/export-performance', error instanceof Error ? { error: error.message, stack: error.stack, itemCount, format } : { error: String(error), itemCount, format });
    return NextResponse.json(
      { error: 'Ошибка тестирования производительности' },
      { status: 500 }
    );
  }
}