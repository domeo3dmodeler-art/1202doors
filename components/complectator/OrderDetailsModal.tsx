'use client';

import { useState, useEffect, useCallback } from 'react';
import { Modal } from '@/components/ui/Modal';
import HistoryModal from '@/components/ui/HistoryModal';
import CommentsModal from '@/components/ui/CommentsModal';
import { toast } from 'sonner';
import { Download, FileText, User, MapPin, Clock, Package, Upload, CheckCircle, AlertCircle, Building2, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import { getStatusLabel, ORDER_STATUSES_COMPLECTATOR } from '@/lib/utils/document-statuses';
import { getValidTransitions } from '@/lib/validation/status-transitions';
import { clientLogger } from '@/lib/logging/client-logger';
import { fetchWithAuth } from '@/lib/utils/fetch-with-auth';
import { parseApiResponse } from '@/lib/utils/parse-api-response';
import { getItemDisplayNameForExport, getItemTypeForExport } from '@/lib/export/display-names';
import { getImageSrc } from '@/lib/configurator/image-src';
import { formatModelName, getKitDisplayName, getFillingDisplayName } from '@/lib/utils/format-model-name';

interface OrderDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string;
  userRole: string;
  onOrderUpdate?: () => void;
}

interface OrderData {
  id: string;
  number: string;
  status: string;
  complectator_id?: string | null;
  complectator_name?: string | null;
  executor_id?: string | null;
  executor_name?: string | null;
  lead_number?: string | null;
  project_file_url?: string | null;
  door_dimensions?: any[] | null;
  measurement_done?: boolean;
  project_complexity?: string | null;
  wholesale_invoices?: string[];
  technical_specs?: string[];
  verification_status?: string | null;
  verification_notes?: string | null;
  notes?: string | null;
  client: {
    id: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    phone: string;
    address?: string;
    fullName: string;
  };
  invoice: {
    id: string;
    number: string;
    status: string;
    total_amount: number;
    cart_data?: any;
  } | null;
  cart_data?: any;
  cart_session_id?: string | null;
  total_amount?: number;
  created_at: string;
  updated_at: string;
}

interface Quote {
  id: string;
  number: string;
  status: string;
  total_amount: number;
  created_at: string;
}

// Цвета для статусов
const STATUS_COLORS: Record<string, string> = {
  'DRAFT': 'bg-gray-100 text-gray-800 border-gray-200',
  'SENT': 'bg-blue-100 text-blue-800 border-blue-200',
  'NEW_PLANNED': 'bg-gray-100 text-gray-800 border-gray-200',
  'UNDER_REVIEW': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'AWAITING_MEASUREMENT': 'bg-orange-100 text-orange-800 border-orange-200',
  'AWAITING_INVOICE': 'bg-blue-100 text-blue-800 border-blue-200',
  'READY_FOR_PRODUCTION': 'bg-purple-100 text-purple-800 border-purple-200',
  'COMPLETED': 'bg-emerald-100 text-emerald-800 border-emerald-200',
  'RETURNED_TO_COMPLECTATION': 'bg-red-100 text-red-800 border-red-200',
  'CANCELLED': 'bg-red-100 text-red-800 border-red-200',
  'PAID': 'bg-green-100 text-green-800 border-green-200',
  'ORDERED': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'RECEIVED_FROM_SUPPLIER': 'bg-purple-100 text-purple-800 border-purple-200'
};

// Вспомогательная функция для извлечения оригинального имени файла из URL
const getOriginalFileName = (fileUrl: string): string => {
  try {
    const urlObj = new URL(fileUrl, window.location.origin);
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

// Вспомогательная функция для скачивания файла с правильным именем
const downloadFile = async (fileUrl: string, defaultName: string = 'file') => {
  try {
    // Единый слой путей: getImageSrc даёт URL для раздачи (Next.js: /uploads/... из public/)
    const normalizedUrl = getImageSrc(fileUrl) || fileUrl;
    
    clientLogger.debug('Downloading file:', { originalUrl: fileUrl, normalizedUrl });
    
    const response = await fetchWithAuth(normalizedUrl);
    if (!response.ok) {
      clientLogger.error('Failed to download file:', { status: response.status, statusText: response.statusText, url: normalizedUrl });
      toast.error(`Ошибка при скачивании файла: ${response.status} ${response.statusText}`);
      return;
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Извлекаем оригинальное имя файла
    const downloadName = getOriginalFileName(fileUrl) || defaultName;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (error) {
    clientLogger.error('Error downloading file:', error);
    toast.error('Ошибка при скачивании файла');
  }
};

export function OrderDetailsModal({ isOpen, onClose, orderId, userRole, onOrderUpdate }: OrderDetailsModalProps) {
  const [order, setOrder] = useState<OrderData | null>(null);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isCommentsModalOpen, setIsCommentsModalOpen] = useState(false);
  const [exportingInvoice, setExportingInvoice] = useState(false);
  const [exportingQuote, setExportingQuote] = useState<string | null>(null);
  const [showStatusChangeModal, setShowStatusChangeModal] = useState(false);
  const [newStatus, setNewStatus] = useState<string>('');
  const [changingStatus, setChangingStatus] = useState(false);
  const [showProjectUpload, setShowProjectUpload] = useState(false);
  const [projectFile, setProjectFile] = useState<File | null>(null);
  const [uploadingProject, setUploadingProject] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [deletingFiles, setDeletingFiles] = useState<Record<string, boolean>>({});
  const [showFilesUpload, setShowFilesUpload] = useState<{ type: 'technical_spec' | 'wholesale_invoice' | null }>({ type: null });
  const [filesToUpload, setFilesToUpload] = useState<{ technical_specs: File[]; wholesale_invoices: File[] }>({
    technical_specs: [],
    wholesale_invoices: []
  });
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [expandedSpecs, setExpandedSpecs] = useState<Set<number>>(new Set());

  // Нормализуем роль для проверок (case-insensitive)
  const normalizedRole = userRole?.toLowerCase() || '';
  const isExecutor = normalizedRole === 'executor';
  const isComplectator = normalizedRole === 'complectator';

  clientLogger.debug('🔵 OrderDetailsModal render:', {
    isOpen,
    orderId,
    userRole,
    normalizedRole,
    isExecutor,
    isComplectator,
    hasOrder: !!order,
    orderStatus: order?.status
  });

  // Загрузка заказа
  const fetchOrder = useCallback(async () => {
    if (!orderId) return;
    
    setLoading(true);
    try {
      const response = await fetchWithAuth(`/api/orders/${orderId}`);
      
      if (response.ok) {
        const responseData = await response.json();
        clientLogger.debug('📦 Raw response from /api/orders/[id]:', responseData);
        
        // apiSuccess возвращает { success: true, data: { order: ... } }
        const parsedData = parseApiResponse<{ order?: any }>(responseData);
        const orderData = parsedData && typeof parsedData === 'object' && 'order' in parsedData
          ? parsedData.order
          : null;
        
        if (orderData) {
          clientLogger.debug('📦 Extracted order data:', orderData);
          setOrder(orderData);
        } else {
          clientLogger.warn('❌ Invalid response format from /api/orders/[id]:', responseData);
          toast.error('Ошибка при загрузке заказа: неверный формат ответа');
          // Не закрываем модальное окно при ошибке загрузки, только показываем ошибку
        }
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Неизвестная ошибка' }));
        clientLogger.error('❌ Error fetching order:', { status: response.status, error: errorData });
        toast.error(`Ошибка при загрузке заказа: ${errorData.error || response.statusText}`);
        // Не закрываем модальное окно при ошибке загрузки, только показываем ошибку
      }
    } catch (error) {
      clientLogger.error('Error fetching order:', error);
      toast.error('Ошибка при загрузке заказа');
      // Не закрываем модальное окно при ошибке загрузки, только показываем ошибку
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  // Загрузка связанных КП
  const fetchQuotes = useCallback(async () => {
    if (!orderId) return;
    
    try {
      const response = await fetchWithAuth(`/api/quotes?parent_document_id=${orderId}`);
      
      if (response.ok) {
        const responseData = await response.json();
        // apiSuccess возвращает { success: true, data: { quotes: ... } }
        const parsedData = parseApiResponse<{ quotes?: Quote[] }>(responseData);
        const quotesData = parsedData && typeof parsedData === 'object' && 'quotes' in parsedData && Array.isArray(parsedData.quotes)
          ? parsedData.quotes
          : [];
        
        if (quotesData.length > 0) {
          setQuotes(quotesData);
        }
      }
    } catch (error) {
      clientLogger.error('Error fetching quotes:', error);
    }
  }, [orderId]);

  useEffect(() => {
    if (isOpen && orderId) {
      fetchOrder();
      fetchQuotes();
    }
  }, [isOpen, orderId, fetchOrder, fetchQuotes]);


  // Определение статуса для отображения
  const getDisplayStatus = () => {
    if (!order) return null;
    
    if (isComplectator) {
      // ВАЖНО: Комплектатор управляет статусами заказа напрямую, а не через счет
      // Статус счета отображается только для информации, но управление идет через статус заказа
      const orderStatus = order.status;
      const label = getStatusLabel(orderStatus, 'order');
      const color = STATUS_COLORS[orderStatus] || 'bg-gray-100 text-gray-800 border-gray-200';
      
      // Комплектатор может менять статусы заказа: DRAFT, SENT, NEW_PLANNED, RETURNED_TO_COMPLECTATION
      // Статусы исполнителя (UNDER_REVIEW, AWAITING_MEASUREMENT, AWAITING_INVOICE, READY_FOR_PRODUCTION, COMPLETED) - только просмотр
      // NEW_PLANNED - это статус, который может быть и у комплектатора, и у исполнителя
      const executorStatuses = ['UNDER_REVIEW', 'AWAITING_MEASUREMENT', 'AWAITING_INVOICE', 'READY_FOR_PRODUCTION', 'COMPLETED'];
      const complectatorStatuses = ['DRAFT', 'SENT', 'NEW_PLANNED', 'RETURNED_TO_COMPLECTATION'];
      const canManage = complectatorStatuses.includes(orderStatus) || orderStatus === 'CANCELLED';
      
      clientLogger.debug('📊 getDisplayStatus for complectator:', {
        orderStatus,
        canManage,
        orderId: order.id,
        orderNumber: order.number,
        invoiceStatus: order.invoice?.status || 'нет счета'
      });
      
      return { label, color, canManage };
    }
    
    if (isExecutor) {
      const label = getStatusLabel(order.status, 'order_executor');
      const color = STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-800 border-gray-200';
      return { label, color, canManage: true };
    }
    
    const label = getStatusLabel(order.status, 'order');
    const color = STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-800 border-gray-200';
    return { label, color, canManage: false };
  };

  // Получение товаров из заказа
  const getItems = useCallback(() => {
    if (!order) return [];
    
    if (order.cart_data) {
      try {
        const cartData = typeof order.cart_data === 'string' ? JSON.parse(order.cart_data) : order.cart_data;
        if (cartData.items && Array.isArray(cartData.items)) {
          return cartData.items;
        }
        if (Array.isArray(cartData)) {
          return cartData;
        }
        return [];
      } catch (e) {
        clientLogger.error('Error parsing cart_data:', e);
      }
    }
    
    if (order.invoice?.cart_data) {
      try {
        const invoiceCartData = typeof order.invoice.cart_data === 'string' 
          ? JSON.parse(order.invoice.cart_data) 
          : order.invoice.cart_data;
        if (invoiceCartData.items && Array.isArray(invoiceCartData.items)) {
          return invoiceCartData.items;
        }
        if (Array.isArray(invoiceCartData)) {
          return invoiceCartData;
        }
        return [];
      } catch (e) {
        clientLogger.error('Error parsing invoice cart_data:', e);
      }
    }
    
    return [];
  }, [order]);

  // Получение доступных статусов для перехода (для комплектатора)
  const getAvailableStatuses = useCallback(() => {
    if (!order || userRole !== 'complectator') return [];
    
    // ВАЖНО: Для комплектатора используем статус заказа, а не счета
    // Комплектатор управляет статусами заказа напрямую
    const currentStatus = order.status;
    
    // Комплектатор может работать только со статусами: DRAFT, SENT, NEW_PLANNED (статус «Вернуть в комплектацию» недоступен)
    const complectatorStatuses = ['DRAFT', 'SENT', 'NEW_PLANNED'];
    
    // Если заказ у исполнителя — комплектатор не может менять статус
    if (!complectatorStatuses.includes(currentStatus)) {
      return [];
    }
    
    const allTransitions = getValidTransitions('order', currentStatus);
    
    // Разрешенные переходы для комплектатора:
    // - Из DRAFT: SENT или CANCELLED
    // - Из SENT: NEW_PLANNED или CANCELLED
    // - Из NEW_PLANNED: только CANCELLED
    
    let allowedStatuses: string[] = [];
    
    if (currentStatus === 'DRAFT') {
      allowedStatuses = ['SENT', 'CANCELLED'];
    } else if (currentStatus === 'SENT') {
      allowedStatuses = ['NEW_PLANNED', 'CANCELLED'];
    } else if (currentStatus === 'NEW_PLANNED') {
      allowedStatuses = ['CANCELLED'];
    }
    
    // Фильтруем переходы только из разрешенных
    let filteredTransitions = allTransitions.filter(status => allowedStatuses.includes(status));
    
    clientLogger.debug('📋 getAvailableStatuses:', {
      currentStatus,
      allTransitions,
      allowedStatuses,
      filteredTransitions,
      transitionsCount: filteredTransitions.length,
      orderId: order.id,
      orderNumber: order.number
    });
    
    return filteredTransitions;
  }, [order, userRole]);

  // Загрузка проекта/планировки
  const handleProjectUpload = async () => {
    if (!projectFile || !order) {
      toast.error('Выберите файл проекта');
      return;
    }

    // Валидация размера файла (максимум 1MB)
    const maxSize = 1 * 1024 * 1024; // 1MB
    if (projectFile.size > maxSize) {
      toast.error(`Файл слишком большой. Максимальный размер: 1MB. Размер файла: ${(projectFile.size / 1024 / 1024).toFixed(2)}MB`);
      setProjectFile(null);
      return;
    }

    try {
      setUploadingProject(true);
      const formData = new FormData();
      formData.append('file', projectFile);

      clientLogger.debug('handleProjectUpload: starting', {
        orderId: order.id,
        fileName: projectFile.name,
        fileSize: projectFile.size
      });

      const response = await fetchWithAuth(`/api/orders/${order.id}/project`, {
        method: 'POST',
        body: formData
      });

      clientLogger.debug('handleProjectUpload: response', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText
      });

      if (response.ok) {
        toast.success('Проект загружен успешно');
        setShowProjectUpload(false);
        setProjectFile(null);
        // Обновляем данные заказа
        await fetchOrder();
        // Обновляем список заказов в родительском компоненте (с задержкой, чтобы избежать конфликтов)
        if (onOrderUpdate) {
          setTimeout(() => {
            onOrderUpdate();
          }, 100);
        }
      } else {
        let errorData: any;
        try {
          errorData = await response.json();
        } catch (jsonError) {
          clientLogger.error('handleProjectUpload: error parsing JSON', jsonError);
          errorData = { error: `Ошибка ${response.status}: ${response.statusText}` };
        }
        
        const errorMessage = errorData && typeof errorData === 'object' && errorData !== null && 'error' in errorData
          ? (errorData.error && typeof errorData.error === 'object' && 'message' in errorData.error
            ? String(errorData.error.message)
            : String(errorData.error))
          : 'Ошибка загрузки проекта';
        
        clientLogger.error('handleProjectUpload: error', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          errorMessage
        });
        toast.error(`Ошибка загрузки проекта: ${errorMessage}`);
      }
    } catch (error) {
      clientLogger.error('Error uploading project:', error);
      toast.error('Ошибка загрузки проекта');
    } finally {
      setUploadingProject(false);
    }
  };

  // Удаление проекта/планировки
  const handleDeleteProject = async () => {
    if (!order || !order.project_file_url) {
      toast.error('Файл проекта не найден');
      return;
    }

    if (!confirm('Вы уверены, что хотите удалить файл проекта?')) {
      return;
    }

    try {
      setDeletingProject(true);
      
      clientLogger.debug('handleDeleteProject: starting', {
        orderId: order.id,
        projectFileUrl: order.project_file_url
      });

      const response = await fetchWithAuth(`/api/orders/${order.id}/project`, {
        method: 'DELETE'
      });

      clientLogger.debug('handleDeleteProject: response', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText
      });

      if (response.ok) {
        toast.success('Файл проекта удален');
        // Обновляем данные заказа
        await fetchOrder();
        // Обновляем список заказов в родительском компоненте (с задержкой, чтобы избежать конфликтов)
        if (onOrderUpdate) {
          setTimeout(() => {
            onOrderUpdate();
          }, 100);
        }
      } else {
        let errorData: any;
        try {
          errorData = await response.json();
        } catch (jsonError) {
          clientLogger.error('handleDeleteProject: error parsing JSON', jsonError);
          errorData = { error: `Ошибка ${response.status}: ${response.statusText}` };
        }
        
        const errorMessage = errorData && typeof errorData === 'object' && errorData !== null && 'error' in errorData
          ? (errorData.error && typeof errorData.error === 'object' && 'message' in errorData.error
            ? String(errorData.error.message)
            : String(errorData.error))
          : 'Ошибка удаления файла проекта';
        
        clientLogger.error('handleDeleteProject: error', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          errorMessage
        });
        toast.error(`Ошибка удаления файла: ${errorMessage}`);
      }
    } catch (error) {
      clientLogger.error('Error deleting project file:', error);
      toast.error('Ошибка удаления файла проекта');
    } finally {
      setDeletingProject(false);
    }
  };

  // Удаление файла (техзадание или оптовый счет)
  const handleDeleteFile = async (fileUrl: string, fileType: 'wholesale_invoice' | 'technical_spec') => {
    if (!order) {
      toast.error('Заказ не найден');
      return;
    }

    const fileName = getOriginalFileName(fileUrl);
    if (!confirm(`Вы уверены, что хотите удалить файл "${fileName}"?`)) {
      return;
    }

    const fileKey = `${fileType}_${fileUrl}`;
    try {
      setDeletingFiles(prev => ({ ...prev, [fileKey]: true }));

      clientLogger.debug('handleDeleteFile: starting', {
        orderId: order.id,
        fileUrl,
        fileType
      });

      const response = await fetchWithAuth(`/api/orders/${order.id}/files`, {
        method: 'DELETE',
        body: JSON.stringify({ fileUrl, fileType })
      });

      clientLogger.debug('handleDeleteFile: response', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText
      });

      if (response.ok) {
        toast.success('Файл удален');
        // Обновляем данные заказа
        await fetchOrder();
        // Обновляем список заказов в родительском компоненте (с задержкой, чтобы избежать конфликтов)
        setTimeout(() => {
          if (onOrderUpdate) {
            onOrderUpdate();
          }
        }, 100);
      } else {
        let errorData: any = {};
        try {
          const jsonData = await response.json();
          errorData = parseApiResponse(jsonData);
        } catch (jsonError) {
          clientLogger.error('handleDeleteFile: error parsing JSON', jsonError);
          errorData = { error: `Ошибка ${response.status}: ${response.statusText}` };
        }
        
        const errorMessage = errorData && typeof errorData === 'object' && errorData !== null && 'error' in errorData
          ? (errorData.error && typeof errorData.error === 'object' && 'message' in errorData.error
            ? String(errorData.error.message)
            : String(errorData.error))
          : 'Ошибка удаления файла';
        
        clientLogger.error('handleDeleteFile: error', {
          status: response.status,
          statusText: response.statusText,
          errorData,
          errorMessage
        });
        toast.error(`Ошибка удаления файла: ${errorMessage}`);
      }
    } catch (error) {
      clientLogger.error('Error deleting file:', error);
      toast.error('Ошибка удаления файла');
    } finally {
      setDeletingFiles(prev => {
        const newState = { ...prev };
        delete newState[fileKey];
        return newState;
      });
    }
  };

  // Обработчик изменения статуса заказа
  const handleStatusChange = async () => {
    if (!order || !newStatus) {
      clientLogger.error('handleStatusChange: missing order or newStatus', { order: !!order, newStatus });
      return;
    }
    
    clientLogger.debug('handleStatusChange: starting', {
      orderId: order.id,
      currentStatus: order.status,
      newStatus
    });
    
    setChangingStatus(true);
    try {
      const response = await fetchWithAuth(`/api/orders/${order.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({
          status: newStatus
        })
      });

      clientLogger.debug('handleStatusChange: response', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText
      });

      if (response.ok) {
        const data = await response.json();
        const parsedData = parseApiResponse(data);
        clientLogger.debug('handleStatusChange: success', parsedData);
        
        // Обновляем статус заказа сразу из ответа, если он есть
        if (parsedData && typeof parsedData === 'object' && parsedData !== null && 'order' in parsedData) {
          const updatedOrderData = (parsedData as { order?: any }).order;
          if (updatedOrderData) {
            clientLogger.debug('handleStatusChange: updating order from response', updatedOrderData);
            setOrder((prevOrder) => prevOrder ? { ...prevOrder, status: updatedOrderData.status || newStatus } : prevOrder);
          }
        }
        
        toast.success('Статус заказа успешно изменен');
        setShowStatusChangeModal(false);
        setNewStatus('');
        // Обновляем данные заказа для получения полной информации
        await fetchOrder();
        // Обновляем список заказов в родительском компоненте (с задержкой, чтобы избежать конфликтов)
        if (onOrderUpdate) {
          setTimeout(() => {
            onOrderUpdate();
          }, 100);
        }
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
      clientLogger.error('Error changing order status:', error);
      toast.error('Ошибка при изменении статуса заказа');
    } finally {
      setChangingStatus(false);
    }
  };

  // Экспорт счета на основе данных заказа
  const handleExportInvoice = async () => {
    if (!order) {
      toast.error('Заказ не найден');
      return;
    }

    const items = getItems();
    if (items.length === 0) {
      toast.error('В заказе нет товаров');
      return;
    }

    if (!order.client?.id) {
      toast.error('Клиент не указан в заказе');
      return;
    }

    setExportingInvoice(true);
    try {
      const formattedItems = items.map((item: any) => {
        const quantity = item.qty ?? item.quantity ?? 1;
        const unitPrice = item.unitPrice ?? item.price ?? item.unit_price ?? 0;
        return {
          id: item.id || item.productId || item.product_id || `item-${Math.random()}`,
          productId: item.productId || item.product_id || item.id,
          name: item.name,
          model: item.model,
          qty: quantity,
          quantity: quantity,
          unitPrice: unitPrice,
          price: unitPrice,
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
        };
      });

      const totalAmount = order.total_amount || formattedItems.reduce((sum: number, item: any) => 
        sum + (item.unitPrice || 0) * (item.qty || 1), 0
      );

      clientLogger.debug('Export Invoice Request:', {
        type: 'invoice',
        format: 'pdf',
        clientId: order.client.id,
        itemsCount: formattedItems.length,
        totalAmount,
        parentDocumentId: order.id,
        cartSessionId: order.cart_session_id,
        sampleItem: formattedItems[0] // Логируем первый товар для отладки
      });

      const response = await fetchWithAuth('/api/export/fast', {
        method: 'POST',
        body: JSON.stringify({
          type: 'invoice',
          format: 'pdf',
          clientId: order.client.id,
          items: formattedItems,
          totalAmount,
          parentDocumentId: order.id,
          cartSessionId: order.cart_session_id || null
        })
      });
      
      clientLogger.debug('Export Invoice Response:', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type')
      });
      
      if (response.ok) {
        const blob = await response.blob();
        
        clientLogger.debug('Export Invoice Blob:', {
          size: blob.size,
          type: blob.type
        });
        
        // Проверяем, что blob не пустой
        if (blob.size === 0) {
          throw new Error('Получен пустой файл');
        }
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Счет-${order.number}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success('Счет успешно экспортирован');
      } else {
        let errorMessage = 'Неизвестная ошибка';
        try {
          const errorData = await response.json();
          // Обрабатываем разные типы ошибок
          if (errorData.error) {
            if (typeof errorData.error === 'string') {
              errorMessage = errorData.error;
            } else if (errorData.error.message) {
              errorMessage = errorData.error.message;
              // Если ошибка связана с Chromium/Puppeteer, показываем понятное сообщение
              if (/browser|chromium|executablePath|PUPPETEER|apt install/i.test(errorMessage)) {
                errorMessage = 'Экспорт PDF: на сервере нужен Chromium (apt install chromium-browser, PUPPETEER_EXECUTABLE_PATH в .env).';
              }
            }
          } else if (errorData.message) {
            errorMessage = errorData.message;
          } else {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
          clientLogger.error('Export Invoice Error Response:', errorData);
        } catch (parseError) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          clientLogger.error('Export Invoice Error Parse:', parseError);
        }
        toast.error(`Ошибка при экспорте счета: ${errorMessage}`);
      }
    } catch (error: any) {
      clientLogger.error('Error exporting invoice:', error);
      toast.error(`Ошибка при экспорте счета: ${error.message || 'Неизвестная ошибка'}`);
    } finally {
      setExportingInvoice(false);
    }
  };

  // Экспорт КП на основе данных заказа
  const handleExportQuote = async () => {
    if (!order) {
      toast.error('Заказ не найден');
      return;
    }

    const items = getItems();
    if (items.length === 0) {
      toast.error('В заказе нет товаров');
      return;
    }

    if (!order.client?.id) {
      toast.error('Клиент не указан в заказе');
      return;
    }

    setExportingQuote('exporting');
    try {
      const formattedItems = items.map((item: any) => {
        const quantity = item.qty ?? item.quantity ?? 1;
        const unitPrice = item.unitPrice ?? item.price ?? item.unit_price ?? 0;
        return {
          id: item.id || item.productId || item.product_id || `item-${Math.random()}`,
          productId: item.productId || item.product_id || item.id,
          name: item.name,
          model: item.model,
          qty: quantity,
          quantity: quantity,
          unitPrice: unitPrice,
          price: unitPrice,
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
        };
      });

      const totalAmount = order.total_amount || formattedItems.reduce((sum: number, item: any) => 
        sum + (item.unitPrice || 0) * (item.qty || 1), 0
      );

      clientLogger.debug('Export Quote Request:', {
        type: 'quote',
        format: 'pdf',
        clientId: order.client.id,
        itemsCount: formattedItems.length,
        totalAmount,
        parentDocumentId: order.id,
        cartSessionId: order.cart_session_id,
        sampleItem: formattedItems[0] // Логируем первый товар для отладки
      });

      const response = await fetchWithAuth('/api/export/fast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'quote',
          format: 'pdf',
          clientId: order.client.id,
          items: formattedItems,
          totalAmount,
          parentDocumentId: order.id,
          cartSessionId: order.cart_session_id || null
        })
      });
      
      clientLogger.debug('Export Quote Response:', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type')
      });
      
      if (response.ok) {
        const blob = await response.blob();
        
        clientLogger.debug('Export Quote Blob:', {
          size: blob.size,
          type: blob.type
        });
        
        // Проверяем, что blob не пустой
        if (blob.size === 0) {
          throw new Error('Получен пустой файл');
        }
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `КП-${order.number}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        toast.success('КП успешно экспортирован');
      } else {
        let errorMessage = 'Неизвестная ошибка';
        try {
          const errorData = await response.json();
          // Обрабатываем разные типы ошибок
          if (errorData.error) {
            if (typeof errorData.error === 'string') {
              errorMessage = errorData.error;
            } else if (errorData.error.message) {
              errorMessage = errorData.error.message;
              // Если ошибка связана с Chromium/Puppeteer, показываем понятное сообщение
              if (/browser|chromium|executablePath|PUPPETEER|apt install/i.test(errorMessage)) {
                errorMessage = 'Экспорт PDF: на сервере нужен Chromium (apt install chromium-browser, PUPPETEER_EXECUTABLE_PATH в .env).';
              }
            }
          } else if (errorData.message) {
            errorMessage = errorData.message;
          } else {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
          clientLogger.error('Export Quote Error Response:', errorData);
        } catch (parseError) {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          clientLogger.error('Export Quote Error Parse:', parseError);
        }
        toast.error(`Ошибка при экспорте КП: ${errorMessage}`);
      }
    } catch (error: any) {
      clientLogger.error('Error exporting quote:', error);
      toast.error(`Ошибка при экспорте КП: ${error.message || 'Неизвестная ошибка'}`);
    } finally {
      setExportingQuote(null);
    }
  };

  if (!isOpen) return null;

  const displayStatus = getDisplayStatus();
  const items = getItems();
  const availableStatuses = getAvailableStatuses(); // Вычисляем один раз для использования в нескольких местах

  // Отладочная информация
  clientLogger.debug('OrderDetailsModal Debug:', {
    order: order ? { id: order.id, number: order.number, status: order.status } : null,
    userRole,
    displayStatus,
    canManage: displayStatus?.canManage,
    availableStatuses,
    availableStatusesCount: availableStatuses.length,
    hasInvoice: !!order?.invoice,
    invoiceId: order?.invoice?.id,
    quotesCount: quotes.length,
    quotes: quotes.map(q => ({ id: q.id, number: q.number }))
  });
  
  // Дополнительное логирование для отладки
  if (isComplectator && order) {
    clientLogger.debug('🔍 Complectator Status Debug:', {
      orderStatus: order.status,
      canManage: displayStatus?.canManage,
      availableStatuses,
      willShowButton: isComplectator && displayStatus?.canManage && availableStatuses.length > 0
    });
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title=""
        size="xl"
      >
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : order ? (
          <div className="p-5 space-y-3 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 40px)' }}>
            {/* Заголовок заказа */}
            <div className="mb-4 pb-4 border-b border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <Package className="h-5 w-5 text-gray-600" />
                  <span className="font-semibold text-lg text-gray-900">
                    {order.number}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(order.created_at).toLocaleDateString('ru-RU')}
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  {displayStatus && (
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${displayStatus.color}`}>
                      {displayStatus.label}
                      {!displayStatus.canManage && (
                        <span className="ml-1 text-xs opacity-75">(только просмотр)</span>
                      )}
                    </span>
                  )}
                  {(order.total_amount || order.invoice?.total_amount) && (
                    <span className="font-bold text-gray-900 text-base">
                      {(order.total_amount || order.invoice?.total_amount)?.toLocaleString('ru-RU')} ₽
                    </span>
                  )}
                </div>
              </div>
              
              {/* Действия */}
              <div className="flex items-center space-x-4 mt-2 flex-wrap gap-2">
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
                
                {/* Кнопка экспорта счета - всегда доступна для заказа */}
                <button
                  onClick={handleExportInvoice}
                  disabled={exportingInvoice || !order || items.length === 0}
                  className="flex items-center space-x-1 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="h-3 w-3" />
                  <span className="text-xs">
                    {exportingInvoice ? 'Экспорт...' : 'Экспорт счета'}
                  </span>
                </button>
                
                {/* Кнопка экспорта КП - всегда доступна для заказа */}
                <button
                  onClick={handleExportQuote}
                  disabled={exportingQuote !== null || !order || items.length === 0}
                  className="flex items-center space-x-1 text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download className="h-3 w-3" />
                  <span className="text-xs">
                    {exportingQuote ? 'Экспорт...' : 'Экспорт КП'}
                  </span>
                </button>
                
                {/* Кнопка изменения статуса для комплектатора */}
                {isComplectator && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      clientLogger.debug('🔘 Кнопка "Изменить статус" нажата', {
                        availableStatuses,
                        currentStatus: order?.status,
                        displayStatus,
                        canManage: displayStatus?.canManage,
                        firstStatus: availableStatuses.length > 0 ? availableStatuses[0] : null
                      });
                      if (availableStatuses.length > 0) {
                        setNewStatus(availableStatuses[0]);
                        setShowStatusChangeModal(true);
                        clientLogger.debug('🔘 Модальное окно смены статуса открыто', {
                          newStatus: availableStatuses[0],
                          showStatusChangeModal: true
                        });
                      } else {
                        clientLogger.warn('🔘 Нет доступных статусов для перехода', {
                          currentStatus: order?.status,
                          availableStatuses
                        });
                        toast.error('Нет доступных статусов для перехода');
                      }
                    }}
                    disabled={!displayStatus?.canManage || availableStatuses.length === 0}
                    className={`flex items-center space-x-1 transition-colors ${
                      displayStatus?.canManage && availableStatuses.length > 0
                        ? 'text-gray-600 hover:text-gray-800 cursor-pointer'
                        : 'text-gray-400 cursor-not-allowed opacity-50'
                    }`}
                    title={
                      !displayStatus?.canManage
                        ? 'Статус не может быть изменен'
                        : availableStatuses.length === 0
                        ? 'Нет доступных статусов для перехода'
                        : 'Изменить статус заказа'
                    }
                  >
                    <ChevronDown className="h-3 w-3" />
                    <span className="text-xs">Изменить статус</span>
                  </button>
                )}
              </div>
            </div>

            {/* Информация о клиенте */}
            <div className="mb-4 pb-4 border-b border-gray-200">
              {order.client ? (
                <>
                  <div className="flex items-center space-x-2">
                    <User className="h-3 w-3 text-gray-400" />
                    <span className="text-sm font-medium text-gray-900">
                      {order.client.fullName}
                    </span>
                    {order.client.phone && (
                      <span className="text-xs text-gray-600">{order.client.phone}</span>
                    )}
                  </div>
                  {order.client.address && (
                    <div className="flex items-center space-x-1 mt-1 ml-5">
                      <MapPin className="h-3 w-3 text-gray-400" />
                      <span className="text-xs text-gray-600">{order.client.address}</span>
                    </div>
                  )}
                  {/* Дополнительная информация для Руководителя */}
                  {normalizedRole === 'manager' && (
                    <div className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-xs">
                      {order.lead_number && (
                        <div className="flex items-center space-x-1">
                          <span className="text-gray-500">Номер лида:</span>
                          <span className="font-medium text-gray-700">{order.lead_number}</span>
                        </div>
                      )}
                      {order.complectator_name && (
                        <div className="flex items-center space-x-1">
                          <Building2 className="h-3 w-3 text-gray-400" />
                          <span className="text-gray-500">Комплектатор:</span>
                          <span className="font-medium text-gray-700">{order.complectator_name}</span>
                        </div>
                      )}
                      {order.executor_name && (
                        <div className="flex items-center space-x-1">
                          <Building2 className="h-3 w-3 text-gray-400" />
                          <span className="text-gray-500">Исполнитель:</span>
                          <span className="font-medium text-gray-700">{order.executor_name}</span>
                        </div>
                      )}
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

            {/* План открывания и закрывания дверей для Комплектатора */}
            {isComplectator && (
              <div className="mb-4 pb-4 border-b border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-900">План открывания и закрывания дверей</h3>
                  <div className="flex items-center space-x-2">
                    {order.project_file_url && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteProject();
                        }}
                        disabled={deletingProject}
                        className="text-red-600 hover:text-red-700 text-sm flex items-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed p-1.5"
                        title="Удалить файл проекта"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowProjectUpload(true);
                      }}
                      className="flex items-center space-x-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <Upload className="h-4 w-4" />
                      <span>Загрузить</span>
                    </button>
                  </div>
                </div>
                {order.project_file_url ? (
                  <div className="flex items-center space-x-2">
                    <FileText className="h-4 w-4 text-gray-400" />
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        downloadFile(order.project_file_url!, 'Проект');
                      }}
                      className="text-blue-600 hover:underline text-sm flex items-center cursor-pointer"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      {getOriginalFileName(order.project_file_url!)}
                    </button>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">Проект не загружен</div>
                )}
              </div>
            )}

            {/* План открывания и закрывания дверей для Исполнителя (только просмотр, без загрузки) */}
            {isExecutor && (
              <div className="mb-4 pb-4 border-b border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-900">План открывания и закрывания дверей</h3>
                </div>
                {order.project_file_url ? (
                  <div className="flex items-center space-x-2">
                    <FileText className="h-4 w-4 text-gray-400" />
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        downloadFile(order.project_file_url!, 'Проект');
                      }}
                      className="text-blue-600 hover:underline text-sm flex items-center cursor-pointer"
                    >
                      <Download className="h-3 w-3 mr-1" />
                      {getOriginalFileName(order.project_file_url!)}
                    </button>
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">Проект не загружен</div>
                )}
              </div>
            )}

            {/* Тех. задания и Оптовые счета только для Исполнителя */}
            {/* Явно скрываем для комплектатора и других ролей */}
            {isExecutor && !isComplectator && (
              <div className="mb-4 pb-4 border-b border-gray-200 space-y-3">
                {/* Тех. задания */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-900">Тех. задания</h3>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowFilesUpload({ type: 'technical_spec' });
                      }}
                      className="flex items-center space-x-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <Upload className="h-4 w-4" />
                      <span>Загрузить</span>
                    </button>
                  </div>
                  {order.technical_specs && order.technical_specs.length > 0 ? (
                    <div className="space-y-1">
                      {order.technical_specs.map((url: string, index: number) => {
                        const fileKey = `technical_spec_${url}`;
                        const isDeleting = deletingFiles[fileKey] || false;
                        return (
                          <div key={index} className="flex items-center justify-between group">
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                downloadFile(url, `Техзадание_${index + 1}`);
                              }}
                              className="text-blue-600 hover:underline text-sm flex items-center cursor-pointer"
                            >
                              <Download className="h-3 w-3 mr-1" />
                              {getOriginalFileName(url)}
                            </button>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDeleteFile(url, 'technical_spec');
                              }}
                              disabled={isDeleting}
                              className="text-red-600 hover:text-red-700 text-sm flex items-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Удалить файл"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Тех. задания не загружены</p>
                  )}
                </div>
                
                {/* Оптовые счета */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium text-gray-900">Оптовые счета</h3>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setShowFilesUpload({ type: 'wholesale_invoice' });
                      }}
                      className="flex items-center space-x-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <Upload className="h-4 w-4" />
                      <span>Загрузить</span>
                    </button>
                  </div>
                  {order.wholesale_invoices && order.wholesale_invoices.length > 0 ? (
                    <div className="space-y-1">
                      {order.wholesale_invoices.map((url: string, index: number) => {
                        const fileKey = `wholesale_invoice_${url}`;
                        const isDeleting = deletingFiles[fileKey] || false;
                        return (
                          <div key={index} className="flex items-center justify-between group">
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                downloadFile(url, `Счет_${index + 1}`);
                              }}
                              className="text-blue-600 hover:underline text-sm flex items-center cursor-pointer"
                            >
                              <Download className="h-3 w-3 mr-1" />
                              {getOriginalFileName(url)}
                            </button>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleDeleteFile(url, 'wholesale_invoice');
                              }}
                              disabled={isDeleting}
                              className="text-red-600 hover:text-red-700 text-sm flex items-center cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Удалить файл"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">Оптовые счета не загружены</p>
                  )}
                </div>
              </div>
            )}

            {/* Дополнительная информация для Руководителя (файлы, тех. задания и т.д.) */}
            {userRole === 'manager' && (
              <div className="mb-4 pb-4 border-b border-gray-200 space-y-3">
                {/* План открывания и закрывания дверей */}
                {order.project_file_url && (
                  <div className="flex items-center space-x-2">
                    <FileText className="h-4 w-4 text-gray-400" />
                    <span className="text-sm text-gray-600">План открывания и закрывания дверей:</span>
                    <a
                      href={order.project_file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-sm"
                    >
                      Скачать
                    </a>
                  </div>
                )}
                
                {/* Тех. задания */}
                {order.door_dimensions && order.door_dimensions.length > 0 && (
                  <div>
                    <div className="flex items-center space-x-2 mb-2">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-700">Тех. задания ({order.door_dimensions.length})</span>
                    </div>
                    <div className="ml-6 space-y-1">
                      {order.door_dimensions.map((door: any, index: number) => (
                        <div key={index} className="text-xs text-gray-600">
                          Дверь {index + 1}: {door.width} × {door.height} мм, {door.quantity} шт.
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* Статус проверки */}
                {order.verification_status && (
                  <div className="flex items-center space-x-2">
                    {order.verification_status === 'VERIFIED' ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : order.verification_status === 'FAILED' ? (
                      <AlertCircle className="h-4 w-4 text-red-600" />
                    ) : (
                      <Clock className="h-4 w-4 text-gray-400" />
                    )}
                    <span className="text-sm text-gray-600">Статус проверки:</span>
                    <span className={`text-sm font-medium ${
                      order.verification_status === 'VERIFIED' 
                        ? 'text-green-600' 
                        : order.verification_status === 'FAILED' 
                        ? 'text-red-600' 
                        : 'text-gray-600'
                    }`}>
                      {order.verification_status === 'VERIFIED' 
                        ? 'Проверено' 
                        : order.verification_status === 'FAILED' 
                        ? 'Ошибка проверки' 
                        : 'Ожидает проверки'}
                    </span>
                  </div>
                )}
                
                {/* Замер */}
                {order.measurement_done !== undefined && (
                  <div className="flex items-center space-x-2">
                    <CheckCircle className={`h-4 w-4 ${order.measurement_done ? 'text-green-600' : 'text-gray-400'}`} />
                    <span className="text-sm text-gray-600">Замер:</span>
                    <span className={`text-sm font-medium ${order.measurement_done ? 'text-green-600' : 'text-gray-600'}`}>
                      {order.measurement_done ? 'Выполнен' : 'Не выполнен'}
                    </span>
                  </div>
                )}
                
                {/* Заметки */}
                {order.notes && (
                  <div>
                    <span className="text-sm font-medium text-gray-700">Заметки:</span>
                    <div className="mt-1 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                      {order.notes}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Заголовок раздела товаров */}
            <div className="mb-3 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-900 pb-2">
                Товары ({items.length})
              </h3>
            </div>

            {/* Контент товаров */}
            <div className="mb-4">
              {items.length > 0 ? (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                      <thead className="bg-gray-50 sticky top-0 z-[1]">
                        <tr className="text-xs text-gray-500 uppercase tracking-wide">
                          <th className="px-3 py-2.5 text-center w-10 font-medium">№</th>
                          <th className="px-4 py-2.5 text-left font-medium">Наименование</th>
                          <th className="px-3 py-2.5 text-center w-16 font-medium">Кол-во</th>
                          <th className="px-3 py-2.5 text-right w-24 font-medium">Цена</th>
                          <th className="px-4 py-2.5 text-right w-28 font-medium">Сумма</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item: any, index: number) => {
                          const quantity = item.quantity || item.qty || 1;
                          const unitPrice = item.unit_price || item.price || 0;
                          const totalPrice = quantity * unitPrice;
                          const itemKind = getItemTypeForExport(item);
                          const isDoor = itemKind === 'door';
                          const isExpanded = expandedSpecs.has(index);

                          const modelDisplay = isDoor ? formatModelName(item.model) : null;
                          const excludeFromDoorSpec = ['Ручка', 'Ограничитель'];
                          let specRows: { label: string; value: string }[] = [];
                          if (isDoor) {
                            if (item.specRows && Array.isArray(item.specRows) && item.specRows.length > 0) {
                              specRows = (item.specRows as { label: string; value: string }[])
                                .filter((r: { label: string; value: string }) =>
                                  r.value && r.value !== '—' && r.value !== 'Не выбран' && r.value !== 'Нет'
                                  && !excludeFromDoorSpec.includes(r.label)
                                )
                                .map((r: { label: string; value: string }) => {
                                  if (r.label === 'Комплект фурнитуры' && item.hardwareColor && !r.value.includes(item.hardwareColor)) {
                                    return { ...r, value: `${r.value}, ${item.hardwareColor}` };
                                  }
                                  return r;
                                });
                            } else {
                              const finish = item.finish?.trim();
                              const color = item.color?.trim();
                              const coatingParts: string[] = [];
                              if (finish) coatingParts.push(finish);
                              if (color && color !== finish) coatingParts.push(color);
                              if (coatingParts.length > 0) specRows.push({ label: 'Покрытие и цвет', value: coatingParts.join('; ') });
                              if (item.width && item.height) specRows.push({ label: 'Размер', value: `${item.width} × ${item.height} мм` });
                              if (item.openingDirection) specRows.push({ label: 'Направление', value: item.openingDirection === 'right' ? 'Правая' : 'Левая' });
                              if (item.reversible) specRows.push({ label: 'Реверс', value: 'Да' });
                              if (item.filling || item.fillingName) {
                                specRows.push({ label: 'Наполнение', value: getFillingDisplayName(item.filling || item.fillingName) });
                              }
                              if (item.edge === 'да') {
                                specRows.push({ label: 'Алюминиевая кромка', value: item.edgeColorName || item.edge_color_name || 'Да' });
                              }
                              if (item.glassColor || item.glass_color) {
                                specRows.push({ label: 'Цвет стекла', value: item.glassColor || item.glass_color });
                              }
                              const rawKit = (item.hardwareKitName || item.hardware || '').replace(/^Комплект фурнитуры — /, '').trim();
                              const kitDisplay = getKitDisplayName(rawKit || null);
                              const kitValue = kitDisplay !== '—' ? kitDisplay : 'Базовый';
                              specRows.push({ label: 'Комплект фурнитуры', value: item.hardwareColor ? `${kitValue}, ${item.hardwareColor}` : kitValue });
                              if (item.optionIds?.length) {
                                const names = item.architraveNames?.length ? item.architraveNames.join(', ') : 'Да';
                                specRows.push({ label: 'Наличники', value: names });
                              }
                              if (item.mirror) {
                                const mirrorText = item.mirror === 'one' ? 'Одна сторона' : item.mirror === 'both' ? 'Две стороны' : 'Да';
                                specRows.push({ label: 'Зеркало', value: mirrorText });
                              }
                              if (item.threshold) specRows.push({ label: 'Порог', value: 'Да' });
                            }
                          }

                          const accessoryName = !isDoor ? getItemDisplayNameForExport(item) : '';

                          return (
                            <tr
                              key={index}
                              className={`border-t ${isDoor ? 'border-gray-200' : 'border-gray-100'} ${isDoor ? 'bg-white' : 'bg-gray-50/60'} hover:bg-blue-50/40 transition-colors`}
                            >
                              <td className={`px-3 py-3 text-center align-top font-medium ${isDoor ? 'text-sm text-gray-900' : 'text-xs text-gray-400'}`}>
                                {index + 1}
                              </td>
                              <td className="px-4 py-3">
                                {isDoor ? (
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-semibold text-sm text-gray-900">
                                        Дверь {modelDisplay}
                                      </span>
                                      {specRows.length > 0 && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setExpandedSpecs(prev => {
                                              const next = new Set(prev);
                                              if (next.has(index)) next.delete(index);
                                              else next.add(index);
                                              return next;
                                            });
                                          }}
                                          className="inline-flex items-center gap-0.5 text-xs text-blue-600 hover:text-blue-800 transition-colors shrink-0"
                                        >
                                          {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                          <span>Спецификация</span>
                                        </button>
                                      )}
                                    </div>
                                    {isExpanded && specRows.length > 0 && (
                                      <div className="mt-2 text-xs text-gray-600 bg-gray-50 rounded px-3 py-2 space-y-1">
                                        {specRows.map((row, ri) => (
                                          <div key={ri} className="flex">
                                            <span className="text-gray-400 w-40 shrink-0">{row.label}:</span>
                                            <span className="text-gray-700">{row.value}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-sm text-gray-600 pl-4">
                                    {accessoryName}
                                  </div>
                                )}
                              </td>
                              <td className={`px-3 py-3 text-center align-top font-medium ${isDoor ? 'text-sm text-gray-900' : 'text-xs text-gray-500'}`}>
                                {quantity}
                              </td>
                              <td className={`px-3 py-3 text-right align-top ${isDoor ? 'text-sm text-gray-900' : 'text-xs text-gray-500'}`}>
                                {unitPrice.toLocaleString('ru-RU')} ₽
                              </td>
                              <td className={`px-4 py-3 text-right align-top font-semibold ${isDoor ? 'text-sm text-gray-900' : 'text-xs text-gray-500'}`}>
                                {totalPrice.toLocaleString('ru-RU')} ₽
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Итого */}
                  <div className="bg-gray-50 px-4 py-3 border-t-2 border-gray-300">
                    <div className="flex justify-end">
                      <span className="text-base font-bold text-gray-900">
                        Итого: {(order.total_amount || order.invoice?.total_amount || 0).toLocaleString('ru-RU')} ₽
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  Товары не найдены
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-gray-500">Заказ не найден</p>
          </div>
        )}
      </Modal>

      {/* Модальное окно истории */}
      {order && (
        <HistoryModal
          isOpen={isHistoryModalOpen}
          onClose={() => setIsHistoryModalOpen(false)}
          documentId={order.id}
          documentType="order"
          documentNumber={order.number}
        />
      )}

      {/* Модальное окно комментариев */}
      {order && (
        <CommentsModal
          isOpen={isCommentsModalOpen}
          onClose={() => setIsCommentsModalOpen(false)}
          documentId={order.id}
          documentType="order"
          documentNumber={order.number}
        />
      )}

      {/* Модальное окно загрузки проекта/планировки */}
      {showProjectUpload && order && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]" 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowProjectUpload(false);
            setProjectFile(null);
          }}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <h3 className="text-lg font-semibold mb-4">Загрузка проекта/планировки</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Выберите файл</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.dwg,.dxf"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    if (file) {
                      // Валидация размера файла (максимум 1MB)
                      const maxSize = 1 * 1024 * 1024; // 1MB
                      if (file.size > maxSize) {
                        toast.error(`Файл слишком большой. Максимальный размер: 1MB. Размер файла: ${(file.size / 1024 / 1024).toFixed(2)}MB`);
                        e.target.value = ''; // Сбрасываем input
                        setProjectFile(null);
                        return;
                      }
                    }
                    setProjectFile(file);
                    clientLogger.debug('🔘 Выбран файл проекта', { fileName: file?.name, fileSize: file?.size });
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black cursor-pointer"
                  style={{ pointerEvents: 'auto' }}
                />
                {projectFile && (
                  <div className="mt-2 text-sm text-gray-600">
                    Выбран файл: <span className="font-medium">{projectFile.name}</span> ({(projectFile.size / 1024).toFixed(2)} KB)
                  </div>
                )}
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  onClick={() => {
                    setShowProjectUpload(false);
                    setProjectFile(null);
                  }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={uploadingProject}
                >
                  Отмена
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (projectFile && !uploadingProject) {
                      handleProjectUpload();
                    }
                  }}
                  disabled={!projectFile || uploadingProject}
                  className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploadingProject ? 'Загрузка...' : 'Загрузить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно загрузки файлов (техзаданий и оптовых счетов) */}
      {showFilesUpload.type && order && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]" 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setShowFilesUpload({ type: null });
            setFilesToUpload({ technical_specs: [], wholesale_invoices: [] });
          }}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <h3 className="text-lg font-semibold mb-4">
              {showFilesUpload.type === 'technical_spec' ? 'Загрузка тех. заданий' : 'Загрузка оптовых счетов'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Выберите файл{showFilesUpload.type === 'wholesale_invoice' ? 'ы' : ''}</label>
                <input
                  type="file"
                  accept={showFilesUpload.type === 'technical_spec' ? '.pdf' : '.pdf,.xlsx,.xls'}
                  multiple={showFilesUpload.type === 'wholesale_invoice'}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length > 0) {
                      // Валидация размера файлов (максимум 10MB)
                      const maxSize = 10 * 1024 * 1024; // 10MB
                      const oversizedFiles = files.filter(file => file.size > maxSize);
                      if (oversizedFiles.length > 0) {
                        toast.error(`Файл${oversizedFiles.length > 1 ? 'ы' : ''} "${oversizedFiles.map(f => f.name).join(', ')}" слишком большой${oversizedFiles.length > 1 ? 'е' : ''}. Максимальный размер: 10MB`);
                        e.target.value = ''; // Сбрасываем input
                        return;
                      }
                      
                      if (showFilesUpload.type === 'technical_spec') {
                        setFilesToUpload(prev => ({ ...prev, technical_specs: files }));
                      } else {
                        setFilesToUpload(prev => ({ ...prev, wholesale_invoices: files }));
                      }
                      clientLogger.debug('🔘 Выбраны файлы', { 
                        type: showFilesUpload.type, 
                        filesCount: files.length,
                        fileNames: files.map(f => f.name)
                      });
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black cursor-pointer"
                  style={{ pointerEvents: 'auto' }}
                />
                {(showFilesUpload.type === 'technical_spec' ? filesToUpload.technical_specs : filesToUpload.wholesale_invoices).length > 0 && (
                  <div className="mt-2 space-y-1">
                    {(showFilesUpload.type === 'technical_spec' ? filesToUpload.technical_specs : filesToUpload.wholesale_invoices).map((file, index) => (
                      <div key={index} className="text-sm text-gray-600">
                        {index + 1}. <span className="font-medium">{file.name}</span> ({(file.size / 1024).toFixed(2)} KB)
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowFilesUpload({ type: null });
                    setFilesToUpload({ technical_specs: [], wholesale_invoices: [] });
                  }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={uploadingFiles}
                >
                  Отмена
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (!uploadingFiles) {
                      handleFilesUpload();
                    }
                  }}
                  disabled={
                    uploadingFiles || 
                    (showFilesUpload.type === 'technical_spec' 
                      ? filesToUpload.technical_specs.length === 0 
                      : filesToUpload.wholesale_invoices.length === 0)
                  }
                  className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploadingFiles ? 'Загрузка...' : 'Загрузить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно изменения статуса */}
      {showStatusChangeModal && order && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]" 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            clientLogger.debug('🔘 Закрытие модального окна смены статуса (клик по фону)');
            setShowStatusChangeModal(false);
            setNewStatus('');
          }}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4" 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <h3 className="text-lg font-semibold mb-4">Изменение статуса заказа</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Текущий статус</label>
                <div className="px-3 py-2 bg-gray-50 rounded border">
                  <span className="text-sm">{displayStatus?.label || order.status}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Новый статус</label>
                <select
                  value={newStatus}
                  onChange={(e) => {
                    clientLogger.debug('🔘 Выбран новый статус', { newStatus: e.target.value });
                    setNewStatus(e.target.value);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                >
                  <option value="">Выберите статус</option>
                  {availableStatuses.map((status) => {
                    const statusConfig = ORDER_STATUSES_COMPLECTATOR[status as keyof typeof ORDER_STATUSES_COMPLECTATOR];
                    return (
                      <option key={status} value={status}>
                        {statusConfig?.label || status}
                      </option>
                    );
                  })}
                </select>
                {newStatus === 'NEW_PLANNED' && !order?.project_file_url && (
                  <p className="mt-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
                    Для перевода заказа в этот статус прикрепите файлы с Проектом/Планировкой.
                  </p>
                )}
              </div>
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  onClick={() => {
                    setShowStatusChangeModal(false);
                    setNewStatus('');
                  }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={changingStatus}
                >
                  Отмена
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    clientLogger.debug('🔘 Кнопка "Изменить" в модальном окне нажата', {
                      newStatus,
                      changingStatus,
                      hasOrder: !!order,
                      orderId: order?.id
                    });
                    if (!newStatus || changingStatus || !order) {
                      clientLogger.warn('🔘 Кнопка "Изменить" заблокирована', {
                        newStatus,
                        changingStatus,
                        hasOrder: !!order
                      });
                      return;
                    }
                    // Переход в "Счет оплачен (Заказываем)" возможен только при загруженном проекте/планировке
                    if (newStatus === 'NEW_PLANNED' && !order.project_file_url) {
                      toast.error('Для перевода заказа в этот статус прикрепите файлы с Проектом/Планировкой.');
                      return;
                    }
                    handleStatusChange();
                  }}
                  disabled={!newStatus || changingStatus}
                  className="px-4 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {changingStatus ? 'Изменение...' : 'Изменить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}