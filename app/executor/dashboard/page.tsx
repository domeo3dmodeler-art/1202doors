'use client';

// Отключаем статическую генерацию (динамический контент) - должно быть до импортов
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Card } from '../../../components/ui';
import StatCard from '../../../components/ui/StatCard';
import DeleteConfirmModal from '@/components/ui/DeleteConfirmModal';
import NotificationBell from '@/components/ui/NotificationBell';
import CommentsModal from '@/components/ui/CommentsModal';
import HistoryModal from '@/components/ui/HistoryModal';
import { DocumentQuickViewModal } from '@/components/documents/DocumentQuickViewModal';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { toast } from 'sonner';
import { clientLogger } from '@/lib/logging/client-logger';
import { fetchWithAuth } from '@/lib/utils/fetch-with-auth';
import { parseApiResponse } from '@/lib/utils/parse-api-response';
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
  ShoppingCart,
  Package,
  Plus,
  MoreVertical
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { OrdersBoard } from '../../../components/executor/OrdersBoard';
import { CreateClientModal } from '@/components/clients/CreateClientModal';
import { 
  mapInvoiceStatusToRussian, 
  mapSupplierOrderStatusToRussian,
  getInvoiceFilterStatuses,
  getSupplierOrderFilterStatuses
} from '@/lib/utils/status-mapping';
import { INVOICE_STATUSES } from '@/lib/utils/document-statuses';

// Типы для фильтров на основе констант
type InvoiceFilterStatus = 'all' | typeof INVOICE_STATUSES[keyof typeof INVOICE_STATUSES]['label'];
type SupplierOrderFilterStatus = 'all' | 'Черновик' | 'Отправлен' | 'Заказ размещен' | 'Получен от поставщика' | 'Исполнен';

interface ExecutorStats {
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
  totalRevenue: number;
}

export default function ExecutorDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<ExecutorStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'cart' | 'documents' | 'orders'>('cart');
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
    lastDoc?: { type: 'invoice'|'supplier_order'; status: string; id: string; date: string; total?: number };
  }>>([]);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [clientTab, setClientTab] = useState<'invoices'|'supplier_orders'>('invoices');
  const [invoices, setInvoices] = useState<Array<{ id: string; number: string; date: string; status: InvoiceFilterStatus; total: number; dueAt?: string }>>([]);
  const [supplierOrders, setSupplierOrders] = useState<Array<{ id: string; number: string; date: string; status: SupplierOrderFilterStatus; total: number; supplierName?: string; invoiceInfo?: { id: string; number: string; total_amount: number } }>>([]);
  const [invoicesFilter, setInvoicesFilter] = useState<InvoiceFilterStatus>('all');
  const [supplierOrdersFilter, setSupplierOrdersFilter] = useState<SupplierOrderFilterStatus>('all');
  const [showInWorkOnly, setShowInWorkOnly] = useState(false);
  const [showCreateClientForm, setShowCreateClientForm] = useState(false);
  const [showClientsModal, setShowClientsModal] = useState(false);
  const [clientsModalInWorkOnly, setClientsModalInWorkOnly] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [clientIdsWithActiveOrders, setClientIdsWithActiveOrders] = useState<Set<string>>(new Set());
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    type: 'invoice' | 'supplier_order' | null;
    id: string | null;
    name: string | null;
  }>({
    isOpen: false,
    type: null,
    id: null,
    name: null
  });
  const [statusDropdown, setStatusDropdown] = useState<{type: 'invoice'|'supplier_order', id: string, x: number, y: number} | null>(null);
  const [showInvoiceActions, setShowInvoiceActions] = useState<string | null>(null);
  const [showSupplierOrderActions, setShowSupplierOrderActions] = useState<string | null>(null);
  
  // Состояние для модальных окон комментариев и истории
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<{id: string, type: 'invoice' | 'supplier_order', number: string} | null>(null);
  
  // Состояние для количества комментариев по документам
  const [commentsCount, setCommentsCount] = useState<Record<string, number>>({});
  
  // Состояние для модального окна документа
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);

  // Функции для открытия модальных окон
  const openCommentsModal = (documentId: string, documentType: 'invoice' | 'supplier_order', documentNumber: string) => {
    setSelectedDocument({ id: documentId, type: documentType, number: documentNumber });
    setShowCommentsModal(true);
  };

  const openHistoryModal = (documentId: string, documentType: 'invoice' | 'supplier_order', documentNumber: string) => {
    setSelectedDocument({ id: documentId, type: documentType, number: documentNumber });
    setShowHistoryModal(true);
  };

  // Функция для загрузки количества комментариев для документа
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
    } catch (error) {
      clientLogger.error('Error fetching comments count', error);
    }
  }, []);

  // Функция для загрузки количества комментариев для всех документов клиента
  const fetchAllCommentsCount = useCallback(async (invoices: any[], supplierOrders: any[]) => {
    const allDocuments = [...invoices, ...supplierOrders];
    const promises = allDocuments.map(doc => fetchCommentsCount(doc.id));
    await Promise.all(promises);
  }, [fetchCommentsCount]);

  // Скрыть выпадающее меню (определяем ПЕРЕД использованием в useEffect)
  const hideStatusDropdown = useCallback(() => {
    setStatusDropdown(null);
  }, []);

  // Загрузка статистики (определяем ПЕРЕД использованием в useEffect)
  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      // Имитация загрузки статистики
      await new Promise(resolve => setTimeout(resolve, 1000));
      setStats({ totalOrders: 0, pendingOrders: 0, completedOrders: 0, totalRevenue: 0 });
    } catch (error) {
      clientLogger.error('Ошибка загрузки статистики', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Загрузка списка клиентов (оптимизированная)
  const fetchClients = useCallback(async () => {
    try {
      const response = await fetchWithAuth('/api/clients');
      if (response.ok) {
        const data = await response.json();
        const parsedData = parseApiResponse<{ clients: any[] }>(data);
        // Преобразуем данные клиентов в нужный формат
        const formattedClients = (parsedData.clients || []).map((client: any) => ({
          id: client.id,
          firstName: client.firstName,
          lastName: client.lastName,
          middleName: client.middleName,
          phone: client.phone,
          address: client.address,
          objectId: client.objectId,
          lastActivityAt: client.createdAt,
          lastDoc: undefined // Будет загружаться отдельно при выборе клиента
        }));
        setClients(formattedClients);
      } else {
        // Получаем детали ошибки из Response
        let errorData = null;
        try {
          errorData = await response.json();
        } catch (e) {
          // Если не удалось распарсить JSON, используем текст
          errorData = { status: response.status, statusText: response.statusText };
        }
        
        clientLogger.error(
          `Failed to fetch clients: ${response.status} ${response.statusText}`,
          new Error(`HTTP ${response.status}: ${response.statusText}`),
          {
            status: response.status,
            statusText: response.statusText,
            error: errorData,
            url: '/api/clients'
          }
        );
      }
    } catch (error) {
      clientLogger.error(
        'Error fetching clients',
        error instanceof Error ? error : new Error(String(error)),
        {
          url: '/api/clients',
          error: error instanceof Error ? error.message : String(error)
        }
      );
    }
  }, []);

  // Загрузка документов клиента (оптимизированная с мемоизацией)
  const fetchClientDocuments = useCallback(async (clientId: string) => {
    if (!clientId) {
      clientLogger.error('fetchClientDocuments: clientId is required');
      return;
    }
    
    try {
      // Показываем индикатор загрузки
      setInvoices([]);
      setSupplierOrders([]);
      
      const response = await fetchWithAuth(`/api/clients/${clientId}`);
      
      if (!response.ok) {
        // Пытаемся получить данные об ошибке, но не падаем, если это не JSON
        let errorData: any = {};
        try {
          const contentType = response.headers.get('content-type');
          if (contentType && contentType.includes('application/json')) {
            errorData = await response.json();
          } else {
            const text = await response.text();
            errorData = { message: text || 'Unknown error' };
          }
        } catch (parseError) {
          // Игнорируем ошибки парсинга
          errorData = { message: `HTTP ${response.status}: ${response.statusText}` };
        }
        
        clientLogger.error('Failed to fetch client documents:', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          clientId
        });
        
        // Показываем пользователю понятное сообщение
        if (response.status === 404) {
          toast.error('Клиент не найден');
        } else if (response.status === 403) {
          toast.error('Нет доступа к данным клиента');
        } else {
          toast.error('Ошибка при загрузке документов клиента');
        }
        return;
      }
      
      // Парсим успешный ответ
      let data: any;
      try {
        data = await response.json();
      } catch (parseError) {
        clientLogger.error('Failed to parse response as JSON:', parseError);
        toast.error('Ошибка при обработке ответа сервера');
        return;
      }
      
      const parsedData = parseApiResponse<{ client: any }>(data);
      const client = parsedData?.client;
      
      if (!client) {
        clientLogger.error('Client data is missing in response:', { parsedData, data });
        toast.error('Данные клиента не найдены в ответе');
        return;
      }
      
      // Преобразуем Счета (только нужные поля)
      const invoices = Array.isArray(client.invoices) ? client.invoices : [];
      const formattedInvoices = invoices.map((invoice: any) => ({
        id: invoice.id,
        number: invoice.number ? invoice.number.replace('INVOICE-', 'СЧ-') : `СЧ-${invoice.id.slice(-6)}`,
        date: new Date(invoice.created_at).toISOString().split('T')[0],
        status: mapInvoiceStatusToRussian(invoice.status) as InvoiceFilterStatus,
        total: Number(invoice.total_amount) || 0,
        dueAt: invoice.due_date ? new Date(invoice.due_date).toISOString().split('T')[0] : undefined
      }));
      setInvoices(formattedInvoices);
      
      // Преобразуем Заказы у поставщика (только нужные поля)
      // Примечание: API не возвращает supplierOrders напрямую, нужно получать через orders
      const orders = Array.isArray(client.orders) ? client.orders : [];
      const supplierOrdersFromOrders = orders.flatMap((order: any) => 
        Array.isArray(order.supplier_orders) ? order.supplier_orders : []
      );
      
      clientLogger.debug('📦 Обрабатываем заказы у поставщика:', {
        ordersCount: orders.length,
        supplierOrdersCount: supplierOrdersFromOrders.length,
        hasSupplierOrders: !!client.supplierOrders
      });
      
      const formattedSupplierOrders = supplierOrdersFromOrders.map((so: any) => ({
        id: so.id,
        number: so.number ? so.number.replace('SUPPLIER-', 'Заказ-') : `Заказ-${so.id.slice(-6)}`,
        date: new Date(so.created_at).toISOString().split('T')[0],
        status: mapSupplierOrderStatusToRussian(so.status) as SupplierOrderFilterStatus,
        total: so.total_amount || so.order?.total_amount || 0,
        supplierName: so.supplier_name,
        invoiceInfo: so.invoiceInfo
      }));
      
      clientLogger.debug('📦 Форматированные заказы у поставщика:', formattedSupplierOrders.length);
      setSupplierOrders(formattedSupplierOrders);
      
      // Загружаем количество комментариев для всех документов
      try {
        await fetchAllCommentsCount(formattedInvoices, formattedSupplierOrders);
      } catch (commentsError) {
        // Не блокируем загрузку документов, если загрузка комментариев не удалась
        clientLogger.error('Error fetching comments count:', commentsError);
      }
    } catch (error) {
      clientLogger.error('Error fetching client documents:', error);
      toast.error('Ошибка при загрузке документов клиента');
    }
  }, [fetchAllCommentsCount]);

  // Запускаем загрузку данных после определения всех функций
  useEffect(() => {
    fetchStats();
    fetchClients();
  }, [fetchStats, fetchClients]);

  // Закрытие выпадающих меню при клике вне их
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
      if (!target.closest('[data-invoice-actions]') && !target.closest('[data-supplier-order-actions]')) {
        setShowInvoiceActions(null);
        setShowSupplierOrderActions(null);
      }
    };

    if (statusDropdown || showInvoiceActions || showSupplierOrderActions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [statusDropdown, showInvoiceActions, showSupplierOrderActions, hideStatusDropdown]);

  // Оптимизированная фильтрация клиентов с мемоизацией
  const filteredClients = useMemo(() => {
    return clients
      .filter(c => !showInWorkOnly || clientIdsWithActiveOrders.has(c.id))
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
  }, [clients, search, showInWorkOnly, clientIdsWithActiveOrders]);

  const inWorkCount = useMemo(() => clients.filter(c => clientIdsWithActiveOrders.has(c.id)).length, [clients, clientIdsWithActiveOrders]);
  const modalFilteredClients = useMemo(() => {
    return clients
      .filter(c => !clientsModalInWorkOnly || clientIdsWithActiveOrders.has(c.id))
      .filter(c => {
        const q = modalSearch.trim().toLowerCase();
        if (!q) return true;
        const fio = `${c.lastName} ${c.firstName} ${c.middleName || ''}`.toLowerCase();
        const phoneStr = c.phone ? c.phone.toLowerCase() : '';
        const addressStr = c.address ? c.address.toLowerCase() : '';
        return fio.includes(q) || phoneStr.includes(q) || addressStr.includes(q);
      })
      .sort((a, b) => {
        const ta = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
        const tb = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
        return tb - ta;
      });
  }, [clients, modalSearch, clientsModalInWorkOnly]);

  useEffect(() => {
    if (!selectedClient) return;
    fetchClientDocuments(selectedClient);
  }, [selectedClient, fetchClientDocuments]);

  const terminalOrderStatuses = new Set(['COMPLETED', 'CANCELLED']);
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetchWithAuth(`/api/orders?executor_id=${user.id}`);
        if (!response.ok || cancelled) return;
        const data = await response.json();
        const parsed = parseApiResponse<{ orders?: Array<{ client_id: string; status: string }> }>(data);
        const orders = parsed?.orders ?? [];
        const ids = new Set<string>();
        for (const o of orders) {
          if (o.client_id && !terminalOrderStatuses.has(o.status)) ids.add(o.client_id);
        }
        if (!cancelled) setClientIdsWithActiveOrders(ids);
      } catch {
        if (!cancelled) setClientIdsWithActiveOrders(new Set());
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const formatPhone = (raw?: string) => {
    if (!raw) return '—';
    const digits = raw.replace(/\D/g, '');
    const d = digits.length >= 10 ? digits.slice(-10) : digits;
    if (d.length < 10) return raw;
    return `+7 (${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6,8)}-${d.slice(8,10)}`;
  };

  const badgeByInvoiceStatus = (s: InvoiceFilterStatus) => {
    switch (s) {
      case 'Черновик': return 'border-gray-300 text-gray-700';
      case 'Отправлен': return 'border-blue-300 text-blue-700';
      case 'Оплачен/Заказ': return 'border-green-300 text-green-700';
      case 'Отменен': return 'border-red-300 text-red-700';
      case 'Заказ размещен': return 'border-yellow-300 text-yellow-800';
      case 'Получен от поставщика': return 'border-purple-300 text-purple-700';
      case 'Исполнен': return 'border-emerald-300 text-emerald-700';
    }
  };

  const badgeBySupplierOrderStatus = (s: SupplierOrderFilterStatus) => {
    switch (s) {
      case 'Черновик': return 'border-gray-300 text-gray-700';
      case 'Отправлен': return 'border-blue-300 text-blue-700';
      case 'Заказ размещен': return 'border-yellow-300 text-yellow-800';
      case 'Получен от поставщика': return 'border-purple-300 text-purple-700';
      case 'Исполнен': return 'border-emerald-300 text-emerald-700';
    }
  };


  // Показать выпадающее меню статуса
  const showStatusDropdown = (type: 'invoice'|'supplier_order', id: string, event: React.MouseEvent) => {
    clientLogger.debug('🎯 Showing status dropdown:', { type, id });
    
    // Проверяем, что элемент существует
    if (!event.currentTarget) {
      clientLogger.error('❌ event.currentTarget is null');
      return;
    }
    
    try {
      const rect = event.currentTarget.getBoundingClientRect();
      setStatusDropdown({
        type,
        id,
        x: rect.left,
        y: rect.bottom + 4
      });
    } catch (error) {
      clientLogger.error('❌ Error getting bounding rect:', error);
    }
  };

  // Изменение статуса Счета
  const updateInvoiceStatus = async (invoiceId: string, newStatus: string) => {
    try {
      clientLogger.debug('🚀 updateInvoiceStatus called with:', { invoiceId, newStatus });
      
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
      clientLogger.debug('📤 Sending to API:', { apiStatus });
      
      const response = await fetchWithAuth(`/api/invoices/${invoiceId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ status: apiStatus })
      });

      clientLogger.debug('📥 API Response status:', response.status);

      if (response.ok) {
        const result = await response.json();
        const parsedResult = parseApiResponse<{ invoice: any }>(result);
        clientLogger.debug('✅ API Response data:', parsedResult);
        
        // Маппинг обратно на русские статусы
        const reverseStatusMap: Record<string, string> = {
          'DRAFT': 'Черновик',
          'SENT': 'Отправлен',
          'PAID': 'Оплачен/Заказ',
          'CANCELLED': 'Отменен',
          'ORDERED': 'Заказ размещен',
          'RECEIVED_FROM_SUPPLIER': 'Получен от поставщика',
          'COMPLETED': 'Исполнен'
        };
        
        const russianStatus = reverseStatusMap[parsedResult.invoice.status] || parsedResult.invoice.status;
        clientLogger.debug('🔄 Mapped status:', { apiStatus: parsedResult.invoice.status, russianStatus });
        
        // Обновляем список Счетов
        setInvoices(prev => prev.map(inv => 
          inv.id === invoiceId ? { 
            ...inv, 
            status: russianStatus as any
          } : inv
        ));
        
        hideStatusDropdown();
        clientLogger.debug('✅ Invoice status update completed successfully');
        return parsedResult.invoice;
      } else {
        const errorData = await response.json();
        clientLogger.error('❌ API Error:', errorData);
        clientLogger.error('❌ Response status:', response.status);
        clientLogger.error('❌ Response headers:', Object.fromEntries(response.headers.entries()));
        throw new Error(errorData.error || 'Ошибка при изменении статуса счета');
      }
    } catch (error) {
      clientLogger.error('❌ Error updating invoice status:', error);
      toast.error(`Ошибка при изменении статуса счета: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`);
      throw error;
    }
  };

  // Создание нового счета из существующего счета
  const createInvoiceFromInvoice = async (invoiceId: string) => {
    try {
      // Получаем данные счета
      const invoice = invoices.find(inv => inv.id === invoiceId);
      if (!invoice) {
        toast.error('Счет не найден');
        return;
      }

      // Получаем полные данные счета из API
      const invoiceResponse = await fetchWithAuth(`/api/invoices/${invoiceId}`);
      if (!invoiceResponse.ok) {
        toast.error('Ошибка при получении данных счета');
        return;
      }
      
      const invoiceData = await invoiceResponse.json();
      const parsedInvoiceData = parseApiResponse<{ invoice: any }>(invoiceData);
      
      if (!parsedInvoiceData.invoice.cart_data) {
        toast.error('Нет данных корзины для создания нового счета');
        return;
      }

      const cartData = JSON.parse(parsedInvoiceData.invoice.cart_data);
      
      // Создаем новый счет через API
      const response = await fetchWithAuth('/api/export/fast', {
        method: 'POST',
        body: JSON.stringify({
          type: 'invoice',
          format: 'pdf',
          clientId: parsedInvoiceData.invoice.client_id,
          items: cartData,
          totalAmount: invoice.total
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
        
        // Обновляем данные клиента
        if (selectedClient) {
          fetchClientDocuments(selectedClient);
        }
        toast.success('Счет создан и скачан успешно');
      } else {
        const error = await response.json();
        toast.error(`Ошибка: ${error.error}`);
      }
    } catch (error) {
      clientLogger.error('Error creating invoice from invoice:', error);
      toast.error('Ошибка при создании счета');
    }
  };

  // Создание заказа у поставщика из счета
  const createSupplierOrderFromInvoice = async (invoiceId: string) => {
    try {
      // Получаем данные счета
      const invoice = invoices.find(inv => inv.id === invoiceId);
      if (!invoice) {
        toast.error('Счет не найден');
        return;
      }

      // Получаем полные данные счета из API
      const invoiceResponse = await fetch(`/api/invoices/${invoiceId}`);
      if (!invoiceResponse.ok) {
        toast.error('Ошибка при получении данных счета');
        return;
      }
      
      const invoiceData = await invoiceResponse.json();
      let orderId = invoiceData.invoice.order_id;
      
      // Если у счета нет связанного заказа, создаем его
      if (!orderId) {
        clientLogger.debug('🔄 Creating Order for Invoice:', invoiceId);
        
        const cartData = invoiceData.invoice.cart_data ? JSON.parse(invoiceData.invoice.cart_data) : null;
        
        const orderResponse = await fetchWithAuth('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: invoiceData.invoice.client_id,
            status: 'PENDING',
            total_amount: invoiceData.invoice.total_amount,
            currency: invoiceData.invoice.currency || 'RUB',
            notes: `Автоматически создан из счета ${invoice.number} для Заказа у поставщика`,
            cart_data: cartData,
            items: cartData && cartData.items ? cartData.items.map((item: any) => ({
              productId: item.id || 'unknown',
              quantity: item.quantity || item.qty || 1,
              price: item.unitPrice || item.price || 0,
              notes: item.name || item.model || ''
            })) : []
          })
        });

        if (!orderResponse.ok) {
          const error = await orderResponse.json();
          toast.error(`Ошибка при создании заказа: ${error.error}`);
          return;
        }
        const newOrder = await orderResponse.json();
        orderId = newOrder.order.id;

        // Обновляем счет, чтобы связать его с новым заказом
        await fetchWithAuth(`/api/invoices/${invoiceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: orderId })
        });
        clientLogger.debug('✅ Invoice updated with new Order ID:', orderId);
      }

      // Создаем заказ у поставщика через API
      const response = await fetchWithAuth(`${window.location.origin}/api/supplier-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceId: invoiceId,
          orderId: orderId,
          supplierName: 'Поставщик по умолчанию',
          supplierEmail: '',
          supplierPhone: '',
          expectedDate: null,
          notes: `Создан на основе счета ${invoice.number}`,
          cartData: invoiceData.invoice.cart_data ? JSON.parse(invoiceData.invoice.cart_data) : { items: [] }
        })
      });

      if (response.ok) {
        const result = await response.json();
        clientLogger.debug('✅ Supplier Order created:', result);

        // Генерируем Excel файл заказа у поставщика
        try {
          await generateSupplierOrderExcel(result.supplierOrder.id);
        } catch (excelError) {
          clientLogger.error('Error generating Excel:', excelError);
          toast.warning('Заказ у поставщика создан, но произошла ошибка при генерации Excel файла');
        }

        // Обновляем данные клиента
        if (selectedClient) {
          fetchClientDocuments(selectedClient);
        }
      } else {
        const error = await response.json();
        toast.error(`Ошибка: ${error.error}`);
      }
    } catch (error) {
      clientLogger.error('Error creating supplier order:', error);
      toast.error('Ошибка при создании заказа у поставщика');
    }
  };

  // Генерация Excel файла заказа у поставщика
  const generateSupplierOrderExcel = async (supplierOrderId: string) => {
    try {
      clientLogger.debug('📊 Generating Excel for supplier order:', supplierOrderId);
      
      const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
        headers['x-auth-token'] = token;
      }

      const response = await fetch(`${window.location.origin}/api/supplier-orders/${supplierOrderId}/excel`, {
        headers,
        credentials: 'include'
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
        a.download = `Заказ_у_поставщика_${supplierOrderId.slice(-6)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        clientLogger.debug('✅ Excel file downloaded successfully', { size: blob.size });
        toast.success('Excel файл успешно скачан');
      } else {
        let errorMessage = 'Ошибка при генерации Excel файла';
        try {
          const errorData = await response.json();
          if (errorData.error) {
            if (typeof errorData.error === 'string') {
              errorMessage = errorData.error;
            } else if (errorData.error.message) {
              errorMessage = errorData.error.message;
            }
          } else if (errorData.message) {
            errorMessage = errorData.message;
          }
          clientLogger.error('❌ Error generating Excel:', errorData);
        } catch (parseError) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          clientLogger.error('❌ Error parsing error response:', parseError);
        }
        toast.error(errorMessage);
        throw new Error(errorMessage);
      }
    } catch (error) {
      clientLogger.error('❌ Error generating Excel:', error);
      const errorMessage = error instanceof Error ? error.message : 'Ошибка при генерации Excel файла';
      toast.error(errorMessage);
      throw error;
    }
  };

  // Удаление счета
  // Удаление счета
  const deleteInvoice = async (invoiceId: string) => {
    clientLogger.debug('🗑️ Удаление счета:', invoiceId);
    clientLogger.debug('🔍 Проверяем invoiceId:', typeof invoiceId, invoiceId);
    
    try {
      clientLogger.debug('📡 Отправляем запрос на удаление счета...');
      const response = await fetch(`/api/invoices/${invoiceId}`, {
        method: 'DELETE'
      });

      clientLogger.debug('📡 Ответ сервера:', response.status, response.statusText);

      if (response.ok) {
        clientLogger.debug('✅ Счет удален успешно');
        // Обновляем локальный список
        setInvoices(prev => prev.filter(inv => inv.id !== invoiceId));
        
        // НЕ обновляем данные клиента, так как локальное состояние уже корректно
        // if (selectedClient) {
        //   clientLogger.debug('🔄 Обновляем данные клиента...');
        //   await fetchClientDocuments(selectedClient);
        // }
        
        toast.success('Счет удален успешно');
      } else {
        const error = await response.json();
        clientLogger.error('❌ Ошибка удаления счета:', error);
        toast.error(`Ошибка: ${error.error}`);
      }
    } catch (error) {
      clientLogger.error('❌ Error deleting invoice:', error);
      toast.error('Ошибка при удалении счета');
    }
  };

  // Показать диалог удаления счета
  const showDeleteInvoiceModal = (invoiceId: string, invoiceNumber: string) => {
    setDeleteModal({
      isOpen: true,
      type: 'invoice',
      id: invoiceId,
      name: invoiceNumber
    });
  };

  // Удаление заказа у поставщика
  const deleteSupplierOrder = async (supplierOrderId: string) => {
    clientLogger.debug('🗑️ Удаление заказа у поставщика:', supplierOrderId);
    
    try {
      clientLogger.debug('📡 Отправляем запрос на удаление заказа у поставщика...');
      const response = await fetch(`/api/supplier-orders/${supplierOrderId}`, {
        method: 'DELETE'
      });

      clientLogger.debug('📡 Ответ сервера:', response.status, response.statusText);

      if (response.ok) {
        clientLogger.debug('✅ Заказ у поставщика удален успешно');
        
        // Обновляем локальный список
        clientLogger.debug('🔄 Обновляем локальный список заказов у поставщика...');
        clientLogger.debug('📊 Текущее количество заказов:', supplierOrders.length);
        setSupplierOrders(prev => {
          const filtered = prev.filter(so => so.id !== supplierOrderId);
          clientLogger.debug('📊 Новое количество заказов:', filtered.length);
          return filtered;
        });
        
        // НЕ обновляем данные клиента, так как локальное состояние уже корректно
        // if (selectedClient) {
        //   clientLogger.debug('🔄 Обновляем данные клиента...');
        //   await fetchClientDocuments(selectedClient);
        // }
        
        toast.success('Заказ у поставщика удален успешно');
      } else {
        const error = await response.json();
        clientLogger.error('❌ Ошибка удаления заказа у поставщика:', error);
        toast.error(`Ошибка: ${error.error}`);
      }
    } catch (error) {
      clientLogger.error('❌ Error deleting supplier order:', error);
      toast.error('Ошибка при удалении заказа у поставщика');
    }
  };

  const closeCommentsModal = () => {
    setShowCommentsModal(false);
    // Обновляем количество комментариев после закрытия модального окна
    if (selectedDocument) {
      fetchCommentsCount(selectedDocument.id);
    }
  };

  // Функция для фокуса на документ при переходе из уведомления
  const focusOnDocument = useCallback((documentId: string) => {
    // Находим клиента, у которого есть этот документ
    const clientWithDocument = clients.find(client => {
      return invoices.some(i => i.id === documentId) || supplierOrders.some(so => so.id === documentId);
    });
    
    if (clientWithDocument) {
      setSelectedClient(clientWithDocument.id);
      // Переключаемся на соответствующую вкладку
      if (invoices.some(i => i.id === documentId)) {
        setClientTab('invoices');
      } else if (supplierOrders.some(so => so.id === documentId)) {
        setClientTab('supplier_orders');
      }
    }
  }, [clients, invoices, supplierOrders]);

  // Обработка фокуса из URL параметров
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const focusDocumentId = urlParams.get('focus');
    if (focusDocumentId) {
      focusOnDocument(focusDocumentId);
      // Очищаем URL параметр
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [clients, invoices, supplierOrders, focusOnDocument]);

  // Показать диалог удаления заказа у поставщика
  const showDeleteSupplierOrderModal = (supplierOrderId: string, orderNumber: string) => {
    setDeleteModal({
      isOpen: true,
      type: 'supplier_order',
      id: supplierOrderId,
      name: orderNumber
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Блок клиентов — только кнопки, список в модальном окне */}
      <Card variant="base" className="w-full">
        <div className="px-4 py-2 flex flex-wrap items-center gap-3">
          <h3 className="text-lg font-semibold text-black flex items-center flex-shrink-0"><Users className="h-5 w-5 mr-2"/>Клиенты</h3>
          <button
            onClick={() => {
              setModalSearch('');
              setClientsModalInWorkOnly(false);
              setShowClientsModal(true);
            }}
            className="px-3 py-1.5 text-sm border border-gray-300 hover:border-black transition-all duration-200"
            title="Поиск клиента по ФИО, телефону, адресу"
          >
            Поиск
          </button>
          <button
            onClick={() => {
              setModalSearch('');
              setClientsModalInWorkOnly(true);
              setShowClientsModal(true);
            }}
            className="px-3 py-1.5 text-sm border border-gray-300 hover:border-black transition-all duration-200"
            title="Клиенты с незавершёнными документами"
          >
            В работе {inWorkCount > 0 && `(${inWorkCount})`}
          </button>
          <button
            onClick={() => setShowCreateClientForm(true)}
            className="px-3 py-1.5 text-sm border border-gray-300 hover:border-black transition-all duration-200"
            title="Создать нового клиента"
          >
            Создать
          </button>
        </div>
      </Card>

      {/* Модальное окно — список клиентов (поиск или в работе), увеличенное */}
      {showClientsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowClientsModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0 bg-gray-50 rounded-t-xl">
              <h3 className="text-xl font-semibold text-black flex items-center gap-2">
                <Users className="h-6 w-6 text-gray-600" />
                Список клиентов
              </h3>
              <button onClick={() => setShowClientsModal(false)} className="p-2 text-gray-500 hover:text-black hover:bg-gray-200 rounded-lg transition-colors" aria-label="Закрыть">✕</button>
            </div>
            <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center gap-4 flex-shrink-0">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  value={modalSearch}
                  onChange={e => setModalSearch(e.target.value)}
                  placeholder="Поиск по ФИО, телефону, адресу..."
                  className="w-full pl-10 pr-4 py-2.5 text-base border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black/50 focus:border-black"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setClientsModalInWorkOnly(false)}
                  className={`px-4 py-2 text-sm font-medium border rounded-lg transition-colors ${!clientsModalInWorkOnly ? 'border-black bg-black text-white' : 'border-gray-300 hover:border-black hover:bg-gray-50'}`}
                >
                  Все
                </button>
                <button
                  onClick={() => setClientsModalInWorkOnly(true)}
                  className={`px-4 py-2 text-sm font-medium border rounded-lg transition-colors ${clientsModalInWorkOnly ? 'border-black bg-black text-white' : 'border-gray-300 hover:border-black hover:bg-gray-50'}`}
                >
                  В работе {inWorkCount > 0 && `(${inWorkCount})`}
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto px-6 py-2">
              <div className="divide-y divide-gray-100">
                {modalFilteredClients.map(c => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedClient(c.id);
                      setShowClientsModal(false);
                    }}
                    className={`w-full text-left px-4 py-4 flex flex-wrap items-center gap-x-6 gap-y-1 transition-colors hover:bg-gray-50 rounded-lg ${selectedClient === c.id ? 'bg-blue-50' : ''}`}
                  >
                    <span className="font-medium text-gray-900 text-base min-w-0 truncate shrink-0 w-[28%]" title={`${c.lastName} ${c.firstName}${c.middleName ? ` ${c.middleName}` : ''}`}>
                      {c.lastName} {c.firstName}{c.middleName ? ` ${c.middleName}` : ''}
                    </span>
                    <span className="text-gray-600 text-sm min-w-0 truncate flex-1 max-w-[45%]" title={c.address || '—'}>
                      {c.address || '—'}
                    </span>
                    <span className="text-gray-600 text-sm flex items-center gap-1.5 shrink-0" title={formatPhone(c.phone || '')}>
                      <Phone className="h-4 w-4 flex-shrink-0" />
                      {formatPhone(c.phone || '')}
                    </span>
                  </button>
                ))}
              </div>
              {clients.length === 0 && (
                <div className="py-16 text-center text-gray-500 text-base">Нет клиентов</div>
              )}
              {clients.length > 0 && modalFilteredClients.length === 0 && (
                <div className="py-16 text-center text-gray-500 text-base">Ничего не найдено. Измените фильтр или поиск.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Табло заказов — под блоком клиентов, поиск в строке с заголовком */}
      <Card variant="base" className="w-full flex flex-col min-w-0">
            <div className="p-4 border-b border-gray-200 flex-shrink-0 flex flex-wrap items-center gap-4">
              <h3 className="text-lg font-semibold text-black flex items-center flex-shrink-0">
                <FileText className="h-5 w-5 mr-2"/>Табло заказов
              </h3>
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
                <input
                  type="text"
                  placeholder="Поиск по номеру заказа, клиенту, адресу..."
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div className="p-4 flex-1 overflow-hidden min-w-0">
              {user?.id ? (
                <OrdersBoard executorId={user.id} searchQuery={orderSearchQuery} onSearchQueryChange={setOrderSearchQuery} />
              ) : (
                <div className="flex items-center justify-center h-32 text-gray-600">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  Загрузка...
                </div>
              )}
            </div>

            {/* Скрываем старую секцию документов клиента */}
            {false && selectedClient && (
              <div className="p-4">
                <div className="border-b border-gray-200 mb-4">
                  <nav className="-mb-px flex space-x-6">
                    {([
                      {id:'invoices',name:'Счета',icon:Download},
                      {id:'supplier_orders',name:'Заказ у поставщика',icon:Package}
                    ] as Array<{id:'invoices'|'supplier_orders';name:string;icon:any}>)
                      .filter(t => t && t.icon != null)
                      .map((t) => {
                        if (!t || !t.icon) return null;
                        const IconComponent = t.icon;
                        return (
                          <button
                            key={t.id}
                            onClick={() => setClientTab(t.id)}
                            className={`flex items-center py-2 px-1 border-b-2 font-medium text-sm ${clientTab===t.id?'border-black text-black':'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}
                          >
                            <IconComponent className="h-4 w-4 mr-2"/>{t.name}
                          </button>
                        );
                      }).filter(Boolean)}
        </nav>
      </div>

                {clientTab==='invoices' && (
                  <>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      {(['all', ...getInvoiceFilterStatuses()] as InvoiceFilterStatus[]).map(s => (
                        <button key={s}
                          onClick={() => setInvoicesFilter(s as InvoiceFilterStatus)}
                          className={`px-3 py-1 text-sm border ${invoicesFilter===s?'border-black bg-black text-white':'border-gray-300 hover:border-black'}`}
                        >{s==='all'?'Все':s}</button>
                      ))}
          </div>
                    <div className="space-y-2">
                      {invoices.filter(i => invoicesFilter==='all' || i.status===invoicesFilter).map(i => (
                        <div key={i.id} className="border border-gray-200 p-3 hover:border-black transition-colors">
          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3">
                                <div className="font-medium text-black">{i.number}</div>
                                <div className="text-sm text-gray-600">от {i.date}{i.dueAt?` • оплатить до ${i.dueAt}`:''}</div>
                                <button
                                  onClick={(e) => showStatusDropdown('invoice', i.id, e)}
                                  className={`inline-block px-2 py-0.5 text-xs rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${badgeByInvoiceStatus(i.status)}`}
                                >
                                  {i.status}
                                </button>
          </div>
          </div>
                            <div className="text-right ml-4 flex items-center space-x-2">
                              <div className="font-semibold text-black">{i.total.toLocaleString('ru-RU')} ₽</div>
                              <div className="relative" data-invoice-actions>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowInvoiceActions(showInvoiceActions === i.id ? null : i.id);
                                  }}
                                  className="p-1 hover:bg-gray-100 rounded"
                                >
                                  <MoreVertical className="h-4 w-4 text-gray-400" />
                                </button>
                                
                                {showInvoiceActions === i.id && (
                                  <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-48">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        createSupplierOrderFromInvoice(i.id);
                                        setShowInvoiceActions(null);
                                      }}
                                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                                    >
                                      Заказ у поставщика
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        createInvoiceFromInvoice(i.id);
                                        setShowInvoiceActions(null);
                                      }}
                                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                                    >
                                      Создать счет
                                    </button>
                                    <hr className="my-1" />
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        clientLogger.debug('🔴 Кнопка удаления счета нажата для ID:', i.id);
                                        showDeleteInvoiceModal(i.id, i.number);
                                        setShowInvoiceActions(null);
                                      }}
                                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                    >
                                      Удалить
                                    </button>
                  </div>
                                )}
                  </div>
                </div>
                  </div>
                          <div className="mt-2 flex items-center justify-between">
                            <div className="flex items-center space-x-3 text-xs text-gray-500">
                              <button 
                                onClick={() => openCommentsModal(i.id, 'invoice', i.number)}
                                className="hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors flex items-center"
                              >
                                <div className={`h-3.5 w-3.5 mr-1 rounded flex items-center justify-center ${commentsCount[i.id] > 0 ? 'bg-green-500 text-white' : 'text-gray-500'}`}>
                                  <StickyNote className="h-2.5 w-2.5"/>
                                </div>
                                Комментарии
                              </button>
                              <button 
                                onClick={() => openHistoryModal(i.id, 'invoice', i.number)}
                                className="hover:text-green-600 hover:bg-green-50 px-2 py-1 rounded transition-colors flex items-center"
                              >
                                <History className="h-3.5 w-3.5 mr-1"/>История
                              </button>
                  </div>
                </div>
                      </div>
                    ))}
                      {invoices.filter(i => invoicesFilter==='all' || i.status===invoicesFilter).length===0 && (
                        <div className="text-sm text-gray-500">Нет счетов по выбранному фильтру</div>
                      )}
                </div>
                  </>
                )}

                {clientTab==='supplier_orders' && (
                  <>
                    <div className="mb-3 flex flex-wrap items-center gap-2">
                      {(['all','Черновик','Отправлен','Заказ размещен','Получен от поставщика','Исполнен'] as const).map(s => (
                        <button key={s}
                          onClick={() => setSupplierOrdersFilter(s)}
                          className={`px-3 py-1 text-sm border ${supplierOrdersFilter===s?'border-black bg-black text-white':'border-gray-300 hover:border-black'}`}
                        >{s==='all'?'Все':s}</button>
                      ))}
          </div>
                  <div className="space-y-2">
                      {supplierOrders.filter(so => supplierOrdersFilter==='all' || so.status===supplierOrdersFilter).map(so => (
                        <div key={so.id} className="border border-gray-200 p-3 hover:border-black transition-colors">
              <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3">
                                <div className="font-medium text-black">{so.number}</div>
                                <div className="text-sm text-gray-600">от {so.date}</div>
                                <button
                                  onClick={(e) => showStatusDropdown('supplier_order', so.id, e)}
                                  className={`inline-block px-2 py-0.5 text-xs rounded-full border cursor-pointer hover:opacity-80 transition-opacity ${badgeBySupplierOrderStatus(so.status)}`}
                                >
                                  {so.status}
                                </button>
                      </div>
                              <div className="text-sm text-gray-600 mt-1">
                                {so.invoiceInfo ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      // Открываем модальное окно с правильным ID счета
                                      if (so.invoiceInfo) {
                                        setSelectedDocumentId(so.invoiceInfo.id);
                                        setIsModalOpen(true);
                                      }
                                    }}
                                    className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                                  >
                                    Счет - {so.invoiceInfo.number}
                                  </button>
                                ) : (
                                  <span>Счет не найден</span>
                                )}
                              </div>
                </div>
                            <div className="text-right ml-4 flex items-center space-x-2">
                              <div className="font-semibold text-black">{so.total.toLocaleString('ru-RU')} ₽</div>
                              <div className="relative" data-supplier-order-actions>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setShowSupplierOrderActions(showSupplierOrderActions === so.id ? null : so.id);
                                  }}
                                  className="p-1 hover:bg-gray-100 rounded"
                                >
                                  <MoreVertical className="h-4 w-4 text-gray-400" />
                                </button>
                                
                                {showSupplierOrderActions === so.id && (
                                  <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-48">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        generateSupplierOrderExcel(so.id);
                                        setShowSupplierOrderActions(null);
                                      }}
                                      className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50"
                                    >
                                      Скачать Excel
                                    </button>
                                    <hr className="my-1" />
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        clientLogger.debug('🔴 Кнопка удаления заказа у поставщика нажата для ID:', so.id);
                                        showDeleteSupplierOrderModal(so.id, so.number);
                                        setShowSupplierOrderActions(null);
                                      }}
                                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                                    >
                                      Удалить
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <div className="flex items-center space-x-3 text-xs text-gray-500">
                              <button 
                                onClick={() => openCommentsModal(so.id, 'supplier_order', `Заказ-${so.id.slice(-8)}`)}
                                className="hover:text-blue-600 hover:bg-blue-50 px-2 py-1 rounded transition-colors flex items-center"
                              >
                                <div className={`h-3.5 w-3.5 mr-1 rounded flex items-center justify-center ${commentsCount[so.id] > 0 ? 'bg-green-500 text-white' : 'text-gray-500'}`}>
                                  <StickyNote className="h-2.5 w-2.5"/>
                                </div>
                                Комментарии
                              </button>
                              <button 
                                onClick={() => openHistoryModal(so.id, 'supplier_order', `Заказ-${so.id.slice(-8)}`)}
                                className="hover:text-green-600 hover:bg-green-50 px-2 py-1 rounded transition-colors flex items-center"
                              >
                                <History className="h-3.5 w-3.5 mr-1"/>История
                              </button>
                            </div>
                </div>
              </div>
            ))}
                      {supplierOrders.filter(so => supplierOrdersFilter==='all' || so.status===supplierOrdersFilter).length===0 && (
                        <div className="text-sm text-gray-500">Нет заказов у поставщика по выбранному фильтру</div>
                      )}
          </div>
                  </>
                )}
        </div>
      )}
      </Card>

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
          {statusDropdown.type === 'invoice' && (
            <>
              {statusDropdown.id && (() => {
                const invoice = invoices.find(i => i.id === statusDropdown!.id);
                if (!invoice) return null;
                
                // Получаем доступные статусы для перехода через API
                // Исполнитель может изменять только определенные статусы Invoice
                const getAllStatuses = () => {
                  // Исполнитель может изменять статусы Invoice только после оплаты
                  // Доступные статусы для исполнителя: ORDERED, RECEIVED_FROM_SUPPLIER, COMPLETED
                  const executorAllowedStatuses = ['Заказ размещен', 'Получен от поставщика', 'Исполнен'];
                  
                  // Если счет уже оплачен или имеет статус выше, показываем доступные статусы
                  if (invoice.status === 'Оплачен/Заказ' || invoice.status === 'Заказ размещен' || 
                      invoice.status === 'Получен от поставщика' || invoice.status === 'Исполнен') {
                    return executorAllowedStatuses;
                  }
                  
                  // Если счет еще не оплачен, исполнитель не может его изменять
                  return [];
                };
                
                const allStatuses = getAllStatuses();
                
                // Если нет доступных статусов, показываем сообщение
                if (allStatuses.length === 0) {
                  return (
                    <div className="px-4 py-2 text-sm text-gray-500">
                      Нет доступных статусов для изменения
                    </div>
                  );
                }
                
                return allStatuses.map((status, index) => (
                  <div key={status}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateInvoiceStatus(invoice.id, status);
                      }}
                      className={`w-full px-4 py-2.5 text-sm text-left transition-all duration-200 ${
                        invoice.status === status 
                          ? 'bg-blue-50 text-blue-700 font-medium' 
                          : 'hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{status}</span>
                        {invoice.status === status && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        )}
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
          
          {statusDropdown.type === 'supplier_order' && (
            <>
              {statusDropdown.id && (() => {
                const supplierOrder = supplierOrders.find(so => so.id === statusDropdown!.id);
                if (!supplierOrder) return null;
                
                const getAllStatuses = () => {
                  // Для исполнителя доступны только определенные статусы
                  return ['Заказ размещен', 'Получен от поставщика', 'Исполнен'];
                };
                
                const allStatuses = getAllStatuses();
                
                return allStatuses.map((status, index) => (
                  <div key={status}>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        // Быстрое обновление статуса без генерации Excel
                        clientLogger.debug('Status clicked:', { supplierOrderId: supplierOrder.id, status });
                        
                        // Маппинг русских статусов на английские для API
                        const statusMap: Record<string, string> = {
                          'Заказ размещен': 'ORDERED',
                          'Получен от поставщика': 'RECEIVED_FROM_SUPPLIER',
                          'Исполнен': 'COMPLETED'
                        };
                        
                        const apiStatus = statusMap[status] || status;
                        
                        try {
                          const response = await fetch(`/api/supplier-orders/${supplierOrder.id}/status`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ status: apiStatus })
                          });
                          
                          if (response.ok) {
                            // Обновляем локальное состояние
                            setSupplierOrders(prev => prev.map(so => 
                              so.id === supplierOrder.id ? { ...so, status: status as typeof so.status } : so
                            ));
                            hideStatusDropdown();
                            toast.success(`Статус изменен на "${status}"`);
                          } else {
                            const error = await response.json();
                            toast.error(`Ошибка: ${error.error}`);
                          }
                        } catch (error) {
                          clientLogger.error('Error updating status:', error);
                          toast.error('Ошибка при изменении статуса');
                        }
                      }}
                      className={`w-full px-4 py-2.5 text-sm text-left transition-all duration-200 ${
                        supplierOrder.status === status 
                          ? 'bg-blue-50 text-blue-700 font-medium' 
                          : 'hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{status}</span>
                        {supplierOrder.status === status && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
      )}
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

      {/* Модальное окно подтверждения удаления */}
      <DeleteConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => {
          clientLogger.debug('🔒 Закрытие модального окна удаления');
          setDeleteModal(prev => ({ ...prev, isOpen: false }));
        }}
        onConfirm={async () => {
          clientLogger.debug('✅ Подтверждение удаления в модальном окне:', deleteModal.type, deleteModal.id);
          try {
            if (deleteModal.type === 'invoice' && deleteModal.id) {
              await deleteInvoice(deleteModal.id);
            } else if (deleteModal.type === 'supplier_order' && deleteModal.id) {
              await deleteSupplierOrder(deleteModal.id);
            }
            clientLogger.debug('✅ Удаление завершено, закрываем модальное окно');
          } catch (error) {
            clientLogger.error('❌ Ошибка в модальном окне:', error);
            throw error; // Перебрасываем ошибку, чтобы модальное окно не закрылось
          }
        }}
        title={deleteModal.type === 'invoice' ? 'Удаление счета' : 'Удаление заказа у поставщика'}
        message={deleteModal.type === 'invoice' 
          ? 'Вы уверены, что хотите удалить этот счет? Все связанные данные будут потеряны.'
          : 'Вы уверены, что хотите удалить этот заказ у поставщика? Все связанные данные будут потеряны.'
        }
        itemName={deleteModal.name || undefined}
      />

      {/* Модальное окно комментариев */}
      <CommentsModal
        isOpen={showCommentsModal}
        onClose={closeCommentsModal}
        documentId={selectedDocument?.id || ''}
        documentType={selectedDocument?.type === 'supplier_order' ? 'supplier_order' : 'invoice'}
        documentNumber={selectedDocument?.number || ''}
      />

      {/* Модальное окно истории */}
      <HistoryModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        documentId={selectedDocument?.id || ''}
        documentType={selectedDocument?.type === 'supplier_order' ? 'supplier_order' : 'invoice'}
        documentNumber={selectedDocument?.number || ''}
      />

      {/* Модальное окно документа */}
      {selectedDocumentId && (
        <DocumentQuickViewModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedDocumentId(null);
          }}
          documentId={selectedDocumentId}
        />
      )}
    </div>
  );
}