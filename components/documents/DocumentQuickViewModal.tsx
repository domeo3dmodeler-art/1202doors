'use client';

import { useState, useEffect, useCallback } from 'react';
import { Modal } from '@/components/ui/Modal';
import HistoryModal from '@/components/ui/HistoryModal';
import CommentsModal from '@/components/ui/CommentsModal';
import { toast } from 'sonner';
import { Download, FileText, User, MapPin, Clock, X } from 'lucide-react';
import { clientLogger } from '@/lib/logging/client-logger';
import { getItemDisplayNameForExport } from '@/lib/export/display-names';
import { fetchWithAuth } from '@/lib/utils/fetch-with-auth';

interface DocumentQuickViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
}

interface DocumentData {
  id: string;
  number: string;
  type: string;
  status: string;
  totalAmount: number;
  subtotal?: number;
  createdAt: string;
  updatedAt: string;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    phone: string;
    address?: string;
  };
  items?: any[];
  quote_items?: any[];
  invoice_items?: any[];
  order_items?: any[];
  supplier_order_items?: any[];
}

export function DocumentQuickViewModal({ isOpen, onClose, documentId }: DocumentQuickViewModalProps) {
  const [document, setDocument] = useState<DocumentData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false);
  const [isDownloadingInvoice, setIsDownloadingInvoice] = useState(false);
  const [isDownloadingOrder, setIsDownloadingOrder] = useState(false);

  // Функция скачивания документа (счет, КП, заказ)
  const handleDownloadDocument = async (documentType: 'invoice' | 'quote' | 'order', format: 'pdf' | 'excel' | 'csv') => {
    if (!document) return;
    
    setIsDownloadingInvoice(true);
    try {
      // Получаем данные корзины из документа
      let cartData = [];
      if (document.type === 'quote' && document.quote_items) {
        cartData = document.quote_items;
      } else if (document.type === 'invoice' && document.invoice_items) {
        cartData = document.invoice_items;
      } else if (document.type === 'order' && document.order_items) {
        cartData = document.order_items;
      }

      if (cartData.length === 0) {
        toast.error('Нет данных для экспорта');
        return;
      }

      // Тот же API, что в окне заказа ЛК исполнителя
      const response = await fetchWithAuth('/api/export/fast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: documentType,
          format: format,
          clientId: document.client.id,
          items: cartData,
          totalAmount: document.totalAmount,
          parentDocumentId: document.parent_document_id,
          cartSessionId: document.cart_session_id
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Ошибка при скачивании документа');
      }

      // Получаем файл
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Получаем имя файла из заголовков ответа
      const contentDisposition = response.headers.get('content-disposition');
      let filename = `${documentType}.${format === 'excel' ? 'xlsx' : format}`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }
      
      // Создаем ссылку для скачивания (используем window.document для безопасности)
      const link = window.document.createElement('a');
      link.href = url;
      link.download = filename;
      window.document.body.appendChild(link);
      link.click();
      window.document.body.removeChild(link);
      
      // Освобождаем память
      window.URL.revokeObjectURL(url);
      
      // Получаем информацию о созданном документе из заголовков
      const documentId = response.headers.get('X-Document-Id');
      const documentNumber = response.headers.get('X-Document-Number');
      
      if (documentId && documentNumber) {
        toast.success(`Документ ${documentNumber} скачан успешно`);
      } else {
        toast.success(`Документ ${format === 'pdf' ? 'PDF' : format === 'excel' ? 'Excel' : 'CSV'} скачан успешно`);
      }
    } catch (error) {
      clientLogger.error('Ошибка скачивания:', error);
      toast.error(error instanceof Error ? error.message : 'Ошибка при скачивании документа');
    } finally {
      setIsDownloadingInvoice(false);
    }
  };

  // Функция скачивания заказа поставщику (Excel) - используем подход из ЛК Исполнителя
  const handleDownloadSupplierOrder = async () => {
    if (!document) return;
    
    setIsDownloadingOrder(true);
    try {
      // Получаем полные данные документа из API (как в ЛК Исполнителя)
      const documentResponse = await fetch(`/api/documents/${document.id}`);
      if (!documentResponse.ok) {
        throw new Error('Ошибка при получении данных документа');
      }
      
      const documentData = await documentResponse.json();
      
      // Извлекаем данные документа из обертки
      const documentInfo = documentData.document || documentData;
      
      // Ищем связанный Order - для Quote/Invoice через parent_document_id
      let orderId = null;
      
      // Если это заказ, используем его ID
      if (document.type === 'order') {
        orderId = document.id;
      } else {
        // Для Quote/Invoice ищем Order через parent_document_id
        // В новой логике Quote и Invoice создаются на основе Order,
        // поэтому их parent_document_id указывает на Order
        if (documentInfo.parent_document_id) {
          // Проверяем, что parent_document_id указывает на Order
          const orderCheckResponse = await fetch(`/api/orders/${documentInfo.parent_document_id}`);
          if (orderCheckResponse.ok) {
            orderId = documentInfo.parent_document_id;
          }
        }
        
        // Если Order не найден через parent_document_id, ищем для Invoice через order_id
        if (!orderId && documentInfo.order_id) {
          orderId = documentInfo.order_id;
        }
      }
      
      // Если у документа нет связанного Order, нельзя создать SupplierOrder
      // В новой логике Order должен быть создан первым из корзины
      if (!orderId) {
        throw new Error(`Для создания заказа у поставщика необходим заказ. Создайте заказ из корзины на основе этого документа.`);
      }

      // Создаем заказ у поставщика через API (как в ЛК Исполнителя)
      clientLogger.debug('📦 Document data:', documentData);
      clientLogger.debug('📦 Document:', documentInfo);
      clientLogger.debug('📦 Cart data:', documentInfo.cart_data);
      clientLogger.debug('📦 Document keys:', Object.keys(documentInfo));
      clientLogger.debug('📦 Document items:', documentInfo.items);
      
      // Получаем данные корзины из исходного документа
      let cartData = { items: [] };
      
      // Сначала пытаемся получить из cart_data документа
      if (documentInfo.cart_data) {
        try {
          cartData = JSON.parse(documentInfo.cart_data);
          clientLogger.debug('✅ Parsed cart data from document:', cartData);
        } catch (e) {
          clientLogger.error('❌ Error parsing cart_data:', e);
        }
      }
      
      // Если cart_data пустой, пытаемся получить данные из items документа
      if (!cartData.items || cartData.items.length === 0) {
        clientLogger.debug('📦 Trying to get items from document:', documentInfo);
        if (documentInfo.items && Array.isArray(documentInfo.items)) {
          cartData = { items: documentInfo.items };
          clientLogger.debug('✅ Using document.items as cart data:', cartData);
        }
      }
      
      // Если все еще пусто, получаем данные из связанного заказа
      if (!cartData.items || cartData.items.length === 0) {
        clientLogger.debug('📦 Trying to get cart data from related order...');
        try {
          // Используем унифицированный способ получения токена
          let token = localStorage.getItem('authToken');
          if (!token) {
            token = localStorage.getItem('token');
            if (token) {
              localStorage.setItem('authToken', token);
              localStorage.removeItem('token');
            }
          }
          const orderResponse = await fetch(`/api/orders/${orderId}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          if (orderResponse.ok) {
            const orderData = await orderResponse.json();
            clientLogger.debug('📦 Order data:', orderData);
            
            if (orderData.order && orderData.order.cart_data) {
              const orderCartData = JSON.parse(orderData.order.cart_data);
              cartData = orderCartData;
              clientLogger.debug('✅ Using order cart data:', cartData);
            }
          } else {
            clientLogger.warn('⚠️ Order API error:', orderResponse.status, orderResponse.statusText, '- продолжаем без данных заказа');
          }
        } catch (e) {
          clientLogger.warn('⚠️ Error getting order cart data:', e, '- продолжаем без данных заказа');
        }
      }
      
      clientLogger.debug('📦 Final cart data for supplier order:', cartData);
      clientLogger.debug('📦 Final cart data items count:', cartData.items ? cartData.items.length : 0);
      
      const response = await fetch(`${window.location.origin}/api/supplier-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: documentId,
          orderId: orderId, // Используем orderId как в ЛК Исполнителя
          supplierName: 'Поставщик по умолчанию',
          supplierEmail: '',
          supplierPhone: '',
          expectedDate: null,
          notes: `Создан на основе ${document.type === 'quote' ? 'КП' : document.type === 'invoice' ? 'счета' : 'заказа'} ${document.number}`,
          cartData: cartData
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Ошибка при создании заказа поставщику');
      }

      const result = await response.json();
      clientLogger.debug('✅ Supplier Order created:', result);

      // Проверяем, что заказ был создан успешно
      if (!result.supplierOrder || !result.supplierOrder.id) {
        throw new Error('Заказ поставщику не был создан или не содержит ID');
      }

      clientLogger.debug('📥 Скачиваем Excel для заказа:', result.supplierOrder.id);

      // Скачиваем Excel файл (как в ЛК Исполнителя)
      const excelResponse = await fetch(`/api/supplier-orders/${result.supplierOrder.id}/excel`);

      if (!excelResponse.ok) {
        const errorText = await excelResponse.text();
        clientLogger.error('Excel download error:', errorText);
        
        // Показываем пользователю более информативное сообщение
        toast.error(`Не удалось скачать Excel файл. Заказ создан с ID: ${result.supplierOrder.id}`);
        return; // Не выбрасываем ошибку, просто показываем уведомление
      }

      // Получаем файл и скачиваем (как в ЛК Исполнителя)
      const blob = await excelResponse.blob();
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = `Заказ_у_поставщика_${result.supplierOrder.id.slice(-6)}.xlsx`;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(a);
      
      toast.success('Excel файл успешно скачан');
    } catch (error) {
      clientLogger.error('Ошибка скачивания заказа поставщику:', error);
      toast.error(error instanceof Error ? error.message : 'Ошибка при скачивании заказа поставщику');
    } finally {
      setIsDownloadingOrder(false);
    }
  };

  const fetchDocument = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/documents/${documentId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.document) {
          setDocument(data.document);
        } else {
          toast.error('Ошибка при загрузке документа');
          onClose();
        }
      } else {
        toast.error('Ошибка при загрузке документа');
        onClose();
      }
    } catch (error) {
      clientLogger.error('Ошибка загрузки документа:', error);
      toast.error('Ошибка при загрузке документа');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [documentId, onClose]);

  useEffect(() => {
    if (isOpen && documentId) {
      fetchDocument();
    }
  }, [isOpen, documentId, fetchDocument]);

  const getStatusDisplayName = (status: string, type: string) => {
    const statusMap: Record<string, string> = {
      'DRAFT': 'Черновик',
      'SENT': 'Отправлен',
      'ACCEPTED': 'Согласован',
      'REJECTED': 'Отказ',
      'PAID': 'Оплачен/Заказ',
      'CANCELLED': 'Отменен',
      'IN_PRODUCTION': 'В производстве',
      'RECEIVED_FROM_SUPPLIER': 'Получен от поставщика',
      'COMPLETED': 'Исполнен',
      'PENDING': 'Ожидает',
    };
    return statusMap[status] || status;
  };

  const getStatusColor = (status: string, type: string) => {
    const colorMap: Record<string, string> = {
      'DRAFT': 'bg-gray-100 text-gray-800 border-gray-200',
      'SENT': 'bg-blue-100 text-blue-800 border-blue-200',
      'ACCEPTED': 'bg-green-100 text-green-800 border-green-200',
      'REJECTED': 'bg-red-100 text-red-800 border-red-200',
      'PAID': 'bg-green-100 text-green-800 border-green-200',
      'CANCELLED': 'bg-red-100 text-red-800 border-red-200',
      'IN_PRODUCTION': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'RECEIVED_FROM_SUPPLIER': 'bg-purple-100 text-purple-800 border-purple-200',
      'COMPLETED': 'bg-green-100 text-green-800 border-green-200',
      'PENDING': 'bg-orange-100 text-orange-800 border-orange-200',
    };
    return colorMap[status] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getItems = () => {
    if (!document) return [];
    
    // Получаем товары из соответствующих полей в зависимости от типа документа
    if (document.type === 'quote' && document.quote_items) {
      return document.quote_items;
    } else if (document.type === 'invoice' && document.invoice_items) {
      return document.invoice_items;
    } else if (document.type === 'order' && document.order_items) {
      return document.order_items;
    } else if (document.type === 'supplier_order' && document.supplier_order_items) {
      return document.supplier_order_items;
    } else if (document.items) {
      return document.items;
    }
    return [];
  };

  // Функция для очистки названия от артикула
  const cleanProductName = (name: string) => {
    if (!name) return '';
    
    return name
      // Удаляем все варианты артикула
      .replace(/\s*\|\s*Артикул\s*:\s*[^|]*/gi, '')
      .replace(/\s*\*\*Артикул:.*?\*\*/g, '')
      .replace(/\s*\*\*Артикул:.*$/g, '')
      .replace(/\s*Артикул:.*$/i, '')
      .replace(/\s*Артикул\s*:.*$/i, '')
      .replace(/\s*\|\s*Артикул\s*:.*$/i, '')
      .replace(/\s*\|\s*Артикул\s*:\s*.*$/i, '')
      .replace(/\s*\|\s*Артикул\s*:\s*N\/A.*$/i, '')
      .replace(/\s*\|\s*Артикул\s*:\s*N\/A$/i, '')
      .replace(/\s*\|\s*Артикул\s*:\s*N\/A\s*$/i, '')
      .replace(/\s*\|\s*Артикул\s*:\s*N\/A\s*\|.*$/i, '')
      // Дополнительные правила
      .replace(/\s*\|\s*Артикул\s*:\s*[^|]*$/gi, '')
      .replace(/\s*\|\s*Артикул\s*:\s*[^|]*\|/gi, '')
      .replace(/\s*\|\s*Артикул\s*:\s*[^|]*\s*$/gi, '')
      .trim();
  };

  if (!isOpen) return null;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title=""
        size="3xl"
      >
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : document ? (
          <div className="p-6">

            {/* Заголовок документа */}
            <div className="mb-4 pb-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span className="font-semibold text-base text-gray-900">
                    Счет {document.number}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(document.createdAt).toLocaleDateString('ru-RU')}
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(document.status, document.type)}`}>
                    {getStatusDisplayName(document.status, document.type)}
                  </span>
                  <span className="font-bold text-gray-900 text-base">
                    {document.totalAmount?.toLocaleString('ru-RU')} ₽
                  </span>
                </div>
              </div>
              
              {/* Табы */}
              <div className="flex items-center space-x-4">
                <button 
                  onClick={() => setIsCommentsModalOpen(true)}
                  className="flex items-center space-x-1 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  <div className="w-3 h-3 bg-green-100 rounded-sm flex items-center justify-center">
                    <FileText className="h-2 w-2 text-green-600" />
                  </div>
                  <span className="text-xs">Комментарии</span>
                </button>
                <button 
                  onClick={() => setIsHistoryModalOpen(true)}
                  className="flex items-center space-x-1 text-gray-600 hover:text-gray-800 transition-colors"
                >
                  <div className="w-3 h-3 bg-gray-100 rounded-full flex items-center justify-center">
                    <Clock className="h-2 w-2 text-gray-600" />
                  </div>
                  <span className="text-xs">История</span>
                </button>
              </div>
            </div>

            {/* Информация о клиенте */}
            <div className="mb-4 pb-4 border-b border-gray-200">
              {document.client ? (
                <>
                  <div className="flex items-center space-x-2">
                    <User className="h-3 w-3 text-gray-400" />
                    <span className="text-sm font-medium text-gray-900">
                      {document.client.lastName} {document.client.firstName} {document.client.middleName || ''}
                    </span>
                    {document.client.phone && (
                      <span className="text-xs text-gray-600">{document.client.phone}</span>
                    )}
                  </div>
                  {document.client.address && (
                    <div className="flex items-center space-x-1 mt-1 ml-5">
                      <MapPin className="h-3 w-3 text-gray-400" />
                      <span className="text-xs text-gray-600">{document.client.address}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-center space-x-2">
                  <User className="h-3 w-3 text-gray-400" />
                  <span className="text-sm text-gray-500">Клиент не указан</span>
                </div>
              )}
            </div>

            {/* Товары и услуги */}
            {getItems().length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-base font-semibold text-gray-900">Товары</h3>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleDownloadDocument('invoice', 'pdf')}
                      disabled={isDownloadingInvoice}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium py-1.5 px-3 rounded transition-colors disabled:opacity-50 flex items-center space-x-1"
                    >
                      <Download className="h-3 w-3" />
                      <span>{isDownloadingInvoice ? 'Скачивание...' : 'Скачать счет'}</span>
                    </button>
                    <button
                      onClick={() => handleDownloadSupplierOrder()}
                      disabled={isDownloadingOrder}
                      className="bg-green-600 hover:bg-green-700 text-white text-xs font-medium py-1.5 px-3 rounded transition-colors disabled:opacity-50 flex items-center space-x-1"
                    >
                      <Download className="h-3 w-3" />
                      <span>{isDownloadingOrder ? 'Скачивание...' : 'Скачать заказ'}</span>
                    </button>
                  </div>
                </div>
                
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr className="text-xs text-gray-500 uppercase tracking-wide">
                        <th className="px-2 py-3 text-center w-8 text-xs font-medium">№</th>
                        <th className="px-4 py-3 text-left text-xs font-medium">Наименование</th>
                        <th className="px-2 py-3 text-center w-16 text-xs font-medium">Кол-во</th>
                        <th className="px-2 py-3 text-right w-20 text-xs font-medium">Цена</th>
                        <th className="px-4 py-3 text-right w-24 text-xs font-medium">Сумма</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {getItems().map((item: any, index: number) => {
                        const quantity = item.quantity || item.qty || 1;
                        const unitPrice = item.unit_price || item.price || 0;
                        const totalPrice = quantity * unitPrice;
                        // Единое наименование товара для всех ЛК (как в экспорте)
                        const rawProductName = getItemDisplayNameForExport(item);
                        const cleanName = cleanProductName(rawProductName);
                        
                        // Добавляем номер строки
                        const rowNumber = index + 1;
                        
                        return (
                          <tr key={index} className="hover:bg-gray-50">
                            <td className="px-2 py-3 text-center text-sm text-gray-900 font-medium">
                              {rowNumber}
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-gray-900 leading-tight">
                                {(() => {
                                  // Разделяем название на основную часть и характеристики
                                  const parts = cleanName.split(' (');
                                  if (parts.length > 1) {
                                    const mainName = parts[0];
                                    let characteristics = '(' + parts.slice(1).join(' (');
                                    
                                    return (
                                      <>
                                        <div className="font-semibold text-sm">
                                          {mainName}
                                        </div>
                                        <div className="text-gray-600 text-xs mt-1">{characteristics}</div>
                                      </>
                                    );
                                  }
                                  // Если нет характеристик в скобках, показываем только одну строку
                                  return <div className="font-semibold text-sm">{cleanName}</div>;
                                })()}
                              </div>
                            </td>
                            <td className="px-2 py-3 text-center text-sm text-gray-900 font-medium">
                              {quantity}
                            </td>
                            <td className="px-2 py-3 text-right text-sm text-gray-900">
                              {unitPrice.toLocaleString('ru-RU')} ₽
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                              {totalPrice.toLocaleString('ru-RU')} ₽
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  
                  {/* Итого */}
                  <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
                    <div className="flex justify-end">
                      <span className="text-base font-bold text-gray-900">
                        Итого: {document.totalAmount?.toLocaleString('ru-RU')} ₽
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}


          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">Документ не найден</p>
          </div>
        )}
      </Modal>

      {/* Модальное окно истории */}
      {document && (
        <HistoryModal
          isOpen={isHistoryModalOpen}
          onClose={() => setIsHistoryModalOpen(false)}
          documentId={document.id}
          documentType={document.type}
          documentNumber={document.number}
        />
      )}

      {/* Модальное окно комментариев */}
      {document && (
        <CommentsModal
          isOpen={isCommentsModalOpen}
          onClose={() => setIsCommentsModalOpen(false)}
          documentId={document.id}
          documentType={document.type}
          documentNumber={document.number}
        />
      )}
    </>
  );
}

export default DocumentQuickViewModal;