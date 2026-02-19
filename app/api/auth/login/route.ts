import { NextRequest, NextResponse } from 'next/server';
import { SignJWT } from 'jose';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { authRateLimiter, getClientIP, createRateLimitResponse } from '../../../../lib/security/rate-limiter';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';

export async function POST(req: NextRequest) {
  const loggingContext = getLoggingContextFromRequest(req);
  try {
    // Получаем JWT_SECRET из переменных окружения (обязательно в production)
    const JWT_SECRET = process.env.JWT_SECRET;
    
    if (!JWT_SECRET) {
      logger.error('JWT_SECRET is not set! This is required for production.', 'auth/login', {}, loggingContext);
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json(
          { error: 'Server configuration error' },
          { status: 500 }
        );
      }
      return NextResponse.json(
        { error: 'JWT_SECRET must be set in environment variables' },
        { status: 500 }
      );
    }
    
    if (JWT_SECRET.length < 32) {
      logger.error('JWT_SECRET is too short! Minimum length is 32 characters.', 'auth/login', {}, loggingContext);
      return NextResponse.json(
        { error: 'JWT_SECRET must be at least 32 characters long' },
        { status: 500 }
      );
    }
    
    // Rate limiting (в development для localhost не ограничиваем)
    const clientIP = getClientIP(req);
    const isLocalDev = process.env.NODE_ENV === 'development' && (clientIP === 'unknown' || clientIP === '127.0.0.1' || clientIP === '::1' || req.headers.get('host')?.startsWith('localhost'));
    if (!isLocalDev && !authRateLimiter.isAllowed(clientIP)) {
      return createRateLimitResponse(authRateLimiter, clientIP);
    }

    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email и пароль обязательны' },
        { status: 400 }
      );
    }

    // Проверяем DATABASE_URL
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      logger.error('DATABASE_URL не установлен', 'auth/login', {}, loggingContext);
      return NextResponse.json(
        { 
          error: 'Ошибка конфигурации',
          message: 'DATABASE_URL не установлен в переменных окружения',
          hint: 'Проверьте .env.local файл и перезапустите сервер'
        },
        { status: 500 }
      );
    }

    // Проверяем подключение к БД перед запросом
    try {
      await prisma.$connect();
    } catch (dbError) {
      const dbErrorMessage = dbError instanceof Error ? dbError.message : String(dbError);
      // Убираем ANSI escape-коды из сообщения об ошибке
      const cleanErrorMessage = dbErrorMessage.replace(/\x1B\[[0-9;]*[mGK]/g, '');
      
      logger.error('Ошибка подключения к БД', 'auth/login', { 
        error: cleanErrorMessage,
        databaseUrl: databaseUrl ? `${databaseUrl.substring(0, 30)}...` : 'не установлен'
      }, loggingContext);
      
      return NextResponse.json(
        { 
          error: 'Ошибка подключения к базе данных',
          message: cleanErrorMessage,
          hint: 'Проверьте DATABASE_URL в .env.local и убедитесь, что база данных инициализирована. Перезапустите сервер после изменения .env.local'
        },
        { status: 500 }
      );
    }

    // Ищем пользователя в базе данных
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password_hash: true,
        first_name: true,
        last_name: true,
        middle_name: true,
        role: true,
        is_active: true,
        last_login: true
      }
    });

    if (!user) {
      if (process.env.NODE_ENV === 'development') {
        logger.debug('Login 401: пользователь не найден', 'auth/login', { email }, loggingContext);
      }
      return NextResponse.json(
        { error: 'Неверный email или пароль' },
        { status: 401 }
      );
    }

    if (!user.is_active) {
      return NextResponse.json(
        { error: 'Аккаунт заблокирован' },
        { status: 401 }
      );
    }

    // Проверяем пароль
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      if (process.env.NODE_ENV === 'development') {
        logger.debug('Login 401: неверный пароль', 'auth/login', { email: user.email }, loggingContext);
      }
      return NextResponse.json(
        { error: 'Неверный email или пароль' },
        { status: 401 }
      );
    }

    // Обновляем время последнего входа
    await prisma.user.update({
      where: { id: user.id },
      data: { last_login: new Date() }
    });

    // Создаем JWT токен
    const secret = new TextEncoder().encode(JWT_SECRET);
    const token = await new SignJWT({ 
      userId: user.id, 
      email: user.email, 
      role: user.role.toLowerCase() // Приводим роль к нижнему регистру
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('24h')
      .setIssuedAt()
      .sign(secret);

    // Возвращаем данные пользователя (без пароля)
    const userData = {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      middleName: user.middle_name,
      role: user.role.toLowerCase(), // Приводим роль к нижнему регистру
      lastLogin: user.last_login
    };

    const response = NextResponse.json({
      success: true,
      token,
      user: userData
    });

    // Устанавливаем cookie на сервере
    const isProduction = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
    response.cookies.set('auth-token', token, {
      httpOnly: isProduction, // В production недоступен из JS (защита от XSS)
      secure: isProduction,   // В production только по HTTPS
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: 86400,   // 24 часа
      path: '/',
      domain: undefined,
      partitioned: false
    });
    
    // Логирование только в development
    if (process.env.NODE_ENV === 'development') {
      logger.debug('Server cookie set for user', 'auth/login', { email: userData.email }, loggingContext);
    }

    return response;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    const errorDetails = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : { error: String(error) };
    
    logger.error('Login error', 'auth/login', { 
      error: errorMessage,
      stack: errorStack,
      details: errorDetails
    }, loggingContext);
    
    // В development возвращаем детали ошибки для отладки
    if (process.env.NODE_ENV === 'development') {
      return NextResponse.json(
        { 
          error: 'Ошибка сервера',
          message: errorMessage,
          details: errorDetails
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json(
      { error: 'Ошибка сервера' },
      { status: 500 }
    );
  }
}
