// lib/notifications/status-notifications.ts
// Система уведомлений при изменении статусов документов

import { logger } from '../logging/logger';

export const STATUS_NOTIFICATIONS = {
  quote: {
    'SENT': {
      recipients: ['client'],
      message: 'Вам отправлено коммерческое предложение'
    },
    'ACCEPTED': {
      recipients: ['complectator'],
      message: 'Клиент принял коммерческое предложение'
    },
    'REJECTED': {
      recipients: ['complectator'],
      message: 'Клиент отклонил коммерческое предложение'
    }
  },
  invoice: {
    'SENT': {
      recipients: ['client'],
      message: 'Вам отправлен счет на оплату'
    },
    'PAID': {
      recipients: ['executor', 'manager'],
      message: 'Счет оплачен. Вы можете создать заказ у поставщика.'
    },
    'ORDERED': {
      recipients: ['complectator'],
      message: 'Заказ размещен у поставщика.'
    },
    'RECEIVED_FROM_SUPPLIER': {
      recipients: ['complectator'],
      message: 'Товар получен от поставщика.'
    },
    'COMPLETED': {
      recipients: ['complectator', 'manager', 'client'],
      message: 'Заказ выполнен.'
    }
  },
  order: {
    'SENT': {
      recipients: [], // комплектатору не отправляем «Счет по заказу отправлен клиенту»
      message: 'Счет по заказу отправлен клиенту.'
    },
    'NEW_PLANNED': {
      recipients: ['executor'], // комплектатору не отправляем
      message: 'Счет оплачен. Заказ готов к обработке.'
    },
    'UNDER_REVIEW': {
      recipients: ['executor'], // комплектатору не отправляем
      message: 'Заказ переведен на проверку.'
    },
    'AWAITING_MEASUREMENT': {
      recipients: ['executor'], // комплектатору не отправляем
      message: 'Заказ ожидает замера. Требуются точные размеры с объекта.'
    },
    'AWAITING_INVOICE': {
      recipients: ['executor'], // комплектатору не отправляем
      message: 'Заказ ожидает оптовые счета. Запрошены счета у поставщиков.'
    },
    'READY_FOR_PRODUCTION': {
      recipients: ['executor'], // комплектатору не отправляем
      message: 'Заказ готов к запуску в производство. Все документы готовы. Требуется ваша команда на запуск.'
    },
    'COMPLETED': {
      recipients: ['executor', 'manager'], // комплектатору не отправляем
      message: 'Заказ выполнен и готов к отгрузке/установке.'
    },
    'RETURNED_TO_COMPLECTATION': {
      recipients: ['complectator'],
      message: 'Заказ возвращен вам для доработки.'
    },
    'CANCELLED': {
      recipients: ['executor'], // комплектатору не отправляем
      message: 'Заказ отменен.'
    }
  },
  supplier_order: {
    'ORDERED': {
      recipients: ['complectator', 'executor'],
      message: 'Заказ размещен у поставщика.'
    },
    'RECEIVED_FROM_SUPPLIER': {
      recipients: ['complectator', 'executor'],
      message: 'Товар получен от поставщика.'
    },
    'COMPLETED': {
      recipients: ['complectator', 'executor'],
      message: 'Заказ выполнен поставщиком.'
    }
  }
};

export async function sendStatusNotification(
  documentId: string,
  documentType: string,
  documentNumber: string,
  oldStatus: string,
  newStatus: string,
  clientId: string,
  complectatorId?: string | null,
  executorId?: string | null,
  reason?: string,
  managerId?: string | null
) {
  logger.debug('sendStatusNotification вызвана', 'status-notifications', {
    documentId,
    documentType,
    documentNumber,
    oldStatus,
    newStatus,
    clientId,
    complectatorId,
    executorId,
    reason
  });

  const notificationConfig = STATUS_NOTIFICATIONS[documentType as keyof typeof STATUS_NOTIFICATIONS];
  if (!notificationConfig) {
    logger.warn('Нет конфигурации уведомлений для типа документа', 'status-notifications', { documentType });
    return;
  }
  
  if (!notificationConfig[newStatus as keyof typeof notificationConfig]) {
    logger.warn('Нет конфигурации уведомлений для статуса', 'status-notifications', { documentType, newStatus });
    return;
  }
  
  const config = notificationConfig[newStatus as keyof typeof notificationConfig] as { recipients: string[]; message: string } | undefined;
  if (!config) {
    logger.warn('Нет конфигурации уведомлений для статуса', 'status-notifications', { documentType, newStatus });
    return;
  }
  
  logger.debug('Конфигурация уведомления', 'status-notifications', { config, documentType, newStatus });
  
  // Импортируем функции из lib/notifications
  const { notifyUsersByRole, notifyUser } = await import('@/lib/notifications');
  
  for (const recipient of config.recipients) {
    logger.debug('Отправка уведомления получателю', 'status-notifications', { recipient, documentId, documentType, newStatus });
    
    if (recipient === 'client') {
      // Клиенты не заходят в систему, пропускаем уведомление
      logger.debug('Уведомление клиенту (пропущено, клиенты не заходят в систему)', 'status-notifications', { clientId, message: config.message });
    } else if (recipient === 'complectator') {
      // Комплектатор: отправляем уведомление только создателю заказа
      if (complectatorId) {
        logger.debug('Отправка уведомления комплектатору (создателю заказа)', 'status-notifications', { 
          complectatorId, 
          documentId, 
          documentType, 
          newStatus 
        });
        
        // Формируем сообщение с учетом причины возврата, если есть
        let message = `${config.message} Документ: ${documentNumber}`;
        if (reason) {
          message += `. Причина: ${reason}`;
        }
        
        await notifyUser(complectatorId, {
          clientId: clientId || undefined,
          documentId,
          type: `${documentType}:${newStatus}`,
          title: `${config.message} [${documentNumber}]`,
          message
        });
      } else {
        logger.warn('Не указан complectator_id для заказа, уведомление комплектатору не отправлено', 'status-notifications', { documentId });
      }
    } else if (recipient === 'executor') {
      // Исполнитель: отправляем уведомление только назначенному исполнителю
      if (executorId) {
        logger.debug('Отправка уведомления назначенному исполнителю', 'status-notifications', { 
          executorId, 
          documentId, 
          documentType, 
          newStatus 
        });
        await notifyUser(executorId, {
          clientId: clientId || undefined,
          documentId,
          type: `${documentType}:${newStatus}`,
          title: `${config.message} [${documentNumber}]`,
          message: `${config.message} Документ: ${documentNumber}`
        });
      } else {
        // Если executor_id не указан, уведомление не отправляется
        logger.debug('executor_id не указан, уведомление исполнителю не отправлено', 'status-notifications', { documentId, documentType, newStatus });
      }
    } else if (recipient === 'manager') {
      // Менеджер: отправляем уведомление всем активным менеджерам
      logger.debug('Отправка уведомления менеджерам', 'status-notifications', { 
        documentId, 
        documentType, 
        newStatus 
      });
      
      let message = `${config.message} Документ: ${documentNumber}`;
      if (reason) {
        message += `. Причина: ${reason}`;
      }
      
      await notifyUsersByRole('manager', {
        clientId: clientId || undefined,
        documentId,
        type: `${documentType}:${newStatus}`,
        title: `${config.message} [${documentNumber}]`,
        message
      });
    }
  }
  
  logger.debug('sendStatusNotification завершена', 'status-notifications', { documentId, documentType, newStatus });
}
