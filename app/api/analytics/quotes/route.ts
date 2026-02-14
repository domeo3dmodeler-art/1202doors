// api/analytics/quotes/route.ts
// API роут для аналитики КП

import { NextRequest, NextResponse } from 'next/server';
import { quoteAnalyticsService, AnalyticsFilters } from '@/lib/analytics/quote-analytics';
import { logger } from '@/lib/logging/logger';

// GET /api/analytics/quotes - Получить аналитику КП
export async function GET(req: NextRequest) {
  let type: string = 'full';
  const filters: AnalyticsFilters = {};
  try {
    const { searchParams } = new URL(req.url);
    type = searchParams.get('type') || 'full';
    
    // Построение фильтров из query параметров
    
    if (searchParams.get('dateFrom')) {
      filters.dateFrom = searchParams.get('dateFrom')!;
    }
    
    if (searchParams.get('dateTo')) {
      filters.dateTo = searchParams.get('dateTo')!;
    }
    
    if (searchParams.get('status')) {
      filters.status = searchParams.get('status')!;
    }
    
    if (searchParams.get('client')) {
      filters.client = searchParams.get('client')!;
    }

    let result;

    switch (type) {
      case 'overview':
        result = await quoteAnalyticsService.getOverview(filters);
        break;
      
      case 'trends':
        result = await quoteAnalyticsService.getTrends(filters);
        break;
      
      case 'topClients':
        const limit = Number(searchParams.get('limit')) || 10;
        result = await quoteAnalyticsService.getTopClients(filters, limit);
        break;
      
      case 'statusDistribution':
        result = await quoteAnalyticsService.getStatusDistribution(filters);
        break;
      
      case 'valueDistribution':
        result = await quoteAnalyticsService.getValueDistribution(filters);
        break;
      
      case 'performance':
        result = await quoteAnalyticsService.getPerformanceMetrics(filters);
        break;
      
      case 'full':
      default:
        result = await quoteAnalyticsService.getFullAnalytics(filters);
        break;
    }

    return NextResponse.json({
      success: true,
      data: result,
      filters: filters,
      generatedAt: new Date().toISOString()
    });

  } catch (error: unknown) {
    logger.error('Error fetching quote analytics', 'analytics/quotes', error instanceof Error ? { error: error.message, stack: error.stack, type, filters } : { error: String(error), type, filters });
    return NextResponse.json(
      { error: 'Ошибка при получении аналитики КП' },
      { status: 500 }
    );
  }
}
