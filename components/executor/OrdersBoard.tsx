'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, Button } from '../ui';
import { 
  FileText, 
  Upload, 
  CheckCircle, 
  Clock, 
  AlertCircle,
  MoreVertical,
  Download,
  Search,
  BadgeCheck,
  XCircle,
  File,
  FileCheck,
  Trash2,
  StickyNote,
  History
} from 'lucide-react';
import { toast } from 'sonner';
import { ORDER_STATUSES_EXECUTOR, getStatusLabel } from '@/lib/utils/document-statuses';
import { getOrderDisplayStatus, getExecutorOrderStatus } from '@/lib/utils/order-status-display';
import { getValidTransitions } from '@/lib/validation/status-transitions';
import { clientLogger } from '@/lib/logging/client-logger';
import { fetchWithAuth } from '@/lib/utils/fetch-with-auth';
import { parseApiResponse } from '@/lib/utils/parse-api-response';
import HistoryModal from '@/components/ui/HistoryModal';
import CommentsModal from '@/components/ui/CommentsModal';
import { getItemDisplayNameForExport } from '@/lib/export/display-names';

// Вспомогательная функция для извлечения оригинального имени файла из URL
const getOriginalFileName = (fileUrl: string): string => {
  try {
    const urlObj = new URL(fileUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
    const originalName = urlObj.searchParams.get('original');
    if (originalName) {
      return decodeURIComponent(originalName);
    }
  } catch (e) {
    // Игнорируем ошибки парсинга URL
  }
  // Если нет query параметра, пытаемся извлечь из имени файла
  const fileName = fileUrl.split('/').pop()?.split('?')[0] || '';
  // Ищем паттерны: project_timestamp_originalname, wholesale_invoice_timestamp_originalname, tech_spec_timestamp_originalname
  const match = fileName.match(/^(?:project|wholesale_invoice|tech_spec)_\d+_(.+)$/);
  if (match && match[1]) {
    return match[1];
  }
  return fileName || 'Файл';
};

// Статусы заказов для исполнителя - используем единый источник истины
const ORDER_STATUSES = {
  NEW_PLANNED: { label: ORDER_STATUSES_EXECUTOR.NEW_PLANNED.label, color: 'bg-gray-100 text-gray-800', icon: FileText },
  UNDER_REVIEW: { label: ORDER_STATUSES_EXECUTOR.UNDER_REVIEW.label, color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  AWAITING_MEASUREMENT: { label: ORDER_STATUSES_EXECUTOR.AWAITING_MEASUREMENT.label, color: 'bg-orange-100 text-orange-800', icon: AlertCircle },
  AWAITING_INVOICE: { label: ORDER_STATUSES_EXECUTOR.AWAITING_INVOICE.label, color: 'bg-blue-100 text-blue-800', icon: Upload },
  READY_FOR_PRODUCTION: { label: ORDER_STATUSES_EXECUTOR.READY_FOR_PRODUCTION.label, color: 'bg-purple-100 text-purple-800', icon: BadgeCheck },
  COMPLETED: { label: ORDER_STATUSES_EXECUTOR.COMPLETED.label, color: 'bg-green-100 text-green-800', icon: CheckCircle },
  RETURNED_TO_COMPLECTATION: { label: ORDER_STATUSES_EXECUTOR.RETURNED_TO_COMPLECTATION.label, color: 'bg-red-100 text-red-800', icon: XCircle }
} as const;

interface Order {
  id: string;
  number: string;
  client_id: string;
  invoice_id: string | null;
  lead_number: string | null;
  complectator_id: string | null;
  complectator_name: string | null;
  executor_id: string | null;
  status: string; // Может быть PAID или статусы исполнителя
  project_file_url: string | null;
  door_dimensions: any[] | null;
  measurement_done: boolean;
  project_complexity: string | null;
  wholesale_invoices: string[];
  technical_specs: string[];
  verification_status: string | null;
  verification_notes: string | null;
  notes: string | null;
  cart_data?: any;
  cart_session_id?: string | null;
  total_amount?: number | null;
  created_at: string;
  updated_at: string;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    middleName: string | null;
    phone: string;
    address: string;
    fullName: string;
  };
  invoice: {
    id: string;
    number: string;
    status: string;
    total_amount: number;
    cart_data?: any;
  } | null;
}

interface OrdersBoardProps {
  executorId: string;
  /** Поиск в шапке (если передан — свой блок поиска не показывается) */
  searchQuery?: string;
  onSearchQueryChange?: (value: string) => void;
}

export function OrdersBoard({ executorId, searchQuery: searchQueryProp, onSearchQueryChange }: OrdersBoardProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState<keyof typeof ORDER_STATUSES | 'all'>('all');
  const [internalSearch, setInternalSearch] = useState('');
  const searchQuery = searchQueryProp !== undefined ? searchQueryProp : internalSearch;
  const setSearchQuery = onSearchQueryChange ?? setInternalSearch;
  const searchInHeader = searchQueryProp !== undefined;
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showOrderDetail, setShowOrderDetail] = useState(false);

  // Загрузка заказов
  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetchWithAuth(`/api/orders?executor_id=${executorId}`);
      
      if (response.ok) {
        const data = await response.json();
        const parsedData = parseApiResponse<{ orders: Order[] }>(data);
        setOrders(parsedData.orders || []);
      } else {
        toast.error('Ошибка загрузки заказов');
      }
    } catch (error) {
      clientLogger.error('Error fetching orders', error);
      toast.error('Ошибка загрузки заказов');
    } finally {
      setLoading(false);
    }
  }, [executorId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // Фильтрация заказов по статусу и поиску
  const filteredOrders = useMemo(() => {
    let filtered = orders;

    // Фильтр по статусу
    if (activeStatus !== 'all') {
      filtered = filtered.filter(order => {
        // Маппим PAID в NEW_PLANNED для Исполнителя
        const executorStatus = getExecutorOrderStatus(order.status);
        return executorStatus === activeStatus;
      });
    }

    // Фильтр по поиску
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order => 
        order.number.toLowerCase().includes(query) ||
        order.client.fullName.toLowerCase().includes(query) ||
        order.client.address.toLowerCase().includes(query) ||
        (order.lead_number && order.lead_number.toLowerCase().includes(query)) ||
        (order.complectator_name && order.complectator_name.toLowerCase().includes(query))
      );
    }

    return filtered;
  }, [orders, activeStatus, searchQuery]);

  // Подсчет заказов по статусам (с учетом маппинга PAID → NEW_PLANNED)
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    
    Object.keys(ORDER_STATUSES).forEach(status => {
      counts[status] = orders.filter(order => {
        const executorStatus = getExecutorOrderStatus(order.status);
        return executorStatus === status;
      }).length;
    });

    return counts;
  }, [orders]);

  // Форматирование даты
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
  };

  // Открытие детального вида заказа
  const handleOrderClick = (order: Order) => {
    setSelectedOrder(order);
    setShowOrderDetail(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black"></div>
      </div>
    );
  }

  return (
    <div className="space-y-3 min-w-0">
      {!searchInHeader && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder="Поиск по номеру заказа, клиенту, адресу..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
          />
        </div>
      )}

      {/* Вкладки статусов */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveStatus('all')}
          className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors flex items-center gap-1.5 ${
            activeStatus === 'all'
              ? 'border-black bg-black text-white'
              : 'border-gray-300 text-gray-700 hover:border-black hover:bg-gray-50'
          }`}
        >
          <span>Все</span>
          {orders.length > 0 && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
              activeStatus === 'all' ? 'bg-white/20' : 'bg-gray-100'
            }`}>
              {orders.length}
            </span>
          )}
        </button>
        {Object.entries(ORDER_STATUSES)
          .filter(([, config]) => config && config.icon != null)
          .map(([status, config]) => {
            if (!config || !config.icon) return null;
            const count = statusCounts[status];
            const Icon = config.icon;
            const isActive = activeStatus === status;
            
            return (
              <button
                key={status}
                onClick={() => setActiveStatus(status as keyof typeof ORDER_STATUSES)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors flex items-center gap-1.5 ${
                  isActive
                    ? 'border-black bg-black text-white'
                    : 'border-gray-300 text-gray-700 hover:border-black hover:bg-gray-50'
                }`}
                title={config.label}
              >
                <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                <span className="truncate max-w-[200px]">{config.label}</span>
                {count > 0 && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] flex-shrink-0 ${
                    isActive ? 'bg-white/20' : 'bg-gray-100'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })
          .filter(Boolean)}
      </div>

      {/* Таблица заказов - компактная */}
      <Card variant="base" className="overflow-hidden">
        <div className="overflow-x-auto -mx-4">
          <div className="px-4">
            <table className="w-full table-auto border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">
                    ДАТА
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">
                    ЛИД
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">
                    КОМПЛЕКТАТОР
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">
                    ФИО КЛИЕНТА
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">
                    АДРЕС
                  </th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap min-w-[90px]">
                    СУММА
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-gray-700 uppercase tracking-wider whitespace-nowrap">
                    СТАТУС
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center">
                        <FileText className="h-10 w-10 text-gray-300 mb-2" />
                        <p className="text-sm font-medium">{searchQuery ? 'Заказы не найдены' : 'Нет заказов'}</p>
                        {searchQuery && (
                          <p className="text-xs text-gray-400 mt-1">Попробуйте изменить параметры поиска</p>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredOrders
                    .map((order) => {
                      // Маппим PAID в NEW_PLANNED для Исполнителя
                      const executorStatus = getExecutorOrderStatus(order.status) as keyof typeof ORDER_STATUSES;
                      const statusConfig = ORDER_STATUSES[executorStatus];
                      if (!statusConfig || !statusConfig.icon) return null;
                      const StatusIcon = statusConfig.icon;
                      
                      return (
                        <tr
                          key={order.id}
                          className="hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => handleOrderClick(order)}
                        >
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-900 font-medium">
                            {formatDate(order.created_at)}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">
                            {order.lead_number || <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-600">
                            <div className="max-w-[100px] truncate" title={order.complectator_name || ''}>
                              {order.complectator_name || <span className="text-gray-400">—</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-900 font-medium">
                            <div className="max-w-[180px] truncate" title={order.client.fullName}>
                              {order.client.fullName}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-600">
                            <div className="max-w-[200px] truncate" title={order.client.address}>
                              {order.client.address}
                            </div>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-right text-xs font-medium text-gray-900 tabular-nums">
                            {(order.total_amount ?? order.invoice?.total_amount) != null
                              ? `${Number(order.total_amount ?? order.invoice?.total_amount).toLocaleString('ru-RU')} ₽`
                              : '—'}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${statusConfig.color}`} title={statusConfig.label}>
                              <StatusIcon className="h-3 w-3 mr-1 flex-shrink-0" />
                              <span className="truncate max-w-[160px]">{statusConfig.label}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })
                    .filter(Boolean)
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {/* Модальное окно детального вида заказа */}
      {showOrderDetail && selectedOrder && (
        <OrderDetailModal
          order={selectedOrder}
          onClose={() => {
            setShowOrderDetail(false);
            setSelectedOrder(null);
          }}
          onUpdate={fetchOrders}
        />
      )}
    </div>
  );
}

