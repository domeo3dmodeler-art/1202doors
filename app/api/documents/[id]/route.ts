import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { canUserPerformAction } from '@/lib/auth/permissions';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, withErrorHandling } from '@/lib/api/response';
import { NotFoundError, ForbiddenError, BusinessRuleError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';
import { deleteDocumentCommentsAndHistory } from '@/lib/documents/delete-document-relations';

// GET /api/documents/[id] - Получение документа по ID
async function getHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  
  logger.debug(`Получение документа ${id}`, 'documents/[id]/GET', { documentId: id, userId: user.userId }, loggingContext);

    // Ищем документ в разных таблицах
    let document = null;
    let documentType = null;

    // Проверяем в таблице quotes
    const quote = await prisma.quote.findUnique({
      where: { id },
      include: {
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            phone: true,
            address: true
          }
        },
        quote_items: true
      }
    });

    if (quote) {
      document = quote;
      documentType = 'quote';
    } else {
      // Проверяем в таблице invoices
      const invoice = await prisma.invoice.findUnique({
        where: { id },
        include: {
          client: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              middleName: true,
              phone: true,
              address: true
            }
          },
          invoice_items: true
        }
      });

      if (invoice) {
        document = invoice;
        documentType = 'invoice';
      } else {
        // Проверяем в таблице orders
        const order = await prisma.order.findUnique({
          where: { id },
          include: {
            client: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                middleName: true,
                phone: true,
                address: true
              }
            }
          }
        });

        if (order) {
          document = order;
          documentType = 'order';
        } else {
          // Проверяем в таблице supplierOrders
          // SupplierOrder не имеет прямой связи с client, получаем через Invoice
          const supplierOrder = await prisma.supplierOrder.findUnique({
            where: { id }
          });

          if (supplierOrder) {
            // Получаем клиента через связанный Invoice
            let client = null;
            if (supplierOrder.parent_document_id) {
              const invoice = await prisma.invoice.findUnique({
                where: { id: supplierOrder.parent_document_id },
                include: {
                  client: {
                    select: {
                      id: true,
                      firstName: true,
                      lastName: true,
                      middleName: true,
                      phone: true,
                      address: true
                    }
                  }
                }
              });
              
              if (invoice && invoice.client) {
                client = invoice.client;
              }
            }
            
            // Добавляем клиента к документу
            document = {
              ...supplierOrder,
              client
            };
            documentType = 'supplier_order';
          }
        }
      }
    }

  if (!document) {
    throw new NotFoundError('Документ', id);
  }

  // Проверяем права доступа
  const permissionMap: Record<string, string> = {
    'quote': 'quotes.read',
    'invoice': 'invoices.read', 
    'order': 'orders.read',
    'supplier_order': 'supplier_orders.read'
  };
  
  const requiredPermission = permissionMap[documentType as string];
  if (!requiredPermission) {
    throw new BusinessRuleError('Неизвестный тип документа');
  }

  // Проверяем права через canUserPerformAction с правильным разрешением
  if (!canUserPerformAction(user.role as import('@/lib/auth/roles').UserRole, requiredPermission)) {
    throw new ForbiddenError('Недостаточно прав для просмотра документа');
  }

  return apiSuccess({
    document: {
      ...document,
      type: documentType,
      totalAmount: document.total_amount,
      createdAt: document.created_at,
      updatedAt: document.updated_at,
      content: (document as unknown as { content?: string }).content ? (() => {
        try {
          return JSON.parse((document as unknown as { content: string }).content);
        } catch (e) {
          logger.warn('Failed to parse document.content as JSON', 'documents/[id]/GET', { documentId: id, error: e }, loggingContext);
          return (document as unknown as { content: string }).content;
        }
      })() : null,
      documentData: (document as unknown as { documentData?: string }).documentData ? (() => {
        try {
          return JSON.parse((document as unknown as { documentData: string }).documentData!);
        } catch (e) {
          logger.warn('Failed to parse document.documentData as JSON', 'documents/[id]/GET', { documentId: id, error: e }, loggingContext);
          return (document as unknown as { documentData: string }).documentData;
        }
      })() : null
    }
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth(async (request: NextRequest, user: AuthenticatedUser) => {
      return await getHandler(request, user, { params });
    }),
    'documents/[id]/GET'
  )(req);
}

// DELETE /api/documents/[id] - Удаление документа
async function deleteHandler(
  req: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { id } = await params;
  
  logger.debug(`Удаление документа ${id}`, 'documents/[id]/DELETE', { documentId: id, userId: user.userId }, loggingContext);

  // Ищем документ в разных таблицах
  let document: any = null;
  let documentType: string | null = null;

  // Проверяем в таблице счетов
  const invoice = await prisma.invoice.findUnique({
    where: { id }
  });

  if (invoice) {
    document = invoice;
    documentType = 'invoice';
  } else {
    // Проверяем в таблице КП
    const quote = await prisma.quote.findUnique({
      where: { id }
    });

    if (quote) {
      document = quote;
      documentType = 'quote';
    } else {
      // Проверяем в таблице заказов
      const order = await prisma.order.findUnique({
        where: { id }
      });

      if (order) {
        document = order;
        documentType = 'order';
      } else {
        // Проверяем в таблице заказов поставщиков
        const supplierOrder = await prisma.supplierOrder.findUnique({
          where: { id }
        });

        if (supplierOrder) {
          document = supplierOrder;
          documentType = 'supplier_order';
        }
      }
    }
  }

  if (!document) {
    throw new NotFoundError('Документ', id);
  }

  // Проверяем возможность удаления по статусу (только DRAFT или CANCELLED можно удалять)
  const deletableStatuses = ['DRAFT', 'CANCELLED'];
  if (document.status && !deletableStatuses.includes(document.status)) {
    throw new BusinessRuleError('Документ нельзя удалить в текущем статусе', {
      currentStatus: document.status,
      documentType: documentType
    });
  }

  // Проверяем права на удаление (включая авторство)
  if (!canUserPerformAction(user.role as import('@/lib/auth/roles').UserRole, 'DELETE', documentType || undefined, document.status, (document as { created_by?: string }).created_by, user.userId)) {
    throw new ForbiddenError('Недостаточно прав для удаления документа');
  }

  // Проверяем наличие дочерних документов
  let hasChildren = false;
  if (documentType === 'quote') {
    const childInvoices = await prisma.invoice.count({
      where: { parent_document_id: id }
    });
    hasChildren = childInvoices > 0;
  } else if (documentType === 'invoice') {
    const childOrders = await prisma.order.count({
      where: { parent_document_id: id }
    });
    const relatedOrder = await prisma.order.findFirst({
      where: { invoice_id: id }
    });
    hasChildren = childOrders > 0 || !!relatedOrder;
  } else if (documentType === 'order') {
    const childSupplierOrders = await prisma.supplierOrder.count({
      where: { parent_document_id: id }
    });
    const relatedInvoice = await prisma.invoice.findFirst({
      where: { order_id: id }
    });
    hasChildren = childSupplierOrders > 0 || !!relatedInvoice;
  } else if (documentType === 'supplier_order') {
    hasChildren = false;
  }

  if (hasChildren) {
    logger.warn('Attempt to delete document with children', 'documents/[id]/DELETE', { 
      documentId: id, 
      documentType 
    }, loggingContext);
    throw new BusinessRuleError('Нельзя удалить документ, у которого есть дочерние документы');
  }

  // Удаляем документ
  let deletedDocument;
  if (documentType === 'invoice') {
    const relatedOrder = await prisma.order.findFirst({
      where: { invoice_id: id }
    });
    if (relatedOrder) {
      await prisma.order.update({
        where: { id: relatedOrder.id },
        data: { invoice_id: null }
      });
      logger.debug('Cleared invoice_id from Order', 'documents/[id]/DELETE', { orderId: relatedOrder.id }, loggingContext);
    }
    await deleteDocumentCommentsAndHistory(id);
    deletedDocument = await prisma.invoice.delete({
      where: { id }
    });
  } else if (documentType === 'quote') {
    await deleteDocumentCommentsAndHistory(id);
    deletedDocument = await prisma.quote.delete({
      where: { id }
    });
  } else if (documentType === 'order') {
    const relatedInvoice = await prisma.invoice.findFirst({
      where: { order_id: id }
    });
    if (relatedInvoice) {
      await prisma.invoice.update({
        where: { id: relatedInvoice.id },
        data: { order_id: null }
      });
      logger.debug('Cleared order_id from Invoice', 'documents/[id]/DELETE', { invoiceId: relatedInvoice.id }, loggingContext);
    }
    await deleteDocumentCommentsAndHistory(id);
    deletedDocument = await prisma.order.delete({
      where: { id }
    });
  } else if (documentType === 'supplier_order') {
    await deleteDocumentCommentsAndHistory(id);
    deletedDocument = await prisma.supplierOrder.delete({
      where: { id }
    });
  }

  logger.info(`Документ ${id} удален пользователем ${user.userId}`, 'documents/[id]/DELETE', { documentId: id, userId: user.userId }, loggingContext);

  return apiSuccess(
    { document: deletedDocument },
    'Документ успешно удален'
  );
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth(async (request: NextRequest, user: AuthenticatedUser) => {
      return await deleteHandler(request, user, { params });
    }),
    'documents/[id]/DELETE'
  )(req);
}