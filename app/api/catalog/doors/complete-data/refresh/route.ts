/**
 * Сброс кэша complete-data без авторизации (для разработки и скриптов).
 * GET /api/catalog/doors/complete-data/refresh
 */
import { NextResponse } from 'next/server';
import { clearCompleteDataCache } from '../../../../../../lib/catalog/complete-data-cache';

export async function GET() {
  clearCompleteDataCache();
  return NextResponse.json({ ok: true, message: 'Кэш complete-data очищен' });
}
