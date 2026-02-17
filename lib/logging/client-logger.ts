// lib/logging/client-logger.ts
// Клиентский wrapper для логирования в браузере

/**
 * Клиентский логгер для использования в 'use client' компонентах
 * Работает только в development режиме для отладки
 */
export class ClientLogger {
  private static isDevelopment = 
    typeof window !== 'undefined' && 
    (process.env.NODE_ENV === 'development' || 
     window.location.hostname === 'localhost' || 
     window.location.hostname === '127.0.0.1' ||
     window.location.hostname.includes('130.193.40.35'));

  private static shouldLog(): boolean {
    // Логируем только в development режиме
    if (typeof window === 'undefined') return false;
    return this.isDevelopment;
  }

  static debug(message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog()) return;
    try {
      // Всегда используем console.log для гарантированного вывода
      const logMessage = `[DEBUG] ${message}`;
      if (metadata) {
        console.log(logMessage, metadata);
      } else {
        console.log(logMessage);
      }
    } catch (e) {
      // Fallback если console.log не работает
      console.warn(`[DEBUG] ${message}`, metadata || '');
    }
  }

  static info(message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog()) return;
    console.info(`[INFO] ${message}`, metadata || '');
  }

  static warn(message: string, metadata?: Record<string, unknown>): void {
    if (!this.shouldLog()) return;
    console.warn(`[WARN] ${message}`, metadata || '');
  }

  static error(message: string, error?: Error | unknown, metadata?: Record<string, unknown>): void {
    // Ошибки логируем всегда, даже в production
    if (typeof window === 'undefined') return;
    
    try {
      // Нормализуем ошибку: в бандле/другом realm instanceof Error может быть false, у Error нет enumerable keys → в консоль уходит {}
      let errorData: Record<string, unknown> | unknown = error;
      if (error instanceof Error) {
        errorData = { message: error.message, stack: error.stack };
      } else if (error && typeof error === 'object' && 'message' in error) {
        errorData = { message: (error as { message?: unknown }).message, stack: (error as { stack?: unknown }).stack };
      } else if (error !== undefined && error !== null) {
        errorData = { message: String(error) };
      }
      
      // Используем console.error только для критических ошибок
      // В production это будет отправлено в систему мониторинга
      if (typeof console !== 'undefined' && console.error) {
        // Безопасный вызов console.error с проверкой аргументов
        // В dev-режиме Next.js перехватывает console.error, поэтому объединяем все в одну строку
        const errorMessage = `[ERROR] ${message}`;
        
        // Создаем безопасную строку для логирования, объединяя все данные
        let logString = errorMessage;
        
        if (errorData && typeof errorData === 'object' && errorData !== null) {
          try {
            // Проверяем, что объект не пустой
            const keys = Object.keys(errorData);
            if (keys.length > 0) {
              // Преобразуем объект в строку для безопасного логирования
              const errorString = JSON.stringify(errorData, null, 2);
              logString += `\n${errorString}`;
            }
          } catch {
            // Если не удалось сериализовать, используем toString
            logString += `\n${String(errorData)}`;
          }
        } else if (errorData) {
          logString += `\n${String(errorData)}`;
        }
        
        if (metadata && typeof metadata === 'object' && metadata !== null) {
          try {
            // Проверяем, что объект не пустой
            const keys = Object.keys(metadata);
            if (keys.length > 0) {
              const metadataString = JSON.stringify(metadata, null, 2);
              logString += `\n${metadataString}`;
            }
          } catch {
            logString += `\n${String(metadata)}`;
          }
        }
        
        // Используем безопасный подход: передаем объекты напрямую, но с обработкой ошибок
        // Next.js в dev-режиме перехватывает console.error и может вызывать ошибки при строковых аргументах
        try {
          // Передаем объекты напрямую - это более безопасно для Next.js
          if (errorData && metadata) {
            // eslint-disable-next-line no-console
            console.error(errorMessage, errorData, metadata);
          } else if (errorData) {
            // eslint-disable-next-line no-console
            console.error(errorMessage, errorData);
          } else if (metadata) {
            // eslint-disable-next-line no-console
            console.error(errorMessage, metadata);
          } else {
            // eslint-disable-next-line no-console
            console.error(errorMessage);
          }
        } catch (consoleError) {
          // Если console.error вызывает ошибку (например, из-за перехвата Next.js),
          // используем альтернативный метод - строку через console.warn
          try {
            // eslint-disable-next-line no-console
            console.warn(logString);
          } catch {
            // Если и это не работает, просто игнорируем
            // В production это будет отправлено в систему мониторинга
          }
        }
      }
    } catch (e) {
      // Если даже логирование не работает, просто игнорируем
      // Это предотвращает бесконечные циклы ошибок
      // В dev-режиме Next.js может перехватывать console.error, поэтому просто игнорируем
    }
  }

  // Специальные методы для компонентов
  static componentRender(componentName: string, props?: Record<string, unknown>): void {
    if (!this.shouldLog()) return;
    console.debug(`[RENDER] ${componentName}`, props || '');
  }

  static componentProps(componentName: string, props: Record<string, unknown>): void {
    if (!this.shouldLog()) return;
    console.debug(`[PROPS] ${componentName}`, props);
  }

  static apiCall(method: string, url: string, data?: Record<string, unknown>): void {
    if (!this.shouldLog()) return;
    console.debug(`[API] ${method} ${url}`, data || '');
  }

  static apiResponse(method: string, url: string, status: number, data?: Record<string, unknown>): void {
    if (!this.shouldLog()) return;
    const level = status >= 400 ? 'error' : status >= 300 ? 'warn' : 'info';
    if (typeof console !== 'undefined' && console[level]) {
      console[level](`[API] ${method} ${url} - ${status}`, data || '');
    }
  }
}

// Экспортируем синглтон для удобства
export const clientLogger = ClientLogger;

