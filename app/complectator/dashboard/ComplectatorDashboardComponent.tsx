'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button, Card } from '../../../components/ui';
import StatCard from '../../../components/ui/StatCard';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { 
  FileText, 
  Download, 
  Users,
  TrendingUp,
  Loader2,
  Search,
  Phone,
  History,
  StickyNote,
  BadgeCheck,
  Package,
  Plus,
  MoreVertical
} from 'lucide-react';
// Убрали useAuth чтобы избежать бесконечных циклов рендера - user теперь передается как пропс
import CommentsModal from '@/components/ui/CommentsModal';
import HistoryModal from '@/components/ui/HistoryModal';
import NotificationBell from '@/components/ui/NotificationBell';
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal';
import DocumentWorkflowIntegration from '@/app/components/documents/DocumentWorkflowIntegration';
import { OrderDetailsModal } from '@/components/complectator/OrderDetailsModal';
import { CreateClientModal } from '@/components/clients/CreateClientModal';
import { parseApiResponse } from '@/lib/utils/parse-api-response';
import { COMPLECTATOR_FILTER_STATUSES, getStatusLabel, ORDER_STATUSES_COMPLECTATOR, INVOICE_STATUSES, QUOTE_STATUSES } from '@/lib/utils/document-statuses';
import { 
  mapOrderStatusToRussianForComplectator,
  mapQuoteStatusToRussian,
  isTerminalStatus,
  getQuoteFilterStatuses
} from '@/lib/utils/status-mapping';
import {
  getOrderDisplayStatus,
  getOrderFilterStatusForComplectator
} from '@/lib/utils/order-status-display';
import { clientLogger } from '@/lib/logging/client-logger';
import { fetchWithAuth } from '@/lib/utils/fetch-with-auth';

// Маппинг статусов КП из API в русские (используем общий модуль)
const mapQuoteStatus = (apiStatus: string): string => {
  return mapQuoteStatusToRussian(apiStatus);
};

// Маппинг статусов Счетов из API в русские (определяем на уровне модуля до компонента)
const mapInvoiceStatus = (apiStatus: string): string => {
  return getStatusLabel(apiStatus, 'invoice');
};

interface ComplectatorStats {
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  totalRevenue: number;
}

interface ComplectatorDashboardComponentProps {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    role: string;
    permissions: string[];
  };
}