// Компонент модального окна детального вида заказа
function OrderDetailModal({
  order,
  onClose,
  onUpdate
}: {
  order: Order;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [currentOrder, setCurrentOrder] = useState(order);
  const [showStatusChangeModal, setShowStatusChangeModal] = useState(false);
  const [showProjectUpload, setShowProjectUpload] = useState(false);
  const [showFilesUpload, setShowFilesUpload] = useState(false);
  const [projectFile, setProjectFile] = useState<File | null>(null);
  const [showTechSpecsUpload, setShowTechSpecsUpload] = useState(false);
  const [techSpecsFiles, setTechSpecsFiles] = useState<File[]>([]);
  const [wholesaleInvoices, setWholesaleInvoices] = useState<File[]>([]);
  // Инициализируем newStatus с маппированным статусом для исполнителя
  const getInitialStatus = (orderStatus: string) => {
    const executorStatus = getExecutorOrderStatus(orderStatus);
    return executorStatus;
  };
  
  const [newStatus, setNewStatus] = useState<string>(getInitialStatus(order.status));
  
  // Обновляем newStatus при изменении currentOrder (используем маппированный статус)
  useEffect(() => {
    if (currentOrder) {
      const executorStatus = getExecutorOrderStatus(currentOrder.status);
      setNewStatus(executorStatus);
    }
  }, [currentOrder.status]);
  const [requireMeasurement, setRequireMeasurement] = useState(false);
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);
  const [supplierOrders, setSupplierOrders] = useState<any[]>([]);
  const [productsInfo, setProductsInfo] = useState<Map<string, { id: string; name: string; isHandle: boolean }>>(new Map());
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false);
  
  // Загрузка заказов у поставщика
  const fetchSupplierOrders = useCallback(async () => {
    if (!order.id) return;
    try {
      const response = await fetchWithAuth(`/api/supplier-orders?orderId=${order.id}`);
      if (response.ok) {
        const data = await response.json();
        const parsedData = parseApiResponse<{ supplierOrders: any[] }>(data);
        setSupplierOrders(parsedData.supplierOrders || []);
      }
    } catch (error) {
      clientLogger.error('Error fetching supplier orders', error);
    }
  }, [order.id]);

  useEffect(() => {
    fetchSupplierOrders();
  }, [fetchSupplierOrders]);

  // При открытии модалки загружаем полный заказ (с invoice.cart_data), чтобы товары и экспорт Excel имели актуальные данные
  const loadFullOrder = useCallback(async () => {
    if (!order?.id) return;
    const orderId = order.id;
    try {
      const response = await fetchWithAuth(`/api/orders/${orderId}`);
      if (!response.ok) return;
      const data = await response.json();
      const parsedData = parseApiResponse<{ order?: any }>(data);
      const orderData = parsedData && typeof parsedData === 'object' && 'order' in parsedData
        ? (parsedData as { order?: any }).order
        : null;
      if (orderData && orderData.id === orderId) {
        setCurrentOrder(orderData);
      }
    } catch (e) {
      clientLogger.error('Error loading full order for modal', e);
    }
  }, [order?.id]);

  useEffect(() => {
    if (order?.id) {
      loadFullOrder();
    }
  }, [order?.id, loadFullOrder]);

  // Загрузка информации о товарах из БД (для определения ручек)
  const fetchProductsInfo = useCallback(async (items: any[]) => {
    if (!items || items.length === 0) return;
    
    const productIds = new Set<string>();
    items.forEach((item: any) => {
      // Собираем все возможные ID товаров
      if (item.handleId) productIds.add(item.handleId);
      if (item.product_id) productIds.add(item.product_id);
      if (item.id) productIds.add(item.id);
    });
    
    if (productIds.size === 0) return;
    
    try {
      // Загружаем информацию о товарах через API
      const response = await fetchWithAuth(`/api/products/batch-info?ids=${Array.from(productIds).join(',')}`);
      if (response.ok) {
        const data = await response.json();
        const parsedData = parseApiResponse<{ products: any[] }>(data);
        const infoMap = new Map<string, { id: string; name: string; isHandle: boolean }>();
        if (parsedData.products) {
          parsedData.products.forEach((product: any) => {
            infoMap.set(product.id, {
              id: product.id,
              name: product.name || '',
              isHandle: product.isHandle || false
            });
          });
        }
        setProductsInfo(infoMap);
      }
    } catch (error) {
      clientLogger.error('Error fetching products info', error);
    }
  }, []);

  // Очистка названия товара от артикула
  const cleanProductName = (name: string) => {
    if (!name) return '';
    return name
      .replace(/\s*\|\s*Артикул\s*:\s*[^|]*/gi, '')
      .replace(/\s*\*\*Артикул:.*?\*\*/g, '')
      .replace(/\s*Артикул:.*$/i, '')
      .trim();
  };

  // Загружаем информацию о товарах после загрузки заказа
  useEffect(() => {
    if (currentOrder) {
      const sourceCartData = currentOrder.invoice?.cart_data || currentOrder.cart_data;
      if (sourceCartData) {
        try {
          const cartData = typeof sourceCartData === 'string' ? JSON.parse(sourceCartData) : sourceCartData;
          const items = cartData.items || (Array.isArray(cartData) ? cartData : []);
          if (items.length > 0) {
            fetchProductsInfo(items);
          }
        } catch (e) {
          // Игнорируем ошибки парсинга
        }
      }
    }
  }, [currentOrder, fetchProductsInfo]);
  
  // Экспорт счета в PDF (использует механизм экспорта из корзины с дедубликацией)
  const handleExportInvoicePDF = async () => {
    try {
      setLoading(true);
      
      // Получаем данные корзины из заказа или счета
      let cartData;
      let items: any[] = [];
      
      // Сначала пробуем получить из invoice.cart_data, если нет - из order.cart_data
      const sourceCartData = currentOrder.invoice?.cart_data || currentOrder.cart_data;
      
      if (sourceCartData) {
        try {
          cartData = typeof sourceCartData === 'string' 
            ? JSON.parse(sourceCartData) 
            : sourceCartData;
          const rawItems = cartData.items || (Array.isArray(cartData) ? cartData : []);
          items = rawItems.map((item: any) => ({
            id: item.id || item.productId,
            productId: item.productId || item.id,
            name: item.name || item.model,
            model: item.model || item.name,
            model_name: item.model_name,
            qty: item.qty ?? item.quantity ?? 1,
            quantity: item.qty ?? item.quantity ?? 1,
            unitPrice: item.unitPrice ?? item.price ?? 0,
            price: item.unitPrice ?? item.price ?? 0,
            width: item.width,
            height: item.height,
            color: item.color,
            finish: item.finish,
            style: item.style,
            type: item.type ?? item.itemType ?? undefined,
            itemType: item.itemType ?? item.type ?? undefined,
            sku_1c: item.sku_1c,
            handleId: item.handleId,
            handleName: item.handleName,
            limiterId: item.limiterId,
            limiterName: item.limiterName,
            hardwareKitId: item.hardwareKitId,
            hardwareKitName: item.hardwareKitName ?? item.hardware,
            optionIds: item.optionIds,
            architraveNames: item.architraveNames,
            optionNames: item.optionNames,
            edge: item.edge,
            edgeColorName: item.edgeColorName ?? item.edge_color_name,
            glassColor: item.glassColor ?? item.glass_color,
            reversible: item.reversible,
            mirror: item.mirror,
            threshold: item.threshold
          }));
        } catch (parseError) {
          clientLogger.error('Error parsing cart_data', parseError);
        }
      }
      
      if (items.length === 0) {
        toast.error('Нет данных корзины для экспорта');
        return;
      }
      
      // Вычисляем общую сумму
      const totalAmount = currentOrder.invoice?.total_amount || currentOrder.total_amount || 
        items.reduce((sum: number, item: any) => sum + (item.unitPrice || 0) * (item.qty || 1), 0);
      
      // Используем механизм экспорта из корзины с дедубликацией (как в ЛК комплектатора)
      const response = await fetchWithAuth('/api/export/fast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'invoice',
          format: 'pdf',
          clientId: currentOrder.client_id,
          items,
          totalAmount,
          parentDocumentId: currentOrder.id, // Связь с заказом
          cartSessionId: currentOrder.cart_session_id || null // Для дедубликации
        })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        
        // Проверяем, что blob не пустой
        if (blob.size === 0) {
          throw new Error('Получен пустой файл');
        }
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const contentDisposition = response.headers.get('content-disposition');
        const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || `Счет-${currentOrder.invoice?.number || currentOrder.number}.pdf`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success('Счет экспортирован в PDF');
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Ошибка экспорта счета' }));
        toast.error(errorData.error || 'Ошибка экспорта счета');
      }
    } catch (error) {
      clientLogger.error('Error exporting invoice PDF', error);
      toast.error('Ошибка экспорта счета');
    } finally {
      setLoading(false);
    }
  };

  // Экспорт заказа у поставщика в Excel (использует механизм экспорта из корзины с дедубликацией)
  const handleExportSupplierOrder = async () => {
    try {
      setLoading(true);
      
      // Получаем данные корзины из счета или заказа (как для отображения и экспорта счета)
      let cartData;
      let items: any[] = [];
      
      const sourceCartData = currentOrder.invoice?.cart_data || currentOrder.cart_data;
      
      if (sourceCartData) {
        try {
          cartData = typeof sourceCartData === 'string' 
            ? JSON.parse(sourceCartData) 
            : sourceCartData;
          const rawItems = cartData.items || (Array.isArray(cartData) ? cartData : []);
          items = rawItems.map((item: any) => ({
            id: item.id || item.productId,
            productId: item.productId || item.id,
            name: item.name || item.model,
            model: item.model || item.name,
            model_name: item.model_name,
            matchingVariants: item.matchingVariants ?? item.matching_variants,
            qty: item.qty ?? item.quantity ?? 1,
            quantity: item.qty ?? item.quantity ?? 1,
            unitPrice: item.unitPrice ?? item.price ?? 0,
            price: item.unitPrice ?? item.price ?? 0,
            width: item.width,
            height: item.height,
            color: item.color,
            finish: item.finish,
            type: item.type ?? item.itemType,
            itemType: item.itemType ?? item.type,
            sku_1c: item.sku_1c,
            handleId: item.handleId,
            handleName: item.handleName,
            hardwareKitId: item.hardwareKitId,
            hardwareKitName: item.hardwareKitName ?? item.hardware,
            limiterId: item.limiterId,
            limiterName: item.limiterName,
            style: item.style,
            hardware: item.hardware,
            edge: item.edge,
            edgeId: item.edgeId ?? item.edge_id,
            edge_color_name: item.edge_color_name ?? item.edgeColorName,
            edgeColorName: item.edgeColorName ?? item.edge_color_name,
            glassColor: item.glassColor ?? item.glass_color,
            reversible: item.reversible,
            mirror: item.mirror,
            threshold: item.threshold === true || item.threshold === 1 || (typeof item.threshold === 'string' && item.threshold.toLowerCase() === 'да'),
            optionIds: item.optionIds ?? item.option_ids,
            architraveNames: item.architraveNames ?? item.architrave_names,
            optionNames: item.optionNames,
            option_ids: item.option_ids ?? item.optionIds,
            architrave_names: item.architrave_names ?? item.architraveNames,
            breakdown: item.breakdown,
            specRows: item.specRows ?? item.spec_rows,
            price_opt: item.price_opt,
            filling: item.filling,
            fillingName: item.fillingName
          }));
        } catch (parseError) {
          clientLogger.error('Error parsing cart_data', parseError);
        }
      }
      
      if (items.length === 0) {
        toast.error('Нет данных корзины для экспорта');
        return;
      }
      
      // Вычисляем общую сумму
      const totalAmount = currentOrder.invoice?.total_amount ?? currentOrder.total_amount ?? 
        items.reduce((sum: number, item: any) => sum + (item.unitPrice || 0) * (item.qty || 1), 0);
      
      // Используем механизм экспорта из корзины с дедубликацией
      // Для заказа у поставщика используем тип 'order' и формат 'excel'
      const response = await fetchWithAuth('/api/export/fast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'order',
          format: 'excel',
          clientId: currentOrder.client_id,
          items,
          totalAmount,
          parentDocumentId: currentOrder.id, // Связь с заказом
          cartSessionId: currentOrder.cart_session_id || null // Для дедубликации
        })
      });
      
      if (response.ok) {
        const blob = await response.blob();
        
        // Проверяем, что blob не пустой
        if (blob.size === 0) {
          throw new Error('Получен пустой файл');
        }
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const contentDisposition = response.headers.get('content-disposition');
        const filename = contentDisposition?.match(/filename="(.+)"/)?.[1] || `Заказ_у_поставщика_${currentOrder.number || currentOrder.id.slice(-6)}.xlsx`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success('Заказ у поставщика экспортирован в Excel');
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Ошибка экспорта заказа у поставщика' }));
        toast.error(errorData.error || 'Ошибка экспорта заказа у поставщика');
      }
    } catch (error) {
      clientLogger.error('Error exporting supplier order Excel', error);
      toast.error('Ошибка экспорта заказа у поставщика');
    } finally {
      setLoading(false);
    }
  };

  // Обновление данных заказа
  const fetchOrder = async () => {
    if (!currentOrder?.id) return;
    
    try {
      const response = await fetchWithAuth(`/api/orders/${currentOrder.id}`);
      if (response.ok) {
        const data = await response.json();
        const parsedData = parseApiResponse<{ order?: any }>(data);
        const orderData = parsedData && typeof parsedData === 'object' && 'order' in parsedData
          ? (parsedData as { order?: any }).order
          : null;
        
        if (orderData) {
          setCurrentOrder(orderData);
          clientLogger.debug('fetchOrder: order updated', { orderId: orderData.id, status: orderData.status });
        }
      } else {
        clientLogger.error('fetchOrder: error response', { status: response.status, statusText: response.statusText });
      }
    } catch (error) {
      clientLogger.error('Error fetching order', error);
    }
  };

  // Загрузка проекта/планировки
  const handleProjectUpload = async () => {
    if (!projectFile) {
      toast.error('Выберите файл проекта');
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('file', projectFile);

      const response = await fetch(`/api/orders/${order.id}/project`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        toast.success('Проект загружен успешно');
        await fetchOrder();
        setShowProjectUpload(false);
        setProjectFile(null);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка загрузки проекта');
      }
    } catch (error) {
      clientLogger.error('Error uploading project', error);
      toast.error('Ошибка загрузки проекта');
    } finally {
      setLoading(false);
    }
  };

  // Загрузка только тех. заданий
  const handleTechSpecsUpload = async () => {
    if (techSpecsFiles.length === 0) {
      toast.error('Выберите файлы для загрузки');
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      
      techSpecsFiles.forEach(file => {
        formData.append('technical_specs', file);
      });

      const response = await fetch(`/api/orders/${order.id}/files`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        toast.success('Тех. задания загружены успешно');
        await fetchOrder();
        setShowTechSpecsUpload(false);
        setTechSpecsFiles([]);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка загрузки тех. заданий');
      }
    } catch (error) {
      clientLogger.error('Error uploading tech specs', error);
      toast.error('Ошибка загрузки тех. заданий');
    } finally {
      setLoading(false);
    }
  };

  // Загрузка только оптовых счетов
  const handleWholesaleInvoicesUpload = async () => {
    if (wholesaleInvoices.length === 0) {
      toast.error('Выберите файлы для загрузки');
      return;
    }

    try {
      setLoading(true);
      const formData = new FormData();
      
      wholesaleInvoices.forEach(file => {
        formData.append('wholesale_invoices', file);
      });

      const response = await fetch(`/api/orders/${order.id}/files`, {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        toast.success('Оптовые счета загружены успешно');
        await fetchOrder();
        setShowFilesUpload(false);
        setWholesaleInvoices([]);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка загрузки оптовых счетов');
      }
    } catch (error) {
      clientLogger.error('Error uploading wholesale invoices', error);
      toast.error('Ошибка загрузки оптовых счетов');
    } finally {
      setLoading(false);
    }
  };

  // Изменение статуса
  const handleStatusChange = async () => {
    if (!currentOrder || !newStatus) {
      clientLogger.error('handleStatusChange: missing order or newStatus', { 
        hasOrder: !!currentOrder, 
        newStatus 
      });
      toast.error('Ошибка: отсутствуют данные для смены статуса');
      return;
    }

    try {
      setLoading(true);

      // Маппим статус для проверки (PAID -> NEW_PLANNED)
      const executorStatus = getExecutorOrderStatus(currentOrder.status);
      
      // Если текущий статус UNDER_REVIEW и мы выбираем конкретный статус (AWAITING_MEASUREMENT или AWAITING_INVOICE),
      // то require_measurement не нужен, так как мы уже выбрали следующий статус
      // require_measurement используется только когда мы отправляем UNDER_REVIEW и хотим, чтобы API определил следующий статус
      const shouldRequireMeasurement = executorStatus === 'UNDER_REVIEW' && newStatus === 'UNDER_REVIEW' && requireMeasurement;

      clientLogger.debug('handleStatusChange: starting', {
        orderId: currentOrder.id,
        currentStatus: currentOrder.status,
        executorStatus,
        newStatus,
        requireMeasurement: shouldRequireMeasurement
      });

      const response = await fetchWithAuth(`/api/orders/${currentOrder.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({
          status: newStatus,
          require_measurement: shouldRequireMeasurement ? requireMeasurement : undefined
        })
      });

      clientLogger.debug('handleStatusChange: response', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText
      });

      if (response.ok) {
        const responseData = await response.json();
        // apiSuccess возвращает { success: true, data: { order: ... } }
        const parsedData = parseApiResponse<{ order?: any }>(responseData);
        const updatedOrderData = parsedData && typeof parsedData === 'object' && 'order' in parsedData
          ? (parsedData as { order?: any }).order
          : null;
        
        clientLogger.debug('handleStatusChange: success', {
          updatedOrder: updatedOrderData
        });
        
        // Обновляем статус заказа сразу из ответа — модалка остаётся открытой, без перезагрузки
        if (updatedOrderData) {
          setCurrentOrder((prevOrder) => prevOrder ? { ...prevOrder, status: updatedOrderData.status || newStatus } : prevOrder);
          const executorStatus = getExecutorOrderStatus(updatedOrderData.status || newStatus);
          setNewStatus(executorStatus);
        }
        
        toast.success('Статус изменен успешно');
        setShowStatusChangeModal(false);
        setLoading(false);
        // Подгружаем полные данные заказа в фоне, без блокировки UI
        fetchOrder();
        onUpdate();
      } else {
        let errorData: any;
        try {
          errorData = await response.json();
        } catch (jsonError) {
          clientLogger.error('handleStatusChange: error parsing JSON', jsonError);
          errorData = { error: `Ошибка ${response.status}: ${response.statusText}` };
        }
        
        // Парсим ответ в формате apiError
        const parsedError = parseApiResponse<{ error?: { code?: string; message?: string; details?: unknown } }>(errorData);
        
        const errorMessage = parsedError && typeof parsedError === 'object' && parsedError !== null && 'error' in parsedError
          ? (parsedError.error && typeof parsedError.error === 'object' && 'message' in parsedError.error
            ? String(parsedError.error.message)
            : String(parsedError.error))
          : (errorData && typeof errorData === 'object' && errorData !== null && 'error' in errorData
            ? String((errorData as { error: unknown }).error)
            : 'Неизвестная ошибка');
        
        clientLogger.error('handleStatusChange: error', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          parsedError,
          errorMessage
        });
        toast.error(`Ошибка при изменении статуса: ${errorMessage}`);
      }
    } catch (error) {
      clientLogger.error('Error changing status:', error);
      toast.error('Ошибка изменения статуса');
    } finally {
      setLoading(false);
    }
  };

  // Загрузка данных дверей из счета или заказа
  const loadDoorsFromInvoice = async () => {
    try {
      // Используем cart_data из invoice или order
      const sourceCartData = currentOrder.invoice?.cart_data || currentOrder.cart_data;
      
      if (!sourceCartData) {
        toast.error('Нет данных корзины');
        return;
      }

      const cartData = typeof sourceCartData === 'string' 
        ? JSON.parse(sourceCartData) 
        : sourceCartData;
      const items = cartData.items || (Array.isArray(cartData) ? cartData : []);

      const doorDimensions = items.map((item: any) => ({
        width: item.width || 0,
        height: item.height || 0,
        quantity: item.quantity || item.qty || 1,
        opening_side: null,
        latches_count: 0,
        notes: item.name || item.model || ''
      }));

      setLoading(true);
      const response = await fetch(`/api/orders/${order.id}/door-dimensions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          door_dimensions: doorDimensions
        })
      });

      if (response.ok) {
        toast.success('Тех. задания загружены из счета');
        await fetchOrder();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка загрузки тех. заданий');
      }
    } catch (error) {
      clientLogger.error('Error loading doors from invoice', error);
      toast.error('Ошибка загрузки данных дверей');
    } finally {
      setLoading(false);
    }
  };

  // Проверка данных заказа
  const handleVerify = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/orders/${order.id}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          verification_status: 'VERIFIED',
          verification_notes: ''
        })
      });

      if (response.ok) {
        const data = await response.json();
        setVerifyResult(data.verification_result);
        setShowVerifyModal(true);
        toast.success('Проверка выполнена успешно');
      } else {
        const error = await response.json();
        toast.error(error.error || 'Ошибка проверки заказа');
      }
    } catch (error) {
      clientLogger.error('Error verifying order', error);
      toast.error('Ошибка проверки заказа');
    } finally {
      setLoading(false);
    }
  };

  // Получение доступных статусов для перехода
  const getAvailableStatuses = useCallback(() => {
    if (!currentOrder) return [];
    // Маппим статус для исполнителя (PAID -> NEW_PLANNED)
    const executorStatus = getExecutorOrderStatus(currentOrder.status);
    // Используем единую функцию из lib/validation/status-transitions.ts
    const transitions = getValidTransitions('order', executorStatus);
    // Убираем дубликаты из списка статусов и фильтруем пустые значения
    const uniqueTransitions = Array.from(new Set(transitions.filter(Boolean)));
    clientLogger.debug('Available statuses for executor:', {
      currentStatus: currentOrder.status,
      executorStatus,
      transitions,
      uniqueTransitions
    });
    return uniqueTransitions;
  }, [currentOrder]);

  const availableStatuses = getAvailableStatuses();
  // Маппим статус для отображения
  const executorStatus = getExecutorOrderStatus(currentOrder.status) as keyof typeof ORDER_STATUSES;
  const statusConfig = ORDER_STATUSES[executorStatus] || ORDER_STATUSES.NEW_PLANNED;
  const StatusIcon = statusConfig.icon;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ru-RU', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg max-w-5xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          {/* Заголовок */}
          <div className="mb-6 border-b pb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <h2 className="text-2xl font-bold text-black">{currentOrder.number}</h2>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${statusConfig.color}`}>
                  <StatusIcon className="h-4 w-4 mr-1" />
                  {statusConfig.label}
                </span>
                <span className="text-sm text-gray-500">
                  Создан: {formatDate(currentOrder.created_at)}
                </span>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-black transition-colors text-2xl"
              >
                ✕
              </button>
            </div>
            
            {/* Действия в заголовке (как в ЛК комплектатора) */}
            <div className="flex items-center space-x-4 mt-2 flex-wrap gap-2">
              <button 
                onClick={() => setIsCommentsModalOpen(true)}
                className="flex items-center space-x-1 text-gray-600 hover:text-gray-800 transition-colors"
              >
                <div className="w-3 h-3 bg-green-100 rounded-sm flex items-center justify-center">
                  <StickyNote className="h-2 w-2 text-green-600" />
                </div>
                <span className="text-xs">Комментарии</span>
              </button>
              <button 
                onClick={() => setIsHistoryModalOpen(true)}
                className="flex items-center space-x-1 text-gray-600 hover:text-gray-800 transition-colors"
              >
                <div className="w-3 h-3 bg-gray-100 rounded-full flex items-center justify-center">
                  <History className="h-2 w-2 text-gray-600" />
                </div>
                <span className="text-xs">История</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Левая колонка */}
            <div className="space-y-6">
              {/* Информация о клиенте */}
              <Card variant="base" className="p-4">
                <h3 className="font-semibold text-black mb-3">Информация о клиенте</h3>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="text-gray-600">ФИО:</span>{' '}
                    <span className="font-medium">{currentOrder.client.fullName}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Телефон:</span>{' '}
                    <span className="font-medium">{currentOrder.client.phone}</span>
                  </div>
                  <div>
                    <span className="text-gray-600">Адрес:</span>{' '}
                    <span className="font-medium">{currentOrder.client.address}</span>
                  </div>
                  {currentOrder.lead_number && (
                    <div>
                      <span className="text-gray-600">Номер лида:</span>{' '}
                      <span className="font-medium">{currentOrder.lead_number}</span>
                    </div>
                  )}
                  {currentOrder.complectator_name && (
                    <div>
                      <span className="text-gray-600">Комплектатор:</span>{' '}
                      <span className="font-medium">{currentOrder.complectator_name}</span>
                    </div>
                  )}
                </div>
              </Card>

              {/* Кнопки экспорта */}
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportInvoicePDF}
                  disabled={loading}
                  className="flex-1"
                  title="Экспортировать счет в PDF"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Оплаченный счет
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportSupplierOrder}
                  disabled={loading}
                  className="flex-1"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Заказ из БД
                </Button>
              </div>

              {/* Блок Действия */}
              <Card variant="base" className="p-4">
                <h3 className="font-semibold text-black mb-3">Действия</h3>
                <div className="space-y-2">
                  {(() => {
                    // Маппим статус для проверки (PAID -> NEW_PLANNED)
                    const executorStatus = getExecutorOrderStatus(currentOrder.status);
                    return executorStatus === 'UNDER_REVIEW';
                  })() && 
                   currentOrder.project_file_url && 
                   currentOrder.invoice && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleVerify}
                      disabled={loading}
                      className="w-full"
                    >
                      Проверить данные дверей
                    </Button>
                  )}
                  {availableStatuses.length > 0 && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        // Получаем маппированный статус для исполнителя
                        const executorStatus = getExecutorOrderStatus(currentOrder.status);
                        // Устанавливаем первый доступный статус или текущий маппированный статус, если он доступен
                        const initialStatus = availableStatuses.includes(executorStatus) 
                          ? executorStatus 
                          : (availableStatuses.length > 0 ? availableStatuses[0] : executorStatus);
                        setNewStatus(initialStatus);
                        // Сбрасываем requireMeasurement при открытии модального окна
                        setRequireMeasurement(false);
                        setShowStatusChangeModal(true);
                      }}
                      className="w-full"
                    >
                      Изменить статус
                    </Button>
                  )}
                </div>
                
                {/* Статус проверки */}
                {currentOrder.verification_status && (
                  <div className="mt-4 pt-4 border-t">
                    <div className="text-sm">
                      <span className="text-gray-600">Статус проверки:</span>{' '}
                      <span className={`font-medium ${
                        currentOrder.verification_status === 'VERIFIED' 
                          ? 'text-green-600' 
                          : currentOrder.verification_status === 'FAILED' 
                          ? 'text-red-600' 
                          : 'text-gray-600'
                      }`}>
                        {currentOrder.verification_status === 'VERIFIED' 
                          ? 'Проверено' 
                          : currentOrder.verification_status === 'FAILED' 
                          ? 'Ошибка проверки' 
                          : 'Ожидает проверки'
                        }
                      </span>
                    </div>
                    {currentOrder.verification_notes && (
                      <div className="text-sm text-gray-600 mt-1">
                        {currentOrder.verification_notes}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            </div>

            {/* Правая колонка */}
            <div className="space-y-3">
              {/* Проект/планировка */}
              <Card variant="base" className="p-2">
                <div className="flex justify-between items-center mb-1.5">
                  <h3 className="text-xs font-medium text-black">Проект/планировка</h3>
                </div>
                {currentOrder.project_file_url ? (
                  <div className="space-y-0.5">
                    <a
                      href={currentOrder.project_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-xs flex items-center gap-1.5 py-0.5 px-1 rounded hover:bg-gray-50 transition-colors"
                      title={getOriginalFileName(currentOrder.project_file_url)}
                    >
                      <File className="h-3 w-3" />
                      <span className="truncate max-w-[200px]" title={getOriginalFileName(currentOrder.project_file_url)}>
                        {getOriginalFileName(currentOrder.project_file_url)}
                      </span>
                      <Download className="h-2.5 w-2.5 ml-auto flex-shrink-0" />
                    </a>
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 flex items-center gap-1.5">
                    <AlertCircle className="h-3 w-3" />
                    <span>Файл не загружен</span>
                  </div>
                )}
              </Card>

              {/* Тех. задания */}
              <Card variant="base" className="p-2">
                <div className="flex justify-between items-center mb-1.5">
                  <h3 className="text-xs font-medium text-black">Тех. задания</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTechSpecsUpload(true)}
                    className="text-[10px] py-0.5 px-1.5 h-6"
                  >
                    <Upload className="h-2.5 w-2.5 mr-0.5" />
                    Загрузить
                  </Button>
                </div>
                
                {currentOrder.door_dimensions && currentOrder.door_dimensions.length > 0 ? (
                  <div className="space-y-1 mb-2">
                    {currentOrder.door_dimensions.map((door: any, index: number) => (
                      <div key={index} className="border rounded p-1.5">
                        <div className="text-[10px] font-medium mb-0.5">Дверь {index + 1}</div>
                        <div className="grid grid-cols-2 gap-1 text-[10px]">
                          <div>
                            <span className="text-gray-600">Размер:</span>{' '}
                            <span className="font-medium">{door.width} x {door.height} мм</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Количество:</span>{' '}
                            <span className="font-medium">{door.quantity} шт.</span>
                          </div>
                          {door.opening_side && (
                            <div>
                              <span className="text-gray-600">Открывание:</span>{' '}
                              <span className="font-medium">{door.opening_side === 'LEFT' ? 'Левое' : door.opening_side === 'RIGHT' ? 'Правое' : door.opening_side}</span>
                            </div>
                          )}
                          {door.latches_count !== undefined && (
                            <div>
                              <span className="text-gray-600">Завертки:</span>{' '}
                              <span className="font-medium">{door.latches_count} шт.</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {currentOrder.technical_specs.length > 0 ? (
                  <div className="space-y-0.5">
                    {currentOrder.technical_specs.map((url: string, index: number) => (
                      <div key={index} className="flex items-center justify-between py-0.5 px-1 rounded hover:bg-gray-50 transition-colors group">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-xs flex items-center gap-1 flex-1 min-w-0"
                          title={getOriginalFileName(url)}
                        >
                          <FileCheck className="h-2.5 w-2.5 text-green-600 flex-shrink-0" />
                          <span className="truncate" title={getOriginalFileName(url)}>
                            {getOriginalFileName(url)}
                          </span>
                          <Download className="h-2 w-2 ml-auto flex-shrink-0" />
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 flex items-center gap-1.5">
                    <AlertCircle className="h-3 w-3" />
                    <span>Файлы не загружены</span>
                  </div>
                )}
              </Card>

              {/* Оптовые счета */}
              <Card variant="base" className="p-2">
                <div className="flex justify-between items-center mb-1.5">
                  <h3 className="text-xs font-medium text-black">Оптовые счета</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilesUpload(true)}
                    className="text-[10px] py-0.5 px-1.5 h-6"
                  >
                    <Upload className="h-2.5 w-2.5 mr-0.5" />
                    Загрузить
                  </Button>
                </div>
                
                {currentOrder.wholesale_invoices.length > 0 ? (
                  <div className="space-y-0.5">
                    {currentOrder.wholesale_invoices.map((url: string, index: number) => (
                      <div key={index} className="flex items-center justify-between py-0.5 px-1 rounded hover:bg-gray-50 transition-colors group">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline text-xs flex items-center gap-1 flex-1 min-w-0"
                          title={getOriginalFileName(url)}
                        >
                          <FileCheck className="h-2.5 w-2.5 text-green-600 flex-shrink-0" />
                          <span className="truncate" title={getOriginalFileName(url)}>
                            {getOriginalFileName(url)}
                          </span>
                          <Download className="h-2 w-2 ml-auto flex-shrink-0" />
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 flex items-center gap-1.5">
                    <AlertCircle className="h-3 w-3" />
                    <span>Файлы не загружены</span>
                  </div>
                )}
              </Card>
            </div>
          </div>

          {/* Блок Товары */}
          <Card variant="base" className="p-2 mt-3">
            <h3 className="text-xs font-medium text-black mb-1.5">Товары</h3>
            {(() => {
              // Используем cart_data из invoice, если есть, иначе из order
              const sourceCartData = currentOrder.invoice?.cart_data || currentOrder.cart_data;
              
              if (!sourceCartData) {
                return (
                  <div className="text-sm text-gray-500">
                    <p>Товары не указаны</p>
                    <p className="text-xs mt-1 text-gray-400">
                      {!currentOrder.invoice?.cart_data && !currentOrder.cart_data 
                        ? 'Заказ был создан без товаров. Товары можно добавить при создании Invoice или обновить Order через API.'
                        : 'Не удалось загрузить данные товаров.'}
                    </p>
                  </div>
                );
              }
              
              try {
                const cartData = typeof sourceCartData === 'string' 
                  ? JSON.parse(sourceCartData) 
                  : sourceCartData;
                const items = cartData.items || (Array.isArray(cartData) ? cartData : []);
                
                if (items.length === 0) {
                  return <div className="text-sm text-gray-500">Товары не указаны</div>;
                }
                
                const total = items.reduce((sum: number, item: any) => {
                  const qty = item.qty || item.quantity || 1;
                  const price = item.unitPrice || item.price || 0;
                  return sum + (qty * price);
                }, 0);

                return (
                  <>
                    <div className="space-y-2">
                      {items.map((item: any, index: number) => {
                        const qty = item.qty || item.quantity || 1;
                        const price = item.unitPrice || item.price || 0;
                        const itemTotal = qty * price;
                        // Единая логика названий (дверь, ручка, завертка, ограничитель) как в экспорте
                        const displayName = getItemDisplayNameForExport(item);
                        const cleanName = cleanProductName(displayName);
                        
                        return (
                          <div key={index} className="flex justify-between items-start py-1.5 border-b last:border-0 hover:bg-gray-50 transition-colors rounded px-1.5 -mx-1.5">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm mb-0.5">{cleanName || `Товар ${index + 1}`}</div>
                              <div className="text-xs text-gray-500">
                                {qty} шт. × {price.toLocaleString('ru-RU')} ₽
                              </div>
                            </div>
                            <div className="font-semibold text-sm text-right ml-3 flex-shrink-0">
                              {itemTotal.toLocaleString('ru-RU')} ₽
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 pt-4 border-t flex justify-between items-center">
                      <span className="font-semibold text-lg">Итого:</span>
                      <span className="font-semibold text-lg">{total.toLocaleString('ru-RU')} ₽</span>
                    </div>
                  </>
                );
              } catch (error) {
                clientLogger.error('Error parsing cart_data', error);
                return <div className="text-sm text-gray-500">Ошибка загрузки товаров</div>;
              }
            })()}
          </Card>
        </div>

        {/* Модальное окно загрузки проекта */}
        {showProjectUpload && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4">Загрузка проекта/планировки</h3>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.dwg,.dxf"
                onChange={(e) => setProjectFile(e.target.files?.[0] || null)}
                className="mb-4 w-full"
              />
              <div className="flex space-x-2">
                <Button onClick={handleProjectUpload} disabled={loading || !projectFile} className="flex-1">
                  {loading ? 'Загрузка...' : 'Загрузить'}
                </Button>
                <Button variant="outline" onClick={() => setShowProjectUpload(false)} className="flex-1">
                  Отмена
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Модальное окно загрузки тех. заданий */}
        {showTechSpecsUpload && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4">Загрузка тех. заданий</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Техзадания на проемы (PDF)</label>
                  <input
                    type="file"
                    accept=".pdf"
                    multiple
                    onChange={(e) => setTechSpecsFiles(Array.from(e.target.files || []))}
                    className="w-full"
                  />
                </div>
              </div>
              <div className="flex space-x-2 mt-4">
                <Button onClick={handleTechSpecsUpload} disabled={loading || techSpecsFiles.length === 0} className="flex-1">
                  {loading ? 'Загрузка...' : 'Загрузить'}
                </Button>
                <Button variant="outline" onClick={() => {
                  setShowTechSpecsUpload(false);
                  setTechSpecsFiles([]);
                }} className="flex-1">
                  Отмена
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Модальное окно загрузки файлов */}
        {showFilesUpload && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4">Загрузка оптовых счетов</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Оптовые счета (PDF, Excel)</label>
                  <input
                    type="file"
                    accept=".pdf,.xlsx,.xls"
                    multiple
                    onChange={(e) => setWholesaleInvoices(Array.from(e.target.files || []))}
                    className="w-full"
                  />
                </div>
              </div>
              <div className="flex space-x-2 mt-4">
                <Button onClick={handleWholesaleInvoicesUpload} disabled={loading || wholesaleInvoices.length === 0} className="flex-1">
                  {loading ? 'Загрузка...' : 'Загрузить'}
                </Button>
                <Button variant="outline" onClick={() => {
                  setShowFilesUpload(false);
                  setWholesaleInvoices([]);
                }} className="flex-1">
                  Отмена
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Модальное окно изменения статуса */}
        {showStatusChangeModal && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowStatusChangeModal(false);
              // Сбрасываем newStatus на текущий статус при закрытии
              const executorStatus = getExecutorOrderStatus(currentOrder.status);
              setNewStatus(executorStatus);
            }}
          >
            <div 
              className="bg-white rounded-lg p-6 max-w-md w-full mx-4" 
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <h3 className="text-lg font-semibold mb-4">Изменение статуса</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Новый статус</label>
                  {(() => {
                    // Маппим статус для проверки (PAID -> NEW_PLANNED)
                    const executorStatus = getExecutorOrderStatus(currentOrder.status);
                    return executorStatus === 'UNDER_REVIEW' && availableStatuses.length > 1;
                  })() ? (
                    <div className="space-y-2">
                      <label className="flex items-center space-x-2 p-2 border rounded cursor-pointer hover:bg-gray-50">
                        <input
                          type="radio"
                          name="newStatus"
                          value="AWAITING_MEASUREMENT"
                          checked={newStatus === 'AWAITING_MEASUREMENT'}
                          onChange={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setNewStatus(e.target.value);
                            setRequireMeasurement(true);
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        />
                        <span className="text-sm">{ORDER_STATUSES['AWAITING_MEASUREMENT'].label}</span>
                      </label>
                      <label className="flex items-center space-x-2 p-2 border rounded cursor-pointer hover:bg-gray-50">
                        <input
                          type="radio"
                          name="newStatus"
                          value="AWAITING_INVOICE"
                          checked={newStatus === 'AWAITING_INVOICE'}
                          onChange={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setNewStatus(e.target.value);
                            setRequireMeasurement(false);
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                        />
                        <span className="text-sm">{ORDER_STATUSES['AWAITING_INVOICE'].label}</span>
                      </label>
                    </div>
                  ) : (
                    <select
                      value={newStatus}
                      onChange={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setNewStatus(e.target.value);
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      className="w-full border border-gray-300 rounded px-3 py-2"
                    >
                      {availableStatuses.map((status, index) => {
                        // Используем getStatusLabel для правильного отображения всех статусов, включая CANCELLED
                        const label = getStatusLabel(status, 'order_executor');
                        // Используем комбинацию status и index для уникального key, чтобы избежать дубликатов
                        return (
                          <option key={`${status}-${index}`} value={status}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  )}
                </div>
                {(() => {
                  // Маппим статус для проверки (PAID -> NEW_PLANNED)
                  const executorStatus = getExecutorOrderStatus(currentOrder.status);
                  return executorStatus === 'UNDER_REVIEW';
                })() && (
                  <div className="text-sm text-gray-600">
                    {newStatus === 'AWAITING_MEASUREMENT' 
                      ? 'Заказ будет направлен на замер'
                      : 'Заказ готов к запросу счета у поставщика'
                    }
                  </div>
                )}
              </div>
              <div className="flex space-x-2 mt-4">
                <Button 
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    await handleStatusChange();
                  }} 
                  disabled={loading || !newStatus || newStatus === getExecutorOrderStatus(currentOrder.status)} 
                  className="flex-1"
                  title={newStatus === getExecutorOrderStatus(currentOrder.status) ? 'Выберите другой статус' : 'Изменить статус заказа'}
                >
                  {loading ? 'Изменение...' : 'Изменить'}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowStatusChangeModal(false);
                    // Сбрасываем newStatus на текущий статус при отмене
                    const executorStatus = getExecutorOrderStatus(currentOrder.status);
                    setNewStatus(executorStatus);
                  }} 
                  className="flex-1"
                >
                  Отмена
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Модальное окно истории изменений */}
        <HistoryModal
          isOpen={isHistoryModalOpen}
          onClose={() => setIsHistoryModalOpen(false)}
          documentId={order.id}
          documentType="order"
          documentNumber={currentOrder.number}
        />

        {/* Модальное окно комментариев */}
        <CommentsModal
          isOpen={isCommentsModalOpen}
          onClose={() => setIsCommentsModalOpen(false)}
          documentId={order.id}
          documentType="order"
          documentNumber={currentOrder.number}
        />

        {/* Модальное окно результатов проверки */}
        {showVerifyModal && verifyResult && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-60">
            <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-semibold mb-4">Результаты проверки данных дверей</h3>
              
              <div className="space-y-4">
                <div>
                  <div className="text-sm text-gray-600 mb-2">Сравнение данных:</div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-gray-600">Позиций в счете:</span>{' '}
                      <span className="font-medium">{verifyResult.invoice_items_count}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Дверей в проекте:</span>{' '}
                      <span className="font-medium">{verifyResult.project_doors_count}</span>
                    </div>
                  </div>
                  <div className="mt-2">
                    <span className={`font-medium ${
                      verifyResult.matches ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {verifyResult.matches ? '✓ Данные совпадают' : '✗ Данные не совпадают'}
                    </span>
                  </div>
                </div>

                {verifyResult.details && verifyResult.details.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2">Детали проверки:</div>
                    <div className="space-y-2">
                      {verifyResult.details.map((detail: any, index: number) => (
                        <div key={index} className="border rounded p-3">
                          <div className="font-medium mb-2">Позиция {detail.index}</div>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <div className="text-gray-600 mb-1">Из счета:</div>
                              {detail.invoice ? (
                                <div>
                                  {detail.invoice.width} x {detail.invoice.height} мм, {detail.invoice.quantity} шт.
                                </div>
                              ) : (
                                <div className="text-gray-400">Нет данных</div>
                              )}
                            </div>
                            <div>
                              <div className="text-gray-600 mb-1">Из проекта:</div>
                              {detail.project ? (
                                <div>
                                  {detail.project.width} x {detail.project.height} мм, {detail.project.quantity} шт.
                                  {detail.project.opening_side && (
                                    <div className="text-xs mt-1">Открывание: {detail.project.opening_side}</div>
                                  )}
                                  {detail.project.latches_count !== undefined && (
                                    <div className="text-xs">Завертки: {detail.project.latches_count} шт.</div>
                                  )}
                                </div>
                              ) : (
                                <div className="text-gray-400">Нет данных</div>
                              )}
                            </div>
                          </div>
                          <div className={`mt-2 text-xs ${
                            detail.matches ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {detail.matches ? '✓ Совпадает' : '✗ Не совпадает'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex space-x-2 mt-6">
                <Button onClick={() => {
                  setShowVerifyModal(false);
                  fetchOrder();
                }} className="flex-1">
                  Закрыть
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

