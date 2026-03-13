import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/** Минимальный middleware для локального dev: только pass-through (без auth/rate-limit). Используется при NEXT_MIDDLEWARE_PASSTHROUGH=1. */
export async function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};