export function ComplectatorDashboardComponent({ user }: ComplectatorDashboardComponentProps) {
  clientLogger.componentRender('ComplectatorDashboardComponent', { userRole: user.role });
  // user теперь обязательный пропс - полностью убираем useAuth чтобы избежать бесконечных циклов
  const [stats, setStats] = useState<ComplectatorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'documents'>('documents');
  // Клиенты + документы
  const [search, setSearch] = useState('');
  const [clients, setClients] = useState<Array<{
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    phone?: string;
    address?: string;
    lastActivityAt?: string;
    lastDoc?: { type: 'quote'|'invoice'; status: string; id: string; date: string; total?: number };
  }>>([]);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [orders, setOrders] = useState<Array<{ id: string; number: string; date: string; status: typeof COMPLECTATOR_FILTER_STATUSES[number]; total: number; invoice_id?: string; originalStatus?: string; displayStatus?: string }>>([]);
  const [ordersFilter, setOrdersFilter] = useState<typeof COMPLECTATOR_FILTER_STATUSES[number]>('all');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [showInWorkOnly, setShowInWorkOnly] = useState(false);
  const [showCreateClientForm, setShowCreateClientForm] = useState(false);
  const [statusDropdown, setStatusDropdown] = useState<{type: 'quote'|'invoice', id: string, x: number, y: number} | null>(null);
  const [blockedStatuses, setBlockedStatuses] = useState<Set<string>>(new Set());
  const [showQuoteActions, setShowQuoteActions] = useState<string | null>(null);
  const [showInvoiceActions, setShowInvoiceActions] = useState<string | null>(null);
  
  // Состояние для модальных окон комментариев и истории
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<{id: string, type: 'quote' | 'invoice', number: string} | null>(null);
  
  // Состояние для количества комментариев по документам
  const [commentsCount, setCommentsCount] = useState<Record<string, number>>({});
  
  // Состояние для модального окна удаления
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    type: 'quote' | 'invoice';
    id: string | null;
    name: string | null;
  }>({
    isOpen: false,
    type: 'quote',
    id: null,
    name: null
  });

  // ВСЕ ФУНКЦИИ ОПРЕДЕЛЯЕМ ДО ИСПОЛЬЗОВАНИЯ - это критично для избежания проблем минификации!
  
  // Скрыть выпадающее меню (определяем ПЕРВОЙ, так как используется в useEffect)
  const hideStatusDropdown = useCallback(() => {
    setStatusDropdown(null);
  }, []);

  // Проверка блокировки статуса документа (базовая функция)
  const isStatusBlocked = useCallback(async (documentId: string, documentType: 'invoice' | 'quote'): Promise<boolean> => {
    try {
      const response = await fetchWithAuth(`/api/${documentType}s/${documentId}/status`);

      if (response.ok) {
        const data = await response.json();
        // Статусы, которые блокируют ручное изменение
        const blockedStatusesArray = ['ORDERED', 'IN_PRODUCTION', 'READY', 'COMPLETED'];
        return blockedStatusesArray.includes(data.status);
      }
      return false;
    } catch (statusCheckError) {
      clientLogger.error('Ошибка проверки блокировки статуса', statusCheckError);
      return false;
    }
  }, []);

  // Загрузка статистики (базовая функция)
  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      // Имитация загрузки статистики
      await new Promise(resolve => setTimeout(resolve, 1000));
      setStats({ totalOrders: 0, pendingOrders: 0, completedOrders: 0, totalRevenue: 0 });
    } catch (statsLoadError) {
      clientLogger.error('Ошибка загрузки статистики', statsLoadError);
    } finally {
      setLoading(false);
    }
  }, []);

  // Флаг для защиты от повторных вызовов (используем useRef чтобы избежать ре-рендеров)
  const isClientsLoadingRef = useRef(false);
  
  // Загрузка списка клиентов (базовая функция)
  const fetchClients = useCallback(async () => {
    // Защита от повторных вызовов
    if (isClientsLoadingRef.current) {
      clientLogger.debug('fetchClients уже выполняется, пропускаем');
      return;
    }
    
    // Проверяем, что пользователь авторизован
    if (!user || !user.id) {
      clientLogger.warn('Пользователь не авторизован, пропускаем загрузку клиентов');
      return;
    }
    
    try {
      isClientsLoadingRef.current = true;
      
      const response = await fetchWithAuth('/api/clients');
      
      if (!response.ok) {
        // Если 401, fetchWithAuth уже обработал перенаправление
        if (response.status === 401) {
          return;
        }
        
        // Получаем детали ошибки из ответа
        let errorText = '';
        let errorData: any = null;
        
        try {
          errorText = await response.text();
          if (errorText) {
            try {
              errorData = JSON.parse(errorText);
            } catch {
              errorData = { raw: errorText };
            }
          }
        } catch (e) {
          errorData = { error: 'Не удалось прочитать ответ' };
        }
        
        // Логируем с деталями
        const errorDetails = {
          status: response.status,
          statusText: response.statusText,
          error: errorData,
          errorText: errorText.substring(0, 500), // Первые 500 символов
          url: '/api/clients',
          user: user ? { id: user.id, role: user.role } : null
        };
        
        clientLogger.error(
          `Failed to fetch clients: ${response.status} ${response.statusText}`, 
          new Error(`HTTP ${response.status}: ${response.statusText}`), 
          errorDetails
        );
        
        // Показываем пользователю понятное сообщение
        if (response.status === 500) {
          clientLogger.error('Ошибка подключения к базе данных. Убедитесь, что база данных инициализирована и Prisma Client перегенерирован.', fetchError);
        } else if (response.status === 401) {
          clientLogger.warn('Требуется авторизация для доступа к клиентам');
        }
        
        return;
      }
      
      const responseData = await response.json();
      clientLogger.debug('📦 Raw response from /api/clients:', { responseData });
      
      // apiSuccess возвращает { success: true, data: { clients: ..., pagination: ... } }
      const parsedData = parseApiResponse<{ clients?: any[]; pagination?: any }>(responseData);
      const data = parsedData && typeof parsedData === 'object' && 'clients' in parsedData
        ? parsedData
        : null;
      clientLogger.debug('📦 Extracted data from response:', { data, hasClients: data && 'clients' in data, clientsLength: data?.clients?.length });
      
      // Проверяем, что данные есть
      if (!data || !data.clients) {
        clientLogger.warn('Invalid response format', { responseData, data, dataKeys: data ? Object.keys(data) : null });
        return;
      }
      
      // Преобразуем данные клиентов в нужный формат
      const formattedClients = data.clients.map((clientItem: any) => ({
        id: clientItem.id,
        firstName: clientItem.firstName,
        lastName: clientItem.lastName,
        middleName: clientItem.middleName,
        phone: clientItem.phone,
        address: clientItem.address,
        objectId: clientItem.objectId,
        lastActivityAt: clientItem.createdAt,
        lastDoc: undefined // Будет загружаться отдельно при выборе клиента
      }));
      
      setClients(formattedClients);
    } catch (fetchClientsError) {
      clientLogger.error('Error fetching clients', fetchClientsError);
      
      // Более детальная информация об ошибке
      if (fetchClientsError instanceof TypeError && fetchClientsError.message.includes('fetch')) {
        clientLogger.error('Ошибка сети. Проверьте, что dev сервер запущен на http://localhost:3000', fetchClientsError);
      } else {
        clientLogger.error('Неизвестная ошибка при загрузке клиентов', fetchClientsError);
      }
    } finally {
      isClientsLoadingRef.current = false;
    }
  }, []);

  // Функция для загрузки количества комментариев для документа (базовая функция)
  const fetchCommentsCount = useCallback(async (documentId: string) => {
    try {
      const response = await fetchWithAuth(`/api/documents/${documentId}/comments/count`);
      if (response.ok) {
        const data = await response.json();
        const parsedData = parseApiResponse<{ count: number }>(data);
        setCommentsCount(prev => ({
          ...prev,
          [documentId]: parsedData.count || 0
        }));
      }
    } catch (commentsCountError) {
      clientLogger.error('Error fetching comments count', commentsCountError);
    }
  }, []);

  // Функция для загрузки количества комментариев для всех документов клиента (зависит от fetchCommentsCount)
  const fetchAllCommentsCount = useCallback(async (orders: any[]) => {
    const promises = orders.map(order => fetchCommentsCount(order.id));
    await Promise.all(promises);
  }, [fetchCommentsCount]);

  // Загрузка информации о блокировке статусов для всех документов (зависит от isStatusBlocked)
  // НЕ зависит от orders напрямую - вызывается только вручную когда нужно
  const loadBlockedStatuses = useCallback(async (currentOrders: typeof orders) => {
    const blockedSet = new Set<string>();
    
    // Проверяем все заказы через связанные счета
    // Для комплектатора статусы заказов синхронизируются со статусами Invoice
    for (const order of currentOrders) {
      // Если у заказа есть связанный счет, проверяем блокировку через Invoice
      if (order.invoice_id) {
        try {
          const isBlocked = await isStatusBlocked(order.invoice_id, 'invoice');
          if (isBlocked) {
            blockedSet.add(order.id);
          }
        } catch (error) {
          clientLogger.error('Error checking invoice status for order', error, { orderId: order.id });
        }
      }
      // Если нет счета, заказ не блокирован (статус Черновик)
    }
    
    setBlockedStatuses(blockedSet);
  }, [isStatusBlocked]);

  // Загрузка заказов клиента
  const fetchClientOrders = useCallback(async (clientId: string) => {
    try {
      const response = await fetchWithAuth(`/api/orders?client_id=${clientId}`);
      if (response.ok) {
        const responseData = await response.json();
        // apiSuccess возвращает { success: true, data: { orders: ..., pagination: ... } }
        const parsedData = parseApiResponse<{ orders?: any[]; pagination?: any }>(responseData);
        const data = parsedData && typeof parsedData === 'object' && 'orders' in parsedData
          ? parsedData
          : null;
        // Преобразуем заказы - ВСЕГДА используем статус Order, а не Invoice
        const formattedOrders = ((data?.orders || []) as any[]).map((order: any) => {
          // ВСЕГДА используем статус Order напрямую для отображения
          const orderStatus = order.status; // API статус Order (NEW_PLANNED, UNDER_REVIEW, и т.д.)
          
          // Используем унифицированную функцию для получения русского названия статуса
          const displayStatus = getOrderDisplayStatus(orderStatus);
          
          // Используем унифицированную функцию для получения статуса фильтра
          const filterStatus = getOrderFilterStatusForComplectator(orderStatus);

          return {
            id: order.id,
            number: order.number,
            date: new Date(order.created_at).toLocaleDateString('ru-RU'),
            status: filterStatus, // Для фильтрации
            total: order.invoice?.total_amount || 0,
            invoice_id: order.invoice_id,
            // Сохраняем оригинальный статус Order (API статус)
            originalStatus: orderStatus,
            // Сохраняем отображаемый статус на русском (всегда из Order, не из Invoice)
            displayStatus: displayStatus
          };
        });
        setOrders(formattedOrders);
        
        // Загружаем информацию о блокировке статусов для заказов
        setTimeout(() => {
          loadBlockedStatuses(formattedOrders);
        }, 100);
        
        // Загружаем количество комментариев для всех заказов
        await fetchAllCommentsCount(formattedOrders);
      } else {
        const errorData = await response.json();
        clientLogger.error('Error fetching client orders', { status: response.status, error: errorData });
        toast.error('Ошибка при загрузке заказов');
      }
    } catch (error) {
      clientLogger.error('Error fetching client orders', error);
      toast.error('Ошибка при загрузке заказов');
    }
  }, [loadBlockedStatuses, fetchAllCommentsCount]);



  // Теперь используем функции в useEffect (после их определения)
  useEffect(() => {
    fetchStats();
    fetchClients();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Убираем fetchStats и fetchClients из зависимостей чтобы избежать бесконечного цикла

  // Закрытие выпадающих меню при клике вне их (использует hideStatusDropdown)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (statusDropdown) {
        const target = event.target as HTMLElement;
        // Проверяем, что клик не по выпадающему меню и не по кнопке статуса
        if (!target.closest('[data-status-dropdown]') && !target.closest('button[class*="rounded-full"]')) {
          hideStatusDropdown();
        }
      }
      
      const target = event.target as HTMLElement;
      if (!target.closest('[data-quote-actions]') && !target.closest('[data-invoice-actions]')) {
        setShowQuoteActions(null);
        setShowInvoiceActions(null);
      }
    };

    if (statusDropdown || showQuoteActions || showInvoiceActions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [statusDropdown, showQuoteActions, showInvoiceActions, hideStatusDropdown]);

  // Оптимизированная фильтрация клиентов с мемоизацией
  const filteredClients = useMemo(() => {
    return clients
      .filter(c => {
        if (!showInWorkOnly) return true;
        if (!c.lastDoc) return true;
        // Используем функцию из общего модуля для определения терминального статуса
        return !isTerminalStatus(c.lastDoc.status, c.lastDoc.type);
      })
      .filter(c => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        const fio = `${c.lastName} ${c.firstName} ${c.middleName || ''}`.toLowerCase();
        // Явная проверка опциональных полей для избежания проблем с инициализацией
        const phoneStr = c.phone ? c.phone.toLowerCase() : '';
        const addressStr = c.address ? c.address.toLowerCase() : '';
        return fio.includes(q) || phoneStr.includes(q) || addressStr.includes(q);
      })
      .sort((a,b) => {
        const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
        const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
        return tb - ta;
      });
  }, [clients, search, showInWorkOnly]);

  useEffect(() => {
    if (!selectedClient) return;
    fetchClientOrders(selectedClient);
  }, [selectedClient, fetchClientOrders]);

  const formatPhone = (raw?: string) => {
    if (!raw) return '—';
    const digits = raw.replace(/\D/g, '');
    const d = digits.length >= 10 ? digits.slice(-10) : digits;
    if (d.length < 10) return raw;
    return `+7 (${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6,8)}-${d.slice(8,10)}`;
  };

  const badgeByQuoteStatus = (s: 'Черновик'|'Отправлен'|'Согласовано'|'Отказ') => {
    switch (s) {
      case 'Черновик': return 'border-gray-300 text-gray-700';
      case 'Отправлен': return 'border-blue-300 text-blue-700';
      case 'Согласовано': return 'border-green-300 text-green-700';
      case 'Отказ': return 'border-red-300 text-red-700';
    }
  };

  const badgeByInvoiceStatus = (s: string) => {
    // Статусы комплектатора
    switch (s) {
      case 'Новый заказ': return 'border-gray-300 text-gray-700';
      case 'Счет выставлен': return 'border-blue-300 text-blue-700';
      case 'Счет оплачен (Заказываем)': return 'border-green-300 text-green-700';
      case 'Отменен': return 'border-red-300 text-red-700';
      // Статусы исполнителя (комплектатор их видит, но не может изменять)
      case 'На проверке': return 'border-yellow-300 text-yellow-800';
      case 'Ждет замер': return 'border-orange-300 text-orange-800';
      case 'Ожидает опт. счет': return 'border-purple-300 text-purple-700';
      case 'Готов к запуску в производство': return 'border-indigo-300 text-indigo-700';
      case 'Выполнен': return 'border-emerald-300 text-emerald-700';
      case 'Вернуть в комплектацию': return 'border-red-300 text-red-700';
      default: return 'border-gray-300 text-gray-700';
    }
  };



  // Показать выпадающее меню статуса
  const showStatusDropdown = async (type: 'quote'|'invoice', id: string, event: React.MouseEvent) => {
    clientLogger.debug('Showing status dropdown', { type, id });
    
    // Сохраняем элемент ДО async операций
    if (!event.currentTarget) {
      clientLogger.error('event.currentTarget is null');
      return;
    }
    
    const element = event.currentTarget as HTMLElement;
    
    // Проверяем блокировку статуса
    const isBlocked = await isStatusBlocked(id, type);
    if (isBlocked) {
      clientLogger.debug('Статус заблокирован для изменения', { type, id });
      toast.error('Статус документа заблокирован для ручного изменения. Статус изменяется автоматически через связанные заказы поставщику.');
      return;
    }
    
    // Получаем координаты элемента
    try {
      const rect = element.getBoundingClientRect();
      setStatusDropdown({
        type,
        id,
        x: rect.left,
        y: rect.bottom + 4
      });
    } catch (boundingRectError) {
      clientLogger.error('Error getting bounding rect', boundingRectError);
    }
  };


  // Изменение статуса КП
  const updateQuoteStatus = async (quoteId: string, newStatus: string) => {
    clientLogger.debug('updateQuoteStatus called', { quoteId, newStatus });
    try {
      clientLogger.debug('Updating quote status', { quoteId, newStatus });
      
      // Маппинг русских статусов на английские для API
      const statusMap: Record<string, string> = {
        'Черновик': 'DRAFT',
        'Отправлен': 'SENT', 
        'Согласовано': 'ACCEPTED',
        'Отказ': 'REJECTED'
      };
      
      const apiStatus = statusMap[newStatus] || newStatus;
      clientLogger.apiCall('PUT', `/api/quotes/${quoteId}/status`, { apiStatus });
      
      const response = await fetch(`/api/quotes/${quoteId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${document.cookie.split('; ').find(row => row.startsWith('auth-token='))?.split('=')[1]}`
        },
        body: JSON.stringify({ status: apiStatus })
      });

      if (response.ok) {
        const result = await response.json();
        clientLogger.apiResponse('PUT', `/api/quotes/${quoteId}/status`, response.status);
        
        // Используем функцию из общего модуля для маппинга обратно на русские статусы
        const russianStatus = mapQuoteStatusToRussian(result.quote.status);
        clientLogger.debug('Mapped status', { apiStatus: result.quote.status, russianStatus });
        
        // Обновляем данные клиента
        if (selectedClient) {
          clientLogger.debug('Refreshing client data');
          fetchClientOrders(selectedClient);
        }
        
        hideStatusDropdown();
        clientLogger.debug('Status update completed successfully');
        return result.quote;
      } else {
        const quoteErrorData = await response.json();
        clientLogger.error('API Error updating quote status', new Error(quoteErrorData.error || 'Unknown error'), {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries())
        });
        throw new Error(quoteErrorData.error || 'Ошибка при изменении статуса КП');
      }
    } catch (quoteStatusUpdateError) {
      clientLogger.error('Error updating quote status', quoteStatusUpdateError, { quoteId, newStatus });
      toast.error(`Ошибка при изменении статуса КП: ${quoteStatusUpdateError instanceof Error ? quoteStatusUpdateError.message : 'Неизвестная ошибка'}`);
      throw quoteStatusUpdateError;
    }
  };

  // Изменение статуса Счета
  const updateInvoiceStatus = async (invoiceId: string, newStatus: string) => {
    try {
      clientLogger.debug('updateInvoiceStatus called', { invoiceId, newStatus });
      
      // Маппинг русских статусов на английские для API
      const statusMap: Record<string, string> = {
        'Черновик': 'DRAFT',
        'Отправлен': 'SENT',
        'Оплачен/Заказ': 'PAID',
        'Отменен': 'CANCELLED',
        'Заказ размещен': 'ORDERED',
        'Получен от поставщика': 'RECEIVED_FROM_SUPPLIER',
        'Исполнен': 'COMPLETED'
      };
      
      const apiStatus = statusMap[newStatus] || newStatus;
      clientLogger.apiCall('PUT', `/api/invoices/${invoiceId}/status`, { apiStatus });
      
      const response = await fetch(`/api/invoices/${invoiceId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: apiStatus })
      });

      if (response.ok) {
        const result = await response.json();
        clientLogger.apiResponse('PUT', `/api/invoices/${invoiceId}/status`, response.status);
        
        // Маппинг обратно на русские статусы
        const reverseStatusMap: Record<string, string> = {
          'DRAFT': 'Черновик',
          'SENT': 'Отправлен',
          'PAID': 'Оплачен/Заказ',
          'ORDERED': 'Заказ размещен',
          'CANCELLED': 'Отменен',
          'IN_PRODUCTION': 'В производстве',
          'RECEIVED_FROM_SUPPLIER': 'Получен от поставщика',
          'COMPLETED': 'Исполнен'
        };
        
        const russianStatus = reverseStatusMap[result.invoice.status] || result.invoice.status;
        clientLogger.debug('Mapped status', { apiStatus: result.invoice.status, russianStatus });
        
        // Обновляем данные клиента
        if (selectedClient) {
          clientLogger.debug('Refreshing client data');
          fetchClientOrders(selectedClient);
        }
        
        hideStatusDropdown();
        clientLogger.debug('Invoice status update completed successfully');
        return result.invoice;
      } else {
        const invoiceErrorData = await response.json();
        clientLogger.error('API Error updating invoice status', new Error(invoiceErrorData.error || 'Unknown error'), {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries())
        });
        throw new Error(invoiceErrorData.error || 'Ошибка при изменении статуса счета');
      }
    } catch (invoiceStatusUpdateError) {
      clientLogger.error('Error updating invoice status', invoiceStatusUpdateError, { invoiceId, newStatus });
      toast.error(`Ошибка при изменении статуса счета: ${invoiceStatusUpdateError instanceof Error ? invoiceStatusUpdateError.message : 'Неизвестная ошибка'}`);
      throw invoiceStatusUpdateError;
    }
  };

  // Создание нового счета из КП (на основе Order)
  const createInvoiceFromQuote = async (quoteId: string) => {
    try {
      // Получаем полные данные КП из API
      const quoteResponse = await fetch(`/api/quotes/${quoteId}`);
      if (!quoteResponse.ok) {
        toast.error('Ошибка при получении данных КП');
        return;
      }
      
      const quoteData = await quoteResponse.json();
      const quoteFull = quoteData.quote || quoteData;
      
      if (!quoteFull.cart_data) {
        toast.error('Нет данных корзины для создания счета');
        return;
      }

      const cartData = JSON.parse(quoteFull.cart_data);
      
      // Находим Order, на основе которого создан Quote (через parent_document_id)
      let orderId = quoteFull.parent_document_id;
      
      // Если Quote не связан с Order, создаем Order сначала
      if (!orderId) {
        toast.info('Создаем заказ на основе КП...');
        
        // Создаем Order из данных КП
        const orderResponse = await fetchWithAuth('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: quoteFull.client_id,
            items: cartData,
            total_amount: quoteFull.total_amount || 0,
            subtotal: quoteFull.subtotal || quoteFull.total_amount || 0,
            tax_amount: quoteFull.tax_amount || 0,
            notes: `Создан из КП ${quoteFull.number || ''}`
          })
        });

        if (!orderResponse.ok) {
          const orderError = await orderResponse.json();
          toast.error(`Ошибка при создании заказа: ${orderError.error}`);
          return;
        }
        
        const orderResult = await orderResponse.json();
        orderId = orderResult.order.id;
      }
      
      // Создаем Invoice на основе Order через /api/documents/create
      const response = await fetchWithAuth('/api/documents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'invoice',
          parent_document_id: orderId,
          client_id: quoteFull.client_id,
          items: cartData,
          total_amount: quoteFull.total_amount || 0,
          subtotal: quoteFull.subtotal || quoteFull.total_amount || 0,
          tax_amount: quoteFull.tax_amount || 0,
          notes: `Создан на основе КП ${quoteFull.number || ''}`
        })
      });

      if (response.ok) {
        const result = await response.json();
        toast.success(`Счет создан успешно на основе заказа ${orderId}`);
        
        // Обновляем данные клиента
        if (selectedClient) {
          fetchClientOrders(selectedClient);
        }
      } else {
        const createInvoiceErrorResponse = await response.json();
        toast.error(`Ошибка: ${createInvoiceErrorResponse.error}`);
      }
    } catch (createInvoiceFromQuoteError) {
      clientLogger.error('Error creating invoice from quote', createInvoiceFromQuoteError);
      toast.error('Ошибка при создании счета');
    }
  };

  // Перегенерация КП
  const regenerateQuote = async (quoteId: string) => {
    try {
      // Получаем данные КП из API
      const quoteResponse = await fetchWithAuth(`/api/quotes/${quoteId}`);
      if (!quoteResponse.ok) {
        toast.error('КП не найдено');
        return;
      }
      
      const quoteData = await quoteResponse.json();
      const quoteFull = quoteData.quote || quoteData;
      
      if (!quoteFull.cart_data) {
        toast.error('Нет данных корзины для перегенерации');
        return;
      }

      const cartData = JSON.parse(quoteFull.cart_data);
      
      // Перегенерируем КП через API
      const response = await fetchWithAuth('/api/export/fast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'quote',
          format: 'pdf',
          clientId: quoteFull.client_id,
          items: cartData,
          totalAmount: quoteFull.total_amount || 0
        })
      });

      if (response.ok) {
        // Получаем PDF файл и скачиваем его
        const pdfBlob = await response.blob();
        const url = window.URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        
        // Получаем имя файла из заголовков ответа
        const contentDisposition = response.headers.get('content-disposition');
        let filename = 'quote.pdf';
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="(.+)"/);
          if (filenameMatch) {
            filename = filenameMatch[1];
          }
        }
        
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        toast.success('КП перегенерировано и скачано успешно');
      } else {
        const data = await response.json().catch(() => ({}));
        const err = data?.error;
        const msg = typeof err === 'object' && err?.message ? err.message : (typeof err === 'string' ? err : 'Ошибка экспорта КП');
        toast.error(`Ошибка: ${msg}`);
      }
    } catch (regenerateQuoteError) {
      clientLogger.error('Error regenerating quote', regenerateQuoteError);
      toast.error('Ошибка при перегенерации КП');
    }
  };

  // Перегенерация счета
  const regenerateInvoice = async (invoiceId: string) => {
    try {
      // Получаем данные счета из API
      const invoiceResponse = await fetchWithAuth(`/api/invoices/${invoiceId}`);
      if (!invoiceResponse.ok) {
        toast.error('Счет не найден');
        return;
      }
      const invoiceData = await invoiceResponse.json();
      const invoiceFull = invoiceData.invoice || invoiceData;
      
      if (!invoiceFull.cart_data) {
        toast.error('Нет данных корзины для перегенерации');
        return;
      }

      const cartData = JSON.parse(invoiceFull.cart_data);
      
      // Перегенерируем счет через API
      const response = await fetchWithAuth('/api/export/fast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'invoice',
          format: 'pdf',
          clientId: invoiceFull.client_id,
          items: cartData,
          totalAmount: invoiceFull.total_amount || 0
        })
      });

      if (response.ok) {
        // Получаем PDF файл и скачиваем его
        const pdfBlob = await response.blob();
        const url = window.URL.createObjectURL(pdfBlob);
        const link = document.createElement('a');
        link.href = url;
        
        // Получаем имя файла из заголовков ответа
        const contentDisposition = response.headers.get('content-disposition');
        let filename = 'invoice.pdf';
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="(.+)"/);
          if (filenameMatch) {
            filename = filenameMatch[1];
          }
        }
        
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        toast.success('Счет перегенерирован и скачан успешно');
      } else {
        const data = await response.json().catch(() => ({}));
        const err = data?.error;
        const msg = typeof err === 'object' && err?.message ? err.message : (typeof err === 'string' ? err : 'Ошибка экспорта счета');
        toast.error(`Ошибка: ${msg}`);
      }
    } catch (regenerateInvoiceError) {
      clientLogger.error('Error regenerating invoice', regenerateInvoiceError);
      toast.error('Ошибка при перегенерации счета');
    }
  };

  // Удаление КП
  const deleteQuote = async (quoteId: string) => {
    try {
      const response = await fetch(`/api/quotes/${quoteId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // Обновляем данные клиента
        if (selectedClient) {
          fetchClientOrders(selectedClient);
        }
        toast.success('КП удалено успешно');
      } else {
        const deleteQuoteErrorResponse = await response.json();
        toast.error(`Ошибка: ${deleteQuoteErrorResponse.error}`);
      }
    } catch (deleteQuoteError) {
      clientLogger.error('Error deleting quote', deleteQuoteError);
      toast.error('Ошибка при удалении КП');
    }
  };

  // Удаление счета
  const deleteInvoice = async (invoiceId: string) => {
    try {
      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // Обновляем данные клиента
        if (selectedClient) {
          fetchClientOrders(selectedClient);
        }
        toast.success('Счет удален успешно');
      } else {
        const deleteInvoiceErrorResponse = await response.json();
        toast.error(`Ошибка: ${deleteInvoiceErrorResponse.error}`);
      }
    } catch (deleteInvoiceError) {
      clientLogger.error('Error deleting invoice', deleteInvoiceError);
      toast.error('Ошибка при удалении счета');
    }
  };

  // Функции для открытия модальных окон комментариев и истории
  const openCommentsModal = (documentId: string, documentType: 'quote' | 'invoice', documentNumber: string) => {
    setSelectedDocument({ id: documentId, type: documentType, number: documentNumber });
    setShowCommentsModal(true);
  };

  const closeCommentsModal = () => {
    setShowCommentsModal(false);
    // Обновляем количество комментариев после закрытия модального окна
    if (selectedDocument) {
      fetchCommentsCount(selectedDocument.id);
    }
  };

  const openHistoryModal = (documentId: string, documentType: 'quote' | 'invoice', documentNumber: string) => {
    setSelectedDocument({ id: documentId, type: documentType, number: documentNumber });
    setShowHistoryModal(true);
  };

  // Функция для фокуса на документ при переходе из уведомления
  const focusOnDocument = useCallback((documentId: string) => {
    // Находим клиента, у которого есть этот документ
    const clientWithDocument = clients.find(client => {
      return orders.some(o => o.id === documentId);
    });
    
    if (clientWithDocument) {
      setSelectedClient(clientWithDocument.id);
      // Открываем модальное окно заказа
      if (orders.some(o => o.id === documentId)) {
        const order = orders.find(o => o.id === documentId);
        if (order) {
          setSelectedOrderId(order.id);
          setIsOrderModalOpen(true);
        }
      }
    }
  }, [clients, orders]);

  // Обработка фокуса из URL параметров
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const focusDocumentId = urlParams.get('focus');
    if (focusDocumentId) {
      focusOnDocument(focusDocumentId);
      // Очищаем URL параметр
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [clients, orders, focusOnDocument]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Вкладка "Заказы и документы" */}
      {activeTab === 'documents' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:[grid-template-columns:1.3fr_2fr]">
        <div className="md:col-span-1 space-y-4">
          <Card variant="base">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-black flex items-center"><Users className="h-5 w-5 mr-2"/>Клиенты</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowCreateClientForm(true)}
                  className="px-3 py-1 text-sm border border-gray-300 hover:border-black transition-all duration-200"
                  title="Создать нового клиента"
                >
                  Создать
                </button>
                <button
                  onClick={() => {
                    setShowInWorkOnly(currentValue => !currentValue);
                  }}
                  className={`px-3 py-1 text-sm border transition-all duration-200 ${showInWorkOnly ? 'border-black bg-black text-white' : 'border-gray-300 hover:border-black'}`}
                  title="Показать клиентов с незавершенными документами"
                >
                  В работе
                </button>
              </div>
            </div>
            <div className="p-4">
              <div className="relative">
                <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Поиск по ФИО, телефону, адресу..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-black/50"
          />
        </div>
            </div>
            <div className="p-0">
              <div className="divide-y">
                {filteredClients.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedClient(c.id)}
                    className={`w-full text-left p-4 hover:bg-gray-50 ${selectedClient===c.id?'bg-blue-50':''}`}
                  >
                    <div className="grid items-center gap-4" style={{gridTemplateColumns:'8fr 4fr'}}>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{c.lastName} {c.firstName}{c.middleName?` ${c.middleName}`:''}</div>
                        <div className="text-xs text-gray-600 truncate">{c.address||'—'}</div>
                      </div>
                      <div className="text-xs text-gray-600 truncate flex items-center"><Phone className="h-3.5 w-3.5 mr-1"/>{formatPhone(c.phone||'')}</div>
                    </div>
                  </button>
                ))}
                {clients.length===0 && (
                  <div className="p-4 text-sm text-gray-500">Нет клиентов</div>
                )}
              </div>
            </div>
          </Card>
        </div>

        <div className="md:col-span-1">
          <Card variant="base">
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-black mb-3">Заказы и документы</h3>
              {selectedClient ? (
                <div className="min-w-0 mb-3">
                  {(() => {
                    const c = clients.find(x => x.id===selectedClient);
                    if (!c) return null;
                    return (
                      <>
                        <div className="font-semibold text-black truncate">{c.lastName} {c.firstName}{c.middleName?` ${c.middleName}`:''}</div>
                        <div className="text-sm text-gray-600 truncate flex items-center">
                          <Phone className="h-3.5 w-3.5 mr-1"/>{formatPhone(c.phone||'')}<span className="mx-2">•</span>Адрес: {c.address||'—'}
                        </div>
                      </>
                    );
                  })()}
        </div>
              ) : (
                <div className="text-gray-600 mb-3">Выберите клиента слева</div>
              )}
            </div>

            {selectedClient && (
              <div className="p-4">
                <div className="mb-4">
                  <h3 className="text-base font-semibold text-gray-900 mb-3">Заказы и документы</h3>
                </div>

                <>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      {COMPLECTATOR_FILTER_STATUSES.map(s => (
                        <button key={s}
                          onClick={() => setOrdersFilter(s)}
                          className={`px-3 py-1 text-sm border ${ordersFilter===s?'border-black bg-black text-white':'border-gray-300 hover:border-black'}`}
                        >{s==='all'?'Все':s}</button>
                      ))}
                    </div>
                    <div className="space-y-2">
                      {orders.filter(o => ordersFilter==='all' || o.status===ordersFilter).map(o => (
                        <div 
                          key={o.id} 
                          className="border border-gray-200 p-3 hover:border-black transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div 
                              className="flex-1 cursor-pointer"
                          onClick={() => {
                            setSelectedOrderId(o.id);
                            setIsOrderModalOpen(true);
                          }}
                        >
                              <div className="flex items-center space-x-3">
                                <div className="font-medium text-black">{o.number}</div>
                                <div className="text-sm text-gray-600">от {o.date}</div>
                                <span className={`px-2 py-0.5 text-xs border rounded ${badgeByInvoiceStatus(o.displayStatus || o.status)}`}>
                                  {o.displayStatus || o.status}
                                </span>
                                {o.total > 0 && (
                                  <div className="text-sm text-gray-600">
                                    {o.total.toLocaleString('ru-RU')} ₽
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      {orders.filter(o => ordersFilter==='all' || o.status===ordersFilter).length===0 && (
                        <div className="text-sm text-gray-500">Нет заказов по выбранному фильтру</div>
                      )}
                    </div>
                </>
              </div>
            )}
          </Card>
        </div>
        </div>
      )}

      {/* Модальное окно создания клиента */}
      <CreateClientModal
        isOpen={showCreateClientForm}
        onClose={() => setShowCreateClientForm(false)}
        onClientCreated={(client) => {
          // Обновляем список клиентов
          const newClient = {
            id: client.id,
            firstName: client.firstName,
            lastName: client.lastName,
            middleName: client.middleName,
            phone: client.phone,
            address: client.address,
            objectId: (client as any).objectId || '',
            lastActivityAt: new Date().toISOString(),
            lastDoc: undefined
          };
          setClients(prev => [...prev, newClient]);
          setSelectedClient(client.id);
        }}
      />

      {/* Выпадающее меню статуса */}
      {statusDropdown && (
        <div 
          className="fixed z-50 bg-white border border-gray-300 rounded-xl shadow-xl py-2 min-w-[160px] backdrop-blur-sm"
          style={{ 
            left: statusDropdown.x, 
            top: statusDropdown.y 
          }}
          data-status-dropdown
        >
          {statusDropdown.type === 'quote' && (
            <>
              {statusDropdown.id && (() => {
                // Используем функцию из общего модуля для получения списка статусов
                const allStatuses = getQuoteFilterStatuses();
                
                return allStatuses.map((status, index) => (
                  <div key={status}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        clientLogger.debug('Status clicked', { quoteId: statusDropdown!.id, status });
                        updateQuoteStatus(statusDropdown!.id, status);
                      }}
                      className={`w-full px-4 py-2.5 text-sm text-left transition-all duration-200 hover:bg-gray-50 hover:text-gray-900`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{status}</span>
                      </div>
                    </button>
                    {index < allStatuses.length - 1 && (
                      <div className="mx-4 border-t border-gray-100"></div>
                    )}
                  </div>
                ));
              })()}
            </>
          )}
          
          {statusDropdown.type === 'invoice' && (
            <>
              {statusDropdown.id && (() => {
                // Получаем данные счета из API для получения текущего статуса
                // Для упрощения показываем все статусы
                const getAllStatuses = () => {
                  return ['Новый заказ', 'Счет выставлен', 'Счет оплачен (Заказываем)', 'Отменен'];
                };
                
                const allStatuses = getAllStatuses();
                
                return allStatuses.map((status, index) => (
                  <div key={status}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateInvoiceStatus(statusDropdown!.id, status);
                      }}
                      className={`w-full px-4 py-2.5 text-sm text-left transition-all duration-200 hover:bg-gray-50 hover:text-gray-900`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{status}</span>
                      </div>
                    </button>
                    {index < allStatuses.length - 1 && (
                      <div className="mx-4 border-t border-gray-100"></div>
                    )}
                  </div>
                ));
              })()}
            </>
          )}
        </div>
      )}

      {/* Модальное окно комментариев */}
      <CommentsModal
        isOpen={showCommentsModal}
        onClose={closeCommentsModal}
        documentId={selectedDocument?.id || ''}
        documentType={selectedDocument?.type || 'quote'}
        documentNumber={selectedDocument?.number || ''}
      />

      {/* Модальное окно истории */}
      <HistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        documentId={selectedDocument?.id || ''}
        documentType={selectedDocument?.type || 'quote'}
        documentNumber={selectedDocument?.number || ''}
      />

      {/* Модальное окно подтверждения удаления */}
      <DeleteConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => {
          clientLogger.debug('Закрытие модального окна удаления');
          setDeleteModal(prev => ({ ...prev, isOpen: false }));
        }}
        onConfirm={async () => {
          clientLogger.debug('Подтверждение удаления в модальном окне', { type: deleteModal.type, id: deleteModal.id });
          try {
            if (deleteModal.type === 'quote' && deleteModal.id) {
              await deleteQuote(deleteModal.id);
            } else if (deleteModal.type === 'invoice' && deleteModal.id) {
              await deleteInvoice(deleteModal.id);
            }
            clientLogger.debug('Удаление завершено, закрываем модальное окно');
          } catch (modalError) {
            clientLogger.error('Ошибка в модальном окне', modalError);
            throw modalError; // Перебрасываем ошибку, чтобы модальное окно не закрылось
          }
        }}
        title={deleteModal.type === 'quote' ? 'Удаление КП' : 'Удаление счета'}
        message={deleteModal.type === 'quote' 
          ? 'Вы уверены, что хотите удалить это КП? Все связанные данные будут потеряны.'
          : 'Вы уверены, что хотите удалить этот счет? Все связанные данные будут потеряны.'
        }
        itemName={deleteModal.name || undefined}
      />

      {/* Модальное окно деталей заказа */}
      {selectedOrderId && (
        <OrderDetailsModal
          isOpen={isOrderModalOpen}
          onClose={() => {
            setIsOrderModalOpen(false);
            setSelectedOrderId(null);
          }}
          orderId={selectedOrderId}
          userRole={user.role}
          onOrderUpdate={async () => {
            // Обновляем список заказов после смены статуса
            if (selectedClient) {
              await fetchClientOrders(selectedClient);
            }
          }}
        />
      )}
    </div>
  );
}