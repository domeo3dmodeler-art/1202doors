// lib/validation/status-requirements.ts
// Проверка обязательных полей при переходе статусов документов

import { BusinessRuleError } from '@/lib/api/errors';

export interface StatusTransitionRequirements {
  requiredFields?: string[];
  customValidation?: (document: any) => { valid: boolean; error?: string };
}

/**
 * Требования для переходов статусов Order
 */
export const ORDER_STATUS_REQUIREMENTS: Record<string, Record<string, StatusTransitionRequirements>> = {
  order: {
    // Переход в "Счет оплачен (Заказываем)" — требуется проект/планировка
    'NEW_PLANNED': {
      requiredFields: ['project_file_url'],
      customValidation: (document: any) => {
        if (!document.project_file_url) {
          return {
            valid: false,
            error: 'Для перевода заказа в этот статус прикрепите файлы с Проектом/Планировкой.'
          };
        }
        return { valid: true };
      }
    },
    // Переход в "На проверке" — исполнитель берёт заказ в работу; проект/планировку может загрузить позже
    'UNDER_REVIEW': {},
    'AWAITING_MEASUREMENT': {
      requiredFields: ['project_file_url'],
      customValidation: (document: any) => {
        if (!document.project_file_url) {
          return {
            valid: false,
            error: 'Для перехода в статус "Ждет замер" требуется загрузить проект/планировку'
          };
        }
        return { valid: true };
      }
    },
    'AWAITING_INVOICE': {
      requiredFields: ['project_file_url'],
      customValidation: (document: any) => {
        if (!document.project_file_url) {
          return {
            valid: false,
            error: 'Для перехода в статус "Ожидает счет" требуется загрузить проект/планировку'
          };
        }
        // Можно добавить проверку наличия door_dimensions
        if (!document.door_dimensions || (Array.isArray(document.door_dimensions) && document.door_dimensions.length === 0)) {
          return {
            valid: false,
            error: 'Для перехода в статус "Ожидает счет" требуется указать данные дверей'
          };
        }
        return { valid: true };
      }
    },
    'READY_FOR_PRODUCTION': {
      requiredFields: ['project_file_url', 'door_dimensions'],
      customValidation: (document: any) => {
        if (!document.project_file_url) {
          return {
            valid: false,
            error: 'Для перехода в статус "Готов к запуску в производство" требуется загрузить проект/планировку'
          };
        }
        if (!document.door_dimensions || (Array.isArray(document.door_dimensions) && document.door_dimensions.length === 0)) {
          return {
            valid: false,
            error: 'Для перехода в статус "Готов к запуску в производство" требуется указать данные дверей'
          };
        }
        // Проверяем наличие оптовых счетов или техзаданий (хотя бы одно)
        // Это проверяется через наличие wholesale_invoices или technical_specs
        // Но так как эти поля не передаются в document, проверка будет только на уровне API
        return { valid: true };
      }
    },
    'COMPLETED': {
      requiredFields: ['project_file_url', 'door_dimensions'],
      customValidation: (document: any) => {
        if (!document.project_file_url) {
          return {
            valid: false,
            error: 'Для перехода в статус "Выполнена" требуется загрузить проект/планировку'
          };
        }
        if (!document.door_dimensions || (Array.isArray(document.door_dimensions) && document.door_dimensions.length === 0)) {
          return {
            valid: false,
            error: 'Для перехода в статус "Выполнена" требуется указать данные дверей'
          };
        }
        // Можно добавить проверку наличия всех обязательных полей
        return { valid: true };
      }
    }
  }
};

/**
 * Требования для переходов статусов SupplierOrder
 */
export const SUPPLIER_ORDER_STATUS_REQUIREMENTS: Record<string, Record<string, StatusTransitionRequirements>> = {
  supplier_order: {
    'ORDERED': {
      requiredFields: ['supplier_name'],
      customValidation: (document: any) => {
        if (!document.supplier_name) {
          return {
            valid: false,
            error: 'Для перехода в статус "Заказ размещен" требуется указать поставщика'
          };
        }
        return { valid: true };
      }
    },
    'RECEIVED_FROM_SUPPLIER': {
      requiredFields: ['supplier_name'],
      customValidation: (document: any) => {
        if (!document.supplier_name) {
          return {
            valid: false,
            error: 'Для перехода в статус "Получен от поставщика" требуется указать поставщика'
          };
        }
        return { valid: true };
      }
    },
    'COMPLETED': {
      requiredFields: ['supplier_name'],
      customValidation: (document: any) => {
        if (!document.supplier_name) {
          return {
            valid: false,
            error: 'Для перехода в статус "Исполнен" требуется указать поставщика'
          };
        }
        return { valid: true };
      }
    }
  }
};

/**
 * Проверка обязательных полей при переходе статуса
 */
export function validateStatusTransitionRequirements(
  documentType: 'order' | 'supplier_order',
  currentStatus: string,
  newStatus: string,
  document: any
): { valid: boolean; error?: string } {
  // Получаем требования для данного типа документа
  const requirements = documentType === 'order' 
    ? ORDER_STATUS_REQUIREMENTS.order
    : SUPPLIER_ORDER_STATUS_REQUIREMENTS.supplier_order;

  // Проверяем, есть ли требования для перехода в новый статус
  const transitionRequirements = requirements[newStatus];
  
  if (!transitionRequirements) {
    // Если нет специальных требований, переход разрешен
    return { valid: true };
  }

  // Проверяем обязательные поля
  if (transitionRequirements.requiredFields) {
    for (const field of transitionRequirements.requiredFields) {
      const value = document[field];
      if (value === undefined || value === null || value === '') {
        // Если поле отсутствует, проверяем customValidation для более детального сообщения
        if (transitionRequirements.customValidation) {
          const customResult = transitionRequirements.customValidation(document);
          if (!customResult.valid) {
            return customResult;
          }
        }
        return {
          valid: false,
          error: `Для перехода в статус "${newStatus}" требуется заполнить поле "${field}"`
        };
      }
    }
  }

  // Выполняем кастомную валидацию, если она есть
  if (transitionRequirements.customValidation) {
    return transitionRequirements.customValidation(document);
  }

  return { valid: true };
}

