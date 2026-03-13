import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { getClientIP, globalApiRateLimiter, createNextRateLimitResponse } from '@/lib/security/rate-limiter';

// Пути, которые требуют авторизации
const protectedPaths = ['/admin', '/complectator', '/executor', '/universal'];
const publicPaths = ['/login', '/', '/catalog', '/doors'];

// Пути только для админов
const adminOnlyPaths = [
  '/admin/users',
  '/admin/settings',
  '/admin/analytics',
  '/admin/notifications-demo',
  '/admin/categories/builder',
  '/admin/catalog/import'
];

// Пути для комплектаторов (убраны из админ панели - доступ только через свои разделы)
const complectatorPaths: string[] = [
  // Комплектаторы не имеют доступа к админ панели
];

// Пути для исполнителей (убраны из админ панели - доступ только через свои разделы)
const executorPaths: string[] = [
  // Исполнители не имеют доступа к админ панели
];

// Пути для экспорта заказов на фабрику (Админ и Исполнитель)
const factoryExportPaths = [
  '/api/cart/export/doors/factory'
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Глобальный rate limit на все /api/* — защита от сканеров и флуда
  // Исключаем раздачу фото /api/uploads/* — иначе массовая загрузка картинок каталога даёт 429
  if (pathname.startsWith('/api')) {
    const isUploads = pathname.startsWith('/api/uploads/');
    if (!isUploads) {
      const clientIP = getClientIP(request);
      const isLocalDev = process.env.NODE_ENV === 'development' && (clientIP === 'unknown' || clientIP === '127.0.0.1' || clientIP === '::1');
      if (!isLocalDev && !globalApiRateLimiter.isAllowed(clientIP)) {
        return createNextRateLimitResponse(globalApiRateLimiter, clientIP);
      }
    }
    return NextResponse.next();
  }

  // Проверяем, является ли путь защищенным
  const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path));
  
  if (!isProtectedPath) {
    return NextResponse.next();
  }

  // Получаем токен из cookies (несколько способов для совместимости)
  const authToken = request.cookies.get('auth-token')?.value;
  const domeoToken = request.cookies.get('domeo-auth-token')?.value;
  const headerAuthToken = request.headers.get('cookie')?.split(';')
    .find(c => c.trim().startsWith('auth-token='))
    ?.split('=')[1]
    ?.trim();
  const headerDomeoToken = request.headers.get('cookie')?.split(';')
    .find(c => c.trim().startsWith('domeo-auth-token='))
    ?.split('=')[1]
    ?.trim();
  const authHeader = request.headers.get('authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  const token = authToken || domeoToken || headerAuthToken || headerDomeoToken || bearerToken;
  
  // Отладочная информация только в development
  if (process.env.NODE_ENV === 'development') {
    console.log('🔐 MIDDLEWARE: Checking protected path:', pathname);
    console.log('🔐 MIDDLEWARE: Token present:', !!token);
  }
  
  if (!token) {
    // Перенаправляем на страницу входа
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

    try {
      // Проверяем токен
      const jwtSecret = process.env.JWT_SECRET;
      
      if (!jwtSecret) {
        console.error('❌ JWT_SECRET is not set! This is required for production.');
        if (process.env.NODE_ENV === 'production') {
          throw new Error('JWT_SECRET environment variable is required');
        }
        // Для development можно использовать временный ключ, но нужно предупредить
        console.warn('⚠️ Using temporary JWT_SECRET for development. Set JWT_SECRET in production!');
        throw new Error('JWT_SECRET must be set in environment variables');
      }
      
      if (jwtSecret.length < 32) {
        console.error('❌ JWT_SECRET is too short! Minimum length is 32 characters.');
        throw new Error('JWT_SECRET must be at least 32 characters long');
      }
      
      const secret = new TextEncoder().encode(jwtSecret);
      const { payload } = await jwtVerify(token, secret);
      
      if (!payload) {
        if (process.env.NODE_ENV === 'development') {
          console.log('❌ jwtVerify returned null/undefined');
        }
        throw new Error('Token verification returned null');
      }
      
      // Логирование только в development
      if (process.env.NODE_ENV === 'development') {
        console.log('✅ Token verified successfully:', { role: payload.role, userId: payload.userId });
      }
    
    const userRole = payload.role?.toString().toLowerCase() || '';

    // Проверяем доступ к админ-панели
    if (pathname.startsWith('/admin')) {
      // Только админы имеют доступ к админ-панели
      if (userRole !== 'admin') {
        return NextResponse.redirect(new URL('/auth/unauthorized', request.url));
      }
    }

    // Проверяем доступ к админ-только путям
    if (adminOnlyPaths.some(path => pathname.startsWith(path))) {
      if (userRole !== 'admin') {
        return NextResponse.redirect(new URL('/auth/unauthorized', request.url));
      }
    }

    // Проверяем доступ комплектаторов
    if (complectatorPaths.some(path => pathname.startsWith(path))) {
      if (!userRole || !['admin', 'complectator'].includes(userRole)) {
        return NextResponse.redirect(new URL('/auth/unauthorized', request.url));
      }
    }

    // Проверяем доступ исполнителей
    if (executorPaths.some(path => pathname.startsWith(path))) {
      if (!userRole || !['admin', 'executor'].includes(userRole)) {
        return NextResponse.redirect(new URL('/auth/unauthorized', request.url));
      }
    }

    // Проверяем доступ к экспорту заказов на фабрику
    if (factoryExportPaths.some(path => pathname.startsWith(path))) {
      if (!userRole || !['admin', 'executor'].includes(userRole)) {
        return NextResponse.redirect(new URL('/auth/unauthorized', request.url));
      }
    }

    // Добавляем информацию о пользователе в заголовки
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', payload.userId?.toString() || '');
    requestHeaders.set('x-user-role', userRole);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });

  } catch (error) {
    // Токен недействителен
    if (process.env.NODE_ENV === 'development') {
      console.log('❌ Token verification failed:', error instanceof Error ? error.message : 'Unknown error');
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    // Обрабатываем и /api/* (для rate limit), и страницы (для auth)
    '/((?!_next/static|_next/image|favicon.ico|public).*)',
  ],
};