// api/quotes/preview/route.ts
// API роут для предпросмотра PDF шаблонов КП

import { NextRequest, NextResponse } from 'next/server';
import { generateQuotePDF } from '@/lib/pdf/quote-pdf';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';

// GET /api/quotes/preview - Предпросмотр PDF шаблона
async function getHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { searchParams } = new URL(req.url);
  const templateId = searchParams.get('templateId');

  if (!templateId) {
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Template ID is required',
      400
    );
  }

  // Создаем демонстрационный КП на основе реальных данных
  const demoQuote = {
    id: 'preview-demo',
    title: 'Коммерческое предложение',
    status: 'draft' as const,
    items: [
      {
        sku: 'DOOR-SAMPLE-001',
        model: 'Классика',
        width: 800,
        height: 2000,
        color: 'Белый',
        finish: 'Эмаль',
        series: 'Классика',
        material: 'МДФ',
        rrc_price: 15000,
        qty: 1,
        hardware_kit: {
          name: 'Базовый комплект',
          price_rrc: 5000,
          group: '1'
        },
        handle: {
          name: 'Pro',
          price_opt: 900,
          price_group_multiplier: 1.15
        },
        price_opt: 10000,
        currency: 'RUB'
      },
      {
        sku: 'DOOR-SAMPLE-002',
        model: 'Модерн',
        width: 900,
        height: 2100,
        color: 'Серый',
        finish: 'Шпон',
        series: 'Модерн',
        material: 'МДФ',
        rrc_price: 18000,
        qty: 1,
        hardware_kit: {
          name: 'SoftClose',
          price_rrc: 2400,
          group: '2'
        },
        handle: {
          name: 'Silver',
          price_opt: 1100,
          price_group_multiplier: 1.15
        },
        price_opt: 15000,
        currency: 'RUB'
      }
    ],
    total: 35000,
    currency: 'RUB',
    clientInfo: {
      company: 'ООО "Пример Клиент"',
      contact: 'Петров Петр Петрович',
      email: 'client@example.ru',
      phone: '+7 (495) 000-00-00',
      address: 'г. Москва, ул. Примерная, д. 1'
    },
    notes: 'Коммерческое предложение на основе реальных данных из каталога.',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    acceptedAt: undefined
  };

  // Генерируем PDF с обработкой ошибок Puppeteer
  try {
    const pdfBuffer = await generateQuotePDF(demoQuote);
    const filename = `quote_preview_${templateId}_${new Date().toISOString().slice(0, 10)}.pdf`;

    // Возвращаем PDF файл
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${filename}"`,
        'Content-Length': pdfBuffer.length.toString(),
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
    });
  } catch (pdfError) {
    logger.error('PDF generation failed', 'quotes/preview', { error: pdfError }, loggingContext);
    
    // Возвращаем JSON с информацией о предпросмотре вместо PDF
    return apiSuccess({
      message: "Предпросмотр КП (PDF недоступен)",
      templateId,
      quote: demoQuote,
      error: "PDF генерация недоступна - браузер Chromium не установлен",
      troubleshooting: "Для генерации PDF установите Chromium или используйте другой метод экспорта"
    });
  }
}

export const GET = withErrorHandling(
  requireAuth(getHandler),
  'quotes/preview/GET'
);
