import { NextRequest, NextResponse } from 'next/server';

/**
 * Проверка наличия критичных переменных окружения.
 * В production не отдаём ответ — утечка информации о конфигурации.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.json({
    JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'NOT SET',
    DATABASE_URL: process.env.DATABASE_URL ? 'SET' : 'NOT SET',
    NODE_ENV: process.env.NODE_ENV,
    allEnvVars: Object.keys(process.env).filter(key => key.includes('JWT') || key.includes('DATABASE'))
  });
}
