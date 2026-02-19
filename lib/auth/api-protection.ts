/**
 * Утилиты для защиты API endpoints
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, requirePermission, requireRole, AuthContext, Role } from './middleware';
import { Permission } from './roles';
import { safeLog, safeLogError } from '../utils/logger';

/**
 * Защита API endpoint аутентификацией
 */
export function withAuth(handler: (req: NextRequest, context: AuthContext) => Promise<NextResponse>) {
  return requireAuth(handler);
}

/**
 * Защита API endpoint с проверкой разрешений
 */
export function withPermission(permission: Permission) {
  return function(handler: (req: NextRequest, context: AuthContext) => Promise<NextResponse>) {
    return requireAuth(requirePermission(permission)(handler));
  };
}

/**
 * Защита API endpoint с проверкой роли
 */
export function withRole(role: Role) {
  return function(handler: (req: NextRequest, context: AuthContext) => Promise<NextResponse>) {
    return requireAuth(requireRole(role)(handler));
  };
}

/**
 * Защита API endpoint для админов
 */
export function withAdminAuth(handler: (req: NextRequest, context: AuthContext) => Promise<NextResponse>) {
  return withRole('admin')(handler);
}

/**
 * Защита API endpoint для менеджеров и выше
 */
export function withManagerAuth(handler: (req: NextRequest, context: AuthContext) => Promise<NextResponse>) {
  return withRole('manager')(handler);
}

/**
 * Защита API endpoint для всех аутентифицированных пользователей
 */
export function withUserAuth(handler: (req: NextRequest, context: AuthContext) => Promise<NextResponse>) {
  return withAuth(handler);
}

/**
 * Опциональная аутентификация (не блокирует если токен отсутствует)
 */
export function withOptionalAuth(handler: (req: NextRequest, context: AuthContext | null) => Promise<NextResponse>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    try {
      const authHeader = req.headers.get('authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return await handler(req, null);
      }

      const token = authHeader.substring(7);
      const { validateJWTToken } = await import('./jwt');
      const user = await validateJWTToken(token);
      
      if (!user) {
        return await handler(req, null);
      }

      const { roleService } = await import('./roles');
      const context: AuthContext = {
        userId: user.id,
        role: user.role as Role,
        permissions: roleService.getRolePermissions(user.role as Role)
      };

      return await handler(req, context);
    } catch (error) {
      return await handler(req, null);
    }
  };
}

/**
 * Проверка CORS для API.
 * В production используйте ALLOWED_ORIGIN или NEXT_PUBLIC_APP_URL (например https://yourdomain.com).
 */
export function withCORS(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const response = await handler(req);
    const isProduction = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
    const allowedOrigin = process.env.ALLOWED_ORIGIN || process.env.NEXT_PUBLIC_APP_URL;
    const origin = isProduction && allowedOrigin ? allowedOrigin : '*';
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    return response;
  };
}

/**
 * Rate limiting для API
 */
export function withRateLimit(maxRequests: number = 100, windowMs: number = 15 * 60 * 1000) {
  const requests = new Map<string, { count: number; resetTime: number }>();
  
  return function(handler: (req: NextRequest) => Promise<NextResponse>) {
    return async (req: NextRequest): Promise<NextResponse> => {
      const ip = req.ip || req.headers.get('x-forwarded-for') || 'unknown';
      const now = Date.now();
      
      const current = requests.get(ip);
      
      if (!current || now > current.resetTime) {
        requests.set(ip, { count: 1, resetTime: now + windowMs });
      } else {
        current.count++;
        if (current.count > maxRequests) {
          return NextResponse.json(
            { error: 'Превышен лимит запросов' },
            { status: 429 }
          );
        }
      }
      
      return await handler(req);
    };
  };
}

/**
 * Логирование API запросов
 */
export function withLogging(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest): Promise<NextResponse> => {
    const start = Date.now();
    const method = req.method;
    const url = req.url;
    
    try {
      const response = await handler(req);
      const duration = Date.now() - start;
      
      safeLog(`📊 API ${method} ${url} - ${response.status} (${duration}ms)`);
      
      return response;
    } catch (error) {
      const duration = Date.now() - start;
      safeLogError(`❌ API ${method} ${url} - ERROR (${duration}ms):`, error);
      throw error;
    }
  };
}

/**
 * Комбинированная защита API
 */
export function withFullProtection(options: {
  auth?: boolean;
  permission?: Permission;
  role?: Role;
  rateLimit?: number;
  cors?: boolean;
  logging?: boolean;
}) {
  return function(handler: (req: NextRequest, context?: AuthContext) => Promise<NextResponse>) {
    let protectedHandler: any = handler;
    
    // Применяем защиты в обратном порядке
    if (options.logging) {
      protectedHandler = withLogging(protectedHandler);
    }
    
    if (options.cors) {
      protectedHandler = withCORS(protectedHandler);
    }
    
    if (options.rateLimit) {
      protectedHandler = withRateLimit(options.rateLimit)(protectedHandler);
    }
    
    if (options.role) {
      protectedHandler = withRole(options.role)(protectedHandler);
    } else if (options.permission) {
      protectedHandler = withPermission(options.permission)(protectedHandler);
    } else if (options.auth) {
      protectedHandler = withAuth(protectedHandler);
    }
    
    return protectedHandler;
  };
}
