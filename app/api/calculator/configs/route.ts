import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { ValidationError, NotFoundError } from '@/lib/api/errors';
import { logger } from '@/lib/logging/logger';

/**
 * 💾 Сохранить конфигурацию калькулятора
 */
async function postHandler(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const config = await req.json();
    
    if (!config.name) {
      throw new ValidationError('Название калькулятора обязательно');
    }

    logger.info('Создание конфигурации калькулятора', 'calculator/configs', { userId: user.userId, name: config.name });

    // Создаем новую конфигурацию калькулятора
    const constructorConfig = await prisma.constructorConfig.create({
      data: {
        name: config.name,
        description: config.description || '',
        config: JSON.stringify(config),
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    });

    logger.info('Конфигурация калькулятора создана', 'calculator/configs', { configId: constructorConfig.id });

    return apiSuccess({
      id: constructorConfig.id,
      message: 'Калькулятор сохранен успешно'
    });

  } catch (error) {
    logger.error('Ошибка сохранения калькулятора', 'calculator/configs', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof ValidationError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка при сохранении калькулятора', 500);
  }
}

export const POST = withErrorHandling(
  requireAuth(postHandler),
  'calculator/configs/POST'
);

/**
 * 📋 Получить список калькуляторов
 */
async function getHandler(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (id) {
      // Получить конкретный калькулятор
      const calculator = await prisma.constructorConfig.findUnique({
        where: { id }
      });

      if (!calculator) {
        throw new NotFoundError('Калькулятор не найден');
      }

      logger.info('Получена конфигурация калькулятора', 'calculator/configs', { userId: user.userId, configId: id });

      return apiSuccess({
        calculator: {
          id: calculator.id,
          name: calculator.name,
          description: calculator.description,
          config: JSON.parse(calculator.config),
          isActive: calculator.is_active,
          createdAt: calculator.created_at,
          updatedAt: calculator.updated_at
        }
      });
    } else {
      // Получить все калькуляторы
      const calculators = await prisma.constructorConfig.findMany({
        where: { is_active: true },
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          name: true,
          description: true,
          created_at: true,
          updated_at: true
        }
      });

      logger.info('Получен список калькуляторов', 'calculator/configs', { userId: user.userId, count: calculators.length });

      return apiSuccess({ calculators });
    }

  } catch (error) {
    logger.error('Ошибка получения калькуляторов', 'calculator/configs', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof NotFoundError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка при получении калькуляторов', 500);
  }
}

export const GET = withErrorHandling(
  requireAuth(getHandler),
  'calculator/configs/GET'
);

/**
 * ✏️ Обновить калькулятор
 */
async function putHandler(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const { id, ...config } = await req.json();
    
    if (!id) {
      throw new ValidationError('ID калькулятора обязателен');
    }

    logger.info('Обновление конфигурации калькулятора', 'calculator/configs', { userId: user.userId, configId: id });

    const _updatedCalculator = await prisma.constructorConfig.update({
      where: { id },
      data: {
        name: config.name,
        description: config.description || '',
        config: JSON.stringify(config),
        updated_at: new Date()
      }
    });

    logger.info('Конфигурация калькулятора обновлена', 'calculator/configs', { configId: id });

    return apiSuccess({
      message: 'Калькулятор обновлен успешно'
    });

  } catch (error) {
    logger.error('Ошибка обновления калькулятора', 'calculator/configs', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof ValidationError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка при обновлении калькулятора', 500);
  }
}

export const PUT = withErrorHandling(
  requireAuth(putHandler),
  'calculator/configs/PUT'
);

/**
 * 🗑️ Удалить калькулятор
 */
async function deleteHandler(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    
    if (!id) {
      throw new ValidationError('ID калькулятора обязателен');
    }

    logger.info('Удаление конфигурации калькулятора', 'calculator/configs', { userId: user.userId, configId: id });

    // Мягкое удаление
    await prisma.constructorConfig.update({
      where: { id },
      data: { is_active: false }
    });

    logger.info('Конфигурация калькулятора удалена', 'calculator/configs', { configId: id });

    return apiSuccess({
      message: 'Калькулятор удален успешно'
    });

  } catch (error) {
    logger.error('Ошибка удаления калькулятора', 'calculator/configs', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    if (error instanceof ValidationError) {
      throw error;
    }
    return apiError(ApiErrorCode.INTERNAL_SERVER_ERROR, 'Ошибка при удалении калькулятора', 500);
  }
}

export const DELETE = withErrorHandling(
  requireAuth(deleteHandler),
  'calculator/configs/DELETE'
);
