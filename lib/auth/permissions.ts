// lib/auth/permissions.ts
// Проверка прав доступа согласно правилам системы

import { UserRole, Permission, getRolePermissions } from './roles';

export function canUserPerformAction(
  userRole: UserRole,
  action: string,
  documentType?: string,
  documentStatus?: string,
  documentCreatorId?: string,
  userId?: string
): boolean {
  const permissions = getRolePermissions(userRole);
  
  // Базовые проверки прав
  if (!permissions.includes(action as Permission)) {
    return false;
  }
  
  // Дополнительные проверки по типу документа
  if (documentType && documentStatus) {
    return canUserModifyDocument(userRole, documentType, documentStatus);
  }
  
  // Проверка авторства для удаления
  if (action === 'DELETE' && documentCreatorId && userId) {
    return canUserDeleteDocument(userRole, documentCreatorId, userId);
  }
  
  return true;
}

function canUserModifyDocument(
  userRole: UserRole,
  documentType: string,
  documentStatus: string
): boolean {
  // Только черновики можно редактировать
  if (documentStatus !== 'DRAFT') {
    return false;
  }
  
  // COMPLECTATOR не может редактировать заказы поставщиков
  if (userRole === UserRole.COMPLECTATOR && documentType === 'supplier_order') {
    return false;
  }
  
  // EXECUTOR может работать только с заказами поставщиков
  if (userRole === UserRole.EXECUTOR && documentType !== 'supplier_order') {
    return false;
  }
  
  return true;
}

function canUserDeleteDocument(
  userRole: UserRole,
  documentCreatorId: string,
  userId: string
): boolean {
  // ADMIN может удалять все документы
  if (userRole === UserRole.ADMIN) {
    return true;
  }
  
  // Остальные пользователи могут удалять только свои документы
  return documentCreatorId === userId;
}

// Проверка прав на создание документов
export function canUserCreateDocument(
  userRole: UserRole,
  documentType: string
): boolean {
  // Неавторизованные пользователи не могут создавать документы
  if (!userRole) {
    return false;
  }

  switch (documentType) {
    case 'quote':
    case 'invoice':
    case 'order':
      return userRole === UserRole.ADMIN || userRole === UserRole.COMPLECTATOR;
    
    case 'supplier_order':
      return userRole === UserRole.ADMIN || userRole === UserRole.EXECUTOR;
    
    default:
      return false;
  }
}

// Проверка прав на редактирование клиентов
export function canUserEditClient(userRole: UserRole): boolean {
  // Неавторизованные пользователи не могут редактировать клиентов
  if (!userRole) {
    return false;
  }
  
  return userRole === UserRole.ADMIN || userRole === UserRole.COMPLECTATOR;
}

// Проверка прав на удаление клиентов
export function canUserDeleteClient(userRole: UserRole): boolean {
  // Неавторизованные пользователи не могут удалять клиентов
  if (!userRole) {
    return false;
  }
  
  return userRole === UserRole.ADMIN;
}

// Проверка прав на изменение статусов
// ВАЖНО: Статусы есть только у Order и SupplierOrder. Invoice и Quote не имеют статусов.
export function canUserChangeStatus(
  userRole: UserRole | string,
  documentType: string,
  currentStatus?: string,
  newStatus?: string
): boolean {
  // Неавторизованные пользователи не могут изменять статусы
  if (!userRole) {
    return false;
  }

  // Нормализуем роль к строке для сравнения (enum или строка -> строка)
  const roleStr = String(userRole).toLowerCase();

  switch (documentType) {
    case 'quote':
    case 'invoice':
      // Invoice и Quote не имеют статусов
      return false;
    
    case 'order':
      // Руководитель не может изменять статусы (только просмотр)
      if (roleStr === 'manager' || roleStr === 'руководитель') {
        return false;
      }
      
      // Комплектатор может менять Order только ДО NEW_PLANNED включительно
      // Может работать со статусом RETURNED_TO_COMPLECTATION
      if (roleStr === 'complectator') {
        const executorStatuses = ['NEW_PLANNED', 'UNDER_REVIEW', 'AWAITING_MEASUREMENT', 'AWAITING_INVOICE', 'READY_FOR_PRODUCTION', 'COMPLETED'];
        
        // Если текущий статус — статус исполнителя (кроме NEW_PLANNED), комплектатор не может его изменить
        if (currentStatus && executorStatuses.includes(currentStatus) && currentStatus !== 'NEW_PLANNED') {
          return false;
        }
        
        // Комплектатор может изменять только DRAFT, SENT, NEW_PLANNED (статус «Вернуть в комплектацию» недоступен комплектатору)
        const complectatorStatuses = ['DRAFT', 'SENT', 'NEW_PLANNED'];
        if (currentStatus && !complectatorStatuses.includes(currentStatus)) {
          return false;
        }
        
        // Разрешаем переходы: только DRAFT → SENT/CANCELLED, SENT → NEW_PLANNED/CANCELLED, NEW_PLANNED → CANCELLED
        if (currentStatus === 'DRAFT' && (newStatus === 'SENT' || newStatus === 'CANCELLED')) {
          return true;
        }
        if (currentStatus === 'SENT' && (newStatus === 'NEW_PLANNED' || newStatus === 'CANCELLED')) {
          return true;
        }
        if (currentStatus === 'NEW_PLANNED' && newStatus === 'CANCELLED') {
          return true;
        }
        
        return false;
      }
      
      // Исполнитель может изменять только статусы исполнителя
      // Может вернуть заказ в комплектацию (RETURNED_TO_COMPLECTATION) на любом этапе
      if (roleStr === 'executor') {
        const executorStatuses = ['NEW_PLANNED', 'UNDER_REVIEW', 'AWAITING_MEASUREMENT', 'AWAITING_INVOICE', 'READY_FOR_PRODUCTION', 'COMPLETED'];
        const complectatorStatuses = ['DRAFT', 'SENT'];
        
        // Если текущий статус - статус комплектатора (DRAFT, SENT), исполнитель не может его изменить
        if (currentStatus && complectatorStatuses.includes(currentStatus)) {
          return false;
        }
        
        // Исполнитель может изменять только статусы исполнителя и RETURNED_TO_COMPLECTATION
        if (currentStatus && !executorStatuses.includes(currentStatus) && currentStatus !== 'RETURNED_TO_COMPLECTATION') {
          return false;
        }
        
        // Исполнитель может вернуть заказ в комплектацию на любом этапе
        if (newStatus === 'RETURNED_TO_COMPLECTATION' && currentStatus && executorStatuses.includes(currentStatus)) {
          return true;
        }
        
        // Исполнитель может изменять статусы исполнителя
        if (currentStatus && executorStatuses.includes(currentStatus)) {
          return true;
        }
        
        return false;
      }
      
      // Администратор может изменять все статусы
      if (roleStr === 'admin') {
        return true;
      }
      
      return false;
    
    case 'supplier_order':
      return roleStr === 'admin' || roleStr === 'executor';
    
    default:
      return false;
  }
}
