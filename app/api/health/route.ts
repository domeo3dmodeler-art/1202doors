import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getClientIP, publicApiRateLimiter, createNextRateLimitResponse } from '@/lib/security/rate-limiter';

export const runtime = 'nodejs';

interface HealthCheckResult {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  checks: {
    database: {
      status: 'ok' | 'error';
      message?: string;
      responseTime?: number;
    };
    storage?: {
      status: 'ok' | 'error' | 'not_configured';
      message?: string;
    };
  };
}

/**
 * Проверка подключения к базе данных
 */
async function checkDatabase(): Promise<{ status: 'ok' | 'error'; message?: string; responseTime: number }> {
  const startTime = Date.now();
  
  try {
    // Простой запрос для проверки подключения
    await prisma.$queryRaw`SELECT 1`;
    
    const responseTime = Date.now() - startTime;
    
    return {
      status: 'ok',
      responseTime,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Database connection failed',
      responseTime,
    };
  }
}

/**
 * Проверка доступности Yandex Storage (опционально)
 */
async function checkStorage(): Promise<{ status: 'ok' | 'error' | 'not_configured'; message?: string }> {
  // Проверяем наличие переменных окружения для storage
  const hasStorageConfig = 
    process.env.YANDEX_STORAGE_ACCESS_KEY_ID &&
    process.env.YANDEX_STORAGE_SECRET_ACCESS_KEY &&
    process.env.YANDEX_STORAGE_BUCKET_NAME;

  if (!hasStorageConfig) {
    return {
      status: 'not_configured',
      message: 'Storage not configured',
    };
  }

  // Простая проверка доступности storage через тестовый запрос
  // В production можно добавить реальную проверку доступа к bucket
  try {
    // Здесь можно добавить реальную проверку доступа к storage
    // Пока просто проверяем наличие конфигурации
    return {
      status: 'ok',
    };
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Storage check failed',
    };
  }
}

/**
 * Health check endpoint
 * GET /api/health
 * Rate limited to reduce impact of scanners/bots.
 */
export async function GET(request: NextRequest): Promise<NextResponse<HealthCheckResult | { error: string; message: string }>> {
  const clientIP = getClientIP(request);
  if (!publicApiRateLimiter.isAllowed(clientIP)) {
    return createNextRateLimitResponse(publicApiRateLimiter, clientIP);
  }
  const timestamp = new Date().toISOString();
  
  // Проверяем все компоненты
  const [dbCheck, storageCheck] = await Promise.allSettled([
    checkDatabase(),
    checkStorage(),
  ]);

  const database = 
    dbCheck.status === 'fulfilled' 
      ? dbCheck.value 
      : { status: 'error' as const, message: dbCheck.reason?.message || 'Database check failed', responseTime: 0 };

  const storage = 
    storageCheck.status === 'fulfilled'
      ? storageCheck.value
      : { status: 'not_configured' as const, message: 'Storage check not available' };

  // Система считается здоровой, если база данных работает
  const isHealthy = database.status === 'ok';

  const result: HealthCheckResult = {
    status: isHealthy ? 'healthy' : 'unhealthy',
    timestamp,
    checks: {
      database,
      storage,
    },
  };

  return NextResponse.json(result, {
    status: isHealthy ? 200 : 503,
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
