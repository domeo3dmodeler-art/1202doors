// lib/security/rate-limiter.ts
// Простой rate limiter для API endpoints

import { NextResponse } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private requests: Map<string, RateLimitEntry> = new Map();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs: number = 15 * 60 * 1000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const entry = this.requests.get(identifier);

    if (!entry || now > entry.resetTime) {
      // Создаем новую запись или сбрасываем существующую
      this.requests.set(identifier, {
        count: 1,
        resetTime: now + this.windowMs
      });
      return true;
    }

    if (entry.count >= this.maxRequests) {
      return false;
    }

    entry.count++;
    return true;
  }

  getRemainingRequests(identifier: string): number {
    const entry = this.requests.get(identifier);
    if (!entry) return this.maxRequests;
    return Math.max(0, this.maxRequests - entry.count);
  }

  getResetTime(identifier: string): number {
    const entry = this.requests.get(identifier);
    return entry?.resetTime || Date.now() + this.windowMs;
  }

  // Очистка устаревших записей
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.requests.entries()) {
      if (now > entry.resetTime) {
        this.requests.delete(key);
      }
    }
  }
}

// Глобальные экземпляры rate limiter'ов
export const apiRateLimiter = new RateLimiter(15 * 60 * 1000, 100); // 100 запросов за 15 минут
export const authRateLimiter = new RateLimiter(15 * 60 * 1000, 5); // 5 попыток входа за 15 минут
export const uploadRateLimiter = new RateLimiter(60 * 1000, 10); // 10 загрузок за минуту

// Очистка каждые 5 минут
setInterval(() => {
  apiRateLimiter.cleanup();
  authRateLimiter.cleanup();
  uploadRateLimiter.cleanup();
}, 5 * 60 * 1000);

export function getClientIP(request: Request): string {
  // Получаем IP адрес из заголовков
  const forwarded = request.headers.get('x-forwarded-for');
  const realIP = request.headers.get('x-real-ip');
  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIP) {
    return realIP;
  }
  
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  return 'unknown';
}

export function createRateLimitResponse(limiter: RateLimiter, identifier: string): Response {
  const remaining = limiter.getRemainingRequests(identifier);
  const resetTime = limiter.getResetTime(identifier);
  
  return new Response(
    JSON.stringify({
      error: 'Too Many Requests',
      message: 'Превышен лимит запросов. Попробуйте позже.',
      retryAfter: Math.ceil((resetTime - Date.now()) / 1000)
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': limiter['maxRequests'].toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': resetTime.toString(),
        'Retry-After': Math.ceil((resetTime - Date.now()) / 1000).toString()
      }
    }
  );
}

/** NextResponse variant for use in Next.js API routes that require NextResponse. */
export function createNextRateLimitResponse(limiter: RateLimiter, identifier: string): NextResponse {
  const remaining = limiter.getRemainingRequests(identifier);
  const resetTime = limiter.getResetTime(identifier);
  return new NextResponse(
    JSON.stringify({
      error: 'Too Many Requests',
      message: 'Превышен лимит запросов. Попробуйте позже.',
      retryAfter: Math.ceil((resetTime - Date.now()) / 1000)
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': limiter['maxRequests'].toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': resetTime.toString(),
        'Retry-After': Math.ceil((resetTime - Date.now()) / 1000).toString()
      }
    }
  );
}
