import { NextRequest, NextResponse } from 'next/server';
import { AnalyticsService } from '../../../lib/analytics/analytics-service';
import { logger } from '../../../lib/logging/logger';

export async function GET(request: NextRequest) {
  let type = 'general';
  try {
    const { searchParams } = new URL(request.url);
    type = searchParams.get('type') || 'general';

    const analyticsService = AnalyticsService.getInstance();
    let data;

    switch (type) {
      case 'general':
        data = await analyticsService.getGeneralStats();
        break;
      case 'categories':
        data = await analyticsService.getCategoryStats();
        break;
      case 'users':
        data = await analyticsService.getUserStats();
        break;
      case 'documents':
        data = await analyticsService.getDocumentStats();
        break;
      default:
        return NextResponse.json(
          { error: 'Неподдерживаемый тип аналитики' },
          { status: 400 }
        );
    }

    return NextResponse.json({
      success: true,
      data,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Ошибка получения аналитики', 'analytics', error instanceof Error ? { error: error.message, stack: error.stack, type } : { error: String(error), type });
    return NextResponse.json(
      { error: 'Ошибка получения аналитики' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let type: string | undefined;
  try {
    const body = await request.json();
    type = body.type;

    if (!type) {
      return NextResponse.json(
        { error: 'Тип экспорта обязателен' },
        { status: 400 }
      );
    }

    const analyticsService = AnalyticsService.getInstance();
    const buffer = await analyticsService.exportAnalytics(type as 'general' | 'categories' | 'users' | 'documents');

    const filename = `analytics_${type}_${new Date().toISOString().split('T')[0]}.xlsx`;
    
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
      },
    });

  } catch (error) {
    logger.error('Ошибка экспорта аналитики', 'analytics', error instanceof Error ? { error: error.message, stack: error.stack, type } : { error: String(error), type });
    return NextResponse.json(
      { error: 'Ошибка экспорта аналитики' },
      { status: 500 }
    );
  }
}

