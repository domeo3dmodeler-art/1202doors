import { prisma } from '@/lib/prisma';
import { logger } from './logging/logger';

export interface NotificationData {
  userId: string;
  clientId?: string;
  documentId?: string;
  type: string;
  title: string;
  message: string;
}

// Функция для создания уведомления
export async function createNotification(data: NotificationData) {
  try {
    // Проверяем дублирование: не создавать уведомление, если такое же уже есть
    // Для уведомлений о смене статуса учитываем title для более точного определения дубликата
    const whereClause: {
      user_id: string;
      document_id: string | null;
      type: string;
      is_read: boolean;
      created_at: { gte: Date };
      title?: string;
    } = {
      user_id: data.userId,
      document_id: data.documentId || null,
      type: data.type,
      is_read: false,
      created_at: {
        gte: new Date(Date.now() - 5 * 60 * 1000) // в последние 5 минут
      }
    };
    
    // Если type содержит статус (формат "documentType:status"), проверяем также title для более точного определения
    if (data.type.includes(':')) {
      whereClause.title = data.title;
    }
    
    const existingNotification = await prisma.notification.findFirst({
      where: whereClause
    });

    if (existingNotification) {
      logger.warn('Дубликат уведомления обнаружен, пропускаем создание', 'notifications', {
        userId: data.userId,
        documentId: data.documentId,
        type: data.type
      });
      return existingNotification;
    }

    const notification = await prisma.notification.create({
      data: {
        user_id: data.userId,
        client_id: data.clientId || null,
        document_id: data.documentId || null,
        type: data.type,
        title: data.title,
        message: data.message,
        created_at: new Date()
      }
    });

    logger.debug('Notification created', 'notifications', { notificationId: notification.id, userId: data.userId, type: data.type });
    return notification;
  } catch (error) {
    logger.error('Error creating notification', 'notifications', error instanceof Error ? { error: error.message, stack: error.stack, userId: data.userId, type: data.type } : { error: String(error), userId: data.userId, type: data.type });
    throw error;
  }
}

// Функция для отправки уведомлений всем пользователям с определенной ролью
export async function notifyUsersByRole(role: string, data: Omit<NotificationData, 'userId'>) {
  try {
    const roleUpperCase = role.toUpperCase();
    
    // Получаем всех пользователей с указанной ролью
    // Используем case-insensitive поиск: пробуем сначала заглавными буквами, потом строчными
    let users = await prisma.user.findMany({
      where: { 
        role: roleUpperCase,
        is_active: true
      },
      select: { 
        id: true,
        email: true 
      }
    });

    // Если не найдено, пробуем искать строчными буквами
    if (users.length === 0 && roleUpperCase !== role.toLowerCase()) {
      users = await prisma.user.findMany({
        where: { 
          role: role.toLowerCase(),
          is_active: true
        },
        select: { 
          id: true,
          email: true 
        }
      });
    }

    logger.debug('Уведомление роли: найдено активных пользователей', 'notifications', { role: roleUpperCase, usersCount: users.length });
    
    if (users.length === 0) {
      logger.warn('Нет активных пользователей с ролью', 'notifications', { role: roleUpperCase, triedRole: role.toLowerCase() });
      return [];
    }

    logger.debug('Отправка уведомления пользователям', 'notifications', { role: roleUpperCase, title: data.title, usersEmails: users.map((u: { id: string; email: string }) => u.email) });

    // Создаем уведомления для каждого пользователя
    const notifications = await Promise.all(
      users.map((user: { id: string; email: string }) => 
        createNotification({
          ...data,
          userId: user.id
        })
      )
    );

    logger.info('Успешно создано уведомлений для роли', 'notifications', { role: roleUpperCase, notificationsCount: notifications.length });
    return notifications;
  } catch (error) {
    logger.error('Ошибка отправки уведомлений роли', 'notifications', error instanceof Error ? { error: error.message, stack: error.stack, role } : { error: String(error), role });
    throw error;
  }
}

// Функция для отправки уведомления конкретному пользователю
export async function notifyUser(userId: string, data: Omit<NotificationData, 'userId'>) {
  return createNotification({
    ...data,
    userId
  });
}

// Функция для отправки уведомлений о создании документа
export async function notifyDocumentCreated(
  documentType: 'order' | 'invoice' | 'supplier_order',
  documentId: string,
  documentNumber: string,
  clientId: string,
  complectatorId?: string | null,
  executorId?: string | null
) {
  const messages = {
    order: 'Создан новый заказ',
    invoice: 'Создан новый счет',
    supplier_order: 'Создан новый заказ у поставщика'
  };

  const recipients = {
    order: ['manager'] as const, // комплектатору не отправляем «Создан новый заказ»
    invoice: ['manager'] as const,
    supplier_order: ['complectator', 'executor'] as const
  };

  const message = messages[documentType];
  const documentRecipients = recipients[documentType];

  try {
    for (const recipient of documentRecipients) {
      if (recipient === 'complectator' && complectatorId) {
        await notifyUser(complectatorId, {
          clientId,
          documentId,
          type: `${documentType}_created`,
          title: `${message} [${documentNumber}]`,
          message: `${message} ${documentNumber}`
        });
      } else if (recipient === 'executor' && executorId) {
        await notifyUser(executorId, {
          clientId,
          documentId,
          type: `${documentType}_created`,
          title: `${message} [${documentNumber}]`,
          message: `${message} ${documentNumber}`
        });
      } else if (recipient === 'manager') {
        await notifyUsersByRole('manager', {
          clientId,
          documentId,
          type: `${documentType}_created`,
          title: `${message} [${documentNumber}]`,
          message: `${message} ${documentNumber}`
        });
      }
    }
  } catch (error) {
    logger.error('Ошибка отправки уведомлений о создании документа', 'notifications', {
      error: error instanceof Error ? error.message : String(error),
      documentType,
      documentId
    });
    // Не прерываем выполнение при ошибке уведомлений
  }
}