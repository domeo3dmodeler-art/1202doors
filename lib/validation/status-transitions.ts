// lib/validation/status-transitions.ts
// Валидация переходов статусов документов согласно правилам системы
// ВАЖНО: Статусы есть только у Order и SupplierOrder. Invoice и Quote не имеют статусов.

export const STATUS_TRANSITIONS = {
  order: {
    'DRAFT': ['SENT', 'CANCELLED'],
    'SENT': ['NEW_PLANNED', 'CANCELLED'],
    'NEW_PLANNED': ['UNDER_REVIEW', 'CANCELLED', 'RETURNED_TO_COMPLECTATION'],
    // PAID отображается как NEW_PLANNED для исполнителя, поэтому имеет те же переходы
    'PAID': ['UNDER_REVIEW', 'CANCELLED', 'RETURNED_TO_COMPLECTATION'],
    'UNDER_REVIEW': ['AWAITING_MEASUREMENT', 'AWAITING_INVOICE', 'CANCELLED', 'RETURNED_TO_COMPLECTATION'],
    'AWAITING_MEASUREMENT': ['AWAITING_INVOICE', 'CANCELLED', 'RETURNED_TO_COMPLECTATION'],
    'AWAITING_INVOICE': ['AWAITING_MEASUREMENT', 'READY_FOR_PRODUCTION', 'CANCELLED', 'RETURNED_TO_COMPLECTATION'],
    'READY_FOR_PRODUCTION': ['COMPLETED', 'CANCELLED', 'RETURNED_TO_COMPLECTATION'],
    'COMPLETED': [],
    'RETURNED_TO_COMPLECTATION': ['DRAFT', 'SENT', 'NEW_PLANNED'],
    'CANCELLED': []
  },
  supplier_order: {
    'PENDING': ['ORDERED', 'CANCELLED'],
    'ORDERED': ['RECEIVED_FROM_SUPPLIER', 'CANCELLED'],
    'RECEIVED_FROM_SUPPLIER': ['COMPLETED', 'CANCELLED'],
    'COMPLETED': [],
    'CANCELLED': []
  }
};

export function canTransitionTo(
  documentType: string,
  currentStatus: string,
  newStatus: string
): boolean {
  const transitions = STATUS_TRANSITIONS[documentType as keyof typeof STATUS_TRANSITIONS];
  if (!transitions) return false;
  
  const allowedTransitions = transitions[currentStatus as keyof typeof transitions] as string[] | undefined;
  return allowedTransitions?.includes(newStatus) || false;
}

export function getValidTransitions(
  documentType: string,
  currentStatus: string
): string[] {
  const transitions = STATUS_TRANSITIONS[documentType as keyof typeof STATUS_TRANSITIONS];
  if (!transitions) return [];
  
  return transitions[currentStatus as keyof typeof transitions] || [];
}

// Проверка возможности редактирования документа
export function canEditDocument(
  documentType: string,
  documentStatus: string
): boolean {
  // Документы можно редактировать только в статусе DRAFT
  return documentStatus === 'DRAFT';
}

// Проверка возможности удаления документа
export function canDeleteDocument(
  documentType: string,
  documentStatus: string
): boolean {
  // Документы можно удалять только в статусе DRAFT или CANCELLED
  return documentStatus === 'DRAFT' || documentStatus === 'CANCELLED';
}
