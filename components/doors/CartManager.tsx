'use client';

import React, { useEffect, useState } from 'react';
import { priceRecalculationService } from "@/lib/cart/price-recalculation-service";
import { clientLogger } from "@/lib/logging/client-logger";
import { fetchWithAuth } from "@/lib/utils/fetch-with-auth";
import HandleSelectionModal from "../../components/HandleSelectionModal";
import { OrderDetailsModal } from "@/components/complectator/OrderDetailsModal";
import { getImageSrc } from '@/lib/configurator/image-src';
import { fmtInt, findHandleById, findHardwareKitById } from './utils';

function getKitDisplayName(kitName: string | undefined | null): string {
  if (!kitName) return 'Базовый';
  const normalized = kitName.replace(/^Комплект фурнитуры\s*[—\-]\s*/i, '').trim().toLowerCase();
  if (/сильвер|silver|базовый/.test(normalized)) return 'Стандарт';
  if (/голд|gold/.test(normalized)) return 'Комфорт';
  if (/платинум|platinum/.test(normalized)) return 'Бизнес';
  return kitName.replace(/^Комплект фурнитуры\s*[—\-]\s*/i, '').trim();
}
import type { CartItem, HardwareKit, Handle } from './types';

interface CartManagerProps {
  cart: CartItem[];
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>;
  originalPrices: Record<string, number>;
  setOriginalPrices: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  cartHistory: Array<{timestamp: Date, changes: Record<string, any>, totalDelta: number}>;
  setCartHistory: React.Dispatch<React.SetStateAction<Array<{timestamp: Date, changes: Record<string, any>, totalDelta: number}>>>;
  hardwareKits: HardwareKit[];
  handles: Record<string, Handle[]>;
  cartManagerBasePrices: Record<string, number>;
  setCartManagerBasePrices: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  showClientManager: boolean;
  setShowClientManager: React.Dispatch<React.SetStateAction<boolean>>;
  generateDocument: (type: 'quote' | 'invoice' | 'order') => Promise<void>;
  selectedClient: string;
  selectedClientName: string;
  setSelectedClient: React.Dispatch<React.SetStateAction<string>>;
  setSelectedClientName: React.Dispatch<React.SetStateAction<string>>;
  userRole: string;
  onClose: () => void;
}

/** Формат: «Ограничитель скрытый магнитный SECRET DS Цвет хром» и т.д. */
function formatLimiterDisplayName(limiterName: string | undefined): string {
  if (!limiterName || !limiterName.trim()) return 'Ограничитель';
  const suffix = limiterName
    .replace(/^Дверной ограничитель\s*/i, '')
    .replace(/^Ограничитель\s*/i, '')
    .trim()
    .replace(/,?\s*цвет\s+/gi, ' Цвет ');
  const trimmed = suffix.trim();
  return trimmed ? `Ограничитель ${trimmed}` : 'Ограничитель';
}

export function CartManager({
  cart,
  setCart,
  originalPrices,
  setOriginalPrices,
  cartHistory,
  setCartHistory,
  hardwareKits,
  handles,
  cartManagerBasePrices,
  setCartManagerBasePrices,
  showClientManager,
  setShowClientManager,
  generateDocument,
  selectedClient,
  selectedClientName,
  setSelectedClient,
  setSelectedClientName,
  userRole,
  onClose
}: CartManagerProps) {
  // Состояние для модального окна выбора ручек при редактировании в корзине
  const [showHandleModalInCart, setShowHandleModalInCart] = useState(false);
  const [editingHandleItemId, setEditingHandleItemId] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  
  // Состояние для созданного заказа
  const [createdOrder, setCreatedOrder] = useState<{ id: string; number: string } | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  // Спецификация двери: показывать по клику на иконку (inline убрано — только модальное окно)
  const [doorSpecModalId, setDoorSpecModalId] = useState<string | null>(null);
  
  // Проверка существующих заказов при изменении корзины или клиента
  useEffect(() => {
    const checkExistingOrder = async () => {
      if (!selectedClient || cart.length === 0) {
        setCreatedOrder(null);
        return;
      }

      try {
        // Преобразуем items корзины в формат для API
        const items = cart.map(item => ({
          id: item.id,
          productId: item.id,
          name: item.name || item.model || 'Товар',
          model: item.model,
          qty: item.qty || 1,
          quantity: item.qty || 1,
          unitPrice: item.unitPrice || 0,
          price: item.unitPrice || 0,
          width: item.width,
          height: item.height,
          color: item.color,
          finish: item.finish,
          sku_1c: item.sku_1c,
          handleId: item.handleId,
          handleName: item.handleName,
          type: item.type || (item.handleId ? 'handle' : 'door'),
          hardwareKitId: item.hardwareKitId,
          hardwareKitName: item.hardwareKitName
        }));

        const totalAmount = cart.reduce((sum, item) => sum + (item.unitPrice || 0) * (item.qty || 1), 0);

        // Проверяем существующий заказ через API с фильтром по клиенту (с авторизацией)
        const response = await fetchWithAuth(`/api/orders?client_id=${selectedClient}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
          const result = await response.json();
          const { parseApiResponse } = await import('@/lib/utils/parse-api-response');
          const { compareCartContent } = await import('@/lib/documents/deduplication-client');
          const parsedResult = parseApiResponse<{ orders?: Array<{ id: string; number: string; client_id: string; cart_data: string; total_amount: number }> }>(result);
          
          const orders = parsedResult && typeof parsedResult === 'object' && parsedResult !== null && 'orders' in parsedResult
            ? (parsedResult as { orders?: Array<{ id: string; number: string; client_id: string; cart_data: string; total_amount: number }> }).orders
            : null;

          if (orders && Array.isArray(orders)) {
            clientLogger.debug('Проверка существующих заказов:', {
              ordersCount: orders.length,
              selectedClient,
              totalAmount,
              itemsCount: items.length
            });

            // Ищем заказ с таким же клиентом, составом и суммой
            const existingOrder = orders.find(order => {
              if (order.client_id !== selectedClient) {
                clientLogger.debug('Заказ не подходит по клиенту:', { orderClientId: order.client_id, selectedClient });
                return false;
              }
              
              const orderTotal = order.total_amount !== null && order.total_amount !== undefined ? Number(order.total_amount) : 0;
              const currentTotal = Number(totalAmount) || 0;
              
              if (Math.abs(orderTotal - currentTotal) > 0.01) {
                clientLogger.debug('Заказ не подходит по сумме:', { 
                  orderTotal, 
                  currentTotal, 
                  diff: Math.abs(orderTotal - currentTotal),
                  orderTotalType: typeof order.total_amount,
                  currentTotalType: typeof totalAmount
                });
                return false;
              }
              
              // Используем функцию compareCartContent для правильного сравнения
              let cartMatches = false;
              try {
                cartMatches = compareCartContent(items, order.cart_data);
              } catch (compareError) {
                clientLogger.debug('Ошибка при сравнении содержимого корзины:', {
                  orderId: order.id,
                  error: compareError instanceof Error ? compareError.message : String(compareError),
                  cartData: order.cart_data
                });
                // Если не удалось сравнить, считаем что заказы не совпадают
                return false;
              }
              
              if (cartMatches) {
                clientLogger.debug('Найден существующий заказ по содержимому корзины:', {
                  orderId: order.id,
                  orderNumber: order.number,
                  orderTotal: order.total_amount,
                  totalAmount
                });
              } else {
                clientLogger.debug('Заказ не подходит по содержимому корзины:', { orderId: order.id });
              }
              
              return cartMatches;
            });

            if (existingOrder) {
              setCreatedOrder({ id: existingOrder.id, number: existingOrder.number });
              clientLogger.debug('Установлен существующий заказ:', { orderId: existingOrder.id, orderNumber: existingOrder.number });
            } else {
              setCreatedOrder(null);
              clientLogger.debug('Существующий заказ не найден');
            }
          } else {
            setCreatedOrder(null);
            clientLogger.debug('Заказы не получены из API');
          }
        } else {
          setCreatedOrder(null);
          clientLogger.error('Ошибка при получении заказов:', { status: response.status, statusText: response.statusText });
        }
      } catch (error) {
        // Улучшенная обработка ошибок с детальной информацией
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        const errorDetails = {
          message: errorMessage,
          stack: errorStack,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
          selectedClient,
          cartLength: cart.length,
          errorObject: error
        };
        clientLogger.error('Ошибка при проверке существующих заказов:', errorDetails);
        setCreatedOrder(null);
      }
    };

    checkExistingOrder();
  }, [selectedClient, cart]);
  
  // Вспомогательная функция для получения ручки по ID (оптимизация для избежания повторных поисков)
  const getHandleById = React.useCallback((handleId: string | undefined): Handle | undefined => {
    if (!handleId) return undefined;
    return findHandleById(handles, handleId);
  }, [handles]);
  const [availableParams, setAvailableParams] = useState<any>(null);
  // ИСПРАВЛЕНИЕ #2: Сохраняем пересчитанную цену во время редактирования, чтобы избежать двойного пересчета
  const [editingItemPrice, setEditingItemPrice] = useState<number | null>(null);
  // ИСПРАВЛЕНИЕ #3: Сохраняем snapshot товара для отката изменений при отмене
  const [editingItemSnapshot, setEditingItemSnapshot] = useState<CartItem | null>(null);
  // Состояние для модального окна истории
  const [showHistoryModal, setShowHistoryModal] = useState(false);

  // Простое отображение всех товаров корзины
  const filteredCart = cart;

  // Функция быстрого экспорта
  const generateDocumentFast = async (type: 'quote' | 'invoice' | 'order', format: 'pdf' | 'excel' | 'csv') => {
    if (!selectedClient) {
      alert('Выберите клиента');
      return;
    }

    clientLogger.debug('🚀 Начинаем экспорт:', { type, format, clientId: selectedClient });
    clientLogger.debug('📦 Данные корзины:', cart);

    try {
      const response = await fetchWithAuth('/api/export/fast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          format,
          clientId: selectedClient,
          items: cart,
          totalAmount: cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0)
        })
      });

      if (!response.ok) {
        let message = `Ошибка экспорта (${response.status})`;
        try {
          const errBody = await response.json();
          if (errBody?.error?.message) message = errBody.error.message;
          else if (errBody?.message) message = errBody.message;
          if (errBody?.error?.details) {
            clientLogger.debug('Export validation details', errBody.error.details);
          }
        } catch {
          // тело ответа не JSON — оставляем message по умолчанию
        }
        throw new Error(message);
      }

      // Получаем файл
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Получаем имя файла из заголовков
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition 
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
        : `${type}.${format}`;

      // Получаем информацию о созданном документе
      const documentId = response.headers.get('X-Document-Id');
      const documentType = response.headers.get('X-Document-Type');
      const documentNumber = response.headers.get('X-Document-Number');

      // Скачиваем файл
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      clientLogger.debug(`✅ Документ экспортирован: ${filename}`);
      if (documentId) {
        clientLogger.debug(`📄 Создан документ в БД: ${documentType} #${documentId} (${documentNumber})`);
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      clientLogger.error('Export error:', error instanceof Error ? error : { message });
      alert(message || 'Ошибка при экспорте документа');
    }
  };

  // Функции редактирования
  const startEditingItem = async (itemId: string) => {
    const item = cart.find(i => i.id === itemId);
    clientLogger.debug('🔍 Starting edit for item:', item);
    clientLogger.debug('🔍 Item style:', JSON.stringify(item?.style));
    clientLogger.debug('🔍 Item model:', JSON.stringify(item?.model));
    
    if (!item) return;
    
    // Для ручек просто переводим в режим редактирования без загрузки параметров
    if (item.itemType === 'handle' || (item.handleId && item.itemType !== 'door')) {
      setEditingItem(itemId);
      // ИСПРАВЛЕНИЕ #2: Сбрасываем сохраненную цену при начале редактирования
      setEditingItemPrice(null);
      // ИСПРАВЛЕНИЕ #3: Сохраняем snapshot товара для возможного отката
      setEditingItemSnapshot({ ...item });
      // Для ручек не загружаем доступные параметры и не открываем модальное окно
      // Модальное окно откроется только при нажатии на кнопку выбора ручки
      setAvailableParams(null);
      // Убеждаемся, что модальное окно закрыто при начале редактирования
      setShowHandleModalInCart(false);
      setEditingHandleItemId(null);
      return;
    }
    
    // Для дверей загружаем доступные параметры
    if (item.style && item.model) {
      setEditingItem(itemId);
      // ИСПРАВЛЕНИЕ #2: Сбрасываем сохраненную цену при начале редактирования
      setEditingItemPrice(null);
      // ИСПРАВЛЕНИЕ #3: Сохраняем snapshot товара для возможного отката
      setEditingItemSnapshot({ ...item });
      
      // Загружаем доступные параметры
      try {
        // Получаем токен для авторизации
        const token = typeof window !== 'undefined' ? localStorage.getItem('authToken') : null;
        const headers: HeadersInit = { 
          'Content-Type': 'application/json; charset=utf-8',
          'Accept': 'application/json; charset=utf-8'
        };
        if (token) {
          headers['Authorization'] = `Bearer ${token}`;
          headers['x-auth-token'] = token;
        }
        
        const response = await fetchWithAuth('/api/available-params', {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            style: item.style,
            model: item.model,
            color: item.color
          })
        });

        if (response.ok) {
          let data: unknown;
          try {
            data = await response.json();
          } catch (jsonError) {
            clientLogger.error('Ошибка парсинга JSON ответа available params:', jsonError);
            return;
          }
          const paramsData = data && typeof data === 'object' && data !== null && 'params' in data
            ? (data as { params: unknown }).params
            : null;
          clientLogger.debug('📥 Available params response:', { params: paramsData });
          setAvailableParams(paramsData);
        } else {
          clientLogger.error('Error loading available parameters:', response.status, response.statusText);
        }
      } catch (error) {
        clientLogger.error('Error loading available parameters:', error);
      }
    }
  };

  const updateCartItem = async (itemId: string, changes: Partial<CartItem>) => {
    clientLogger.debug('🔄 updateCartItem called:', { itemId, changes });
    
    // Получаем текущий элемент из корзины
    const currentItem = cart.find(i => i.id === itemId);
    if (!currentItem) {
      clientLogger.debug('❌ Item not found in cart:', itemId);
      return;
    }

    // Проверяем, действительно ли изменились параметры
    const hasRealChanges = Object.keys(changes).some(key => {
      const currentValue = currentItem[key as keyof CartItem];
      const newValue = changes[key as keyof CartItem];
      return currentValue !== newValue;
    });

    clientLogger.debug('🔍 Change detection:', {
      changes,
      currentItem: {
        finish: currentItem.finish,
        color: currentItem.color,
        width: currentItem.width,
        height: currentItem.height,
        hardwareKitId: currentItem.hardwareKitId,
        handleId: currentItem.handleId
      },
      hasRealChanges
    });

    // Если нет реальных изменений - ничего не делаем
    if (!hasRealChanges) {
      clientLogger.debug('⏭️ No real changes detected, skipping update');
      return;
    }

    // Создаем обновленный элемент с новыми параметрами
    const updatedItem = { ...currentItem, ...changes };
    clientLogger.debug('📝 Updated item:', updatedItem);

    // Проверяем, изменились ли параметры, влияющие на цену
    const priceAffectingChanges: (keyof CartItem)[] = ['finish', 'color', 'width', 'height', 'hardwareKitId', 'handleId'];
    const hasPriceAffectingChanges = priceAffectingChanges.some(key => 
      changes[key] !== undefined && currentItem[key] !== changes[key]
    );

    if (!hasPriceAffectingChanges) {
      clientLogger.debug('⏭️ Нет изменений, влияющих на цену, обновляем только параметры');
      setCart(prev => prev.map(item => 
        item.id === itemId ? { ...item, ...changes } : item
      ));
      return;
    }

    // Для ручек получаем цену и актуальное название из каталога
    if (updatedItem.handleId) {
      const handle = findHandleById(handles, updatedItem.handleId);
      const newPrice = handle ? handle.price : updatedItem.unitPrice;
      const newHandleName = handle ? handle.name : undefined;
      clientLogger.debug('🔧 Handle price update:', { handleId: updatedItem.handleId, newPrice, newHandleName });
      // ИСПРАВЛЕНИЕ: Обновляем также handleName из актуального каталога
      // ИСПРАВЛЕНИЕ #2: Сохраняем цену ручки для использования при подтверждении
      if (itemId === editingItem) {
        setEditingItemPrice(newPrice);
      }
      
      setCart(prev => prev.map(item => 
        item.id === itemId ? { 
          ...item, 
          ...changes, 
          unitPrice: newPrice,
          handleName: newHandleName // Обновляем название из актуального каталога
        } : item
      ));
      return;
    }

    // Для дверей используем унифицированный сервис расчета цены
    clientLogger.debug('🚪 Door price calculation using unified service');
    
    const result = await priceRecalculationService.recalculateItemPrice(updatedItem, {
      validateCombination: true,
      useCache: true,
      timeout: 10000
    });

    if (result.success && result.price !== undefined) {
      clientLogger.debug('✅ Price calculated successfully:', result.price);
      // ИСПРАВЛЕНИЕ #2: Сохраняем пересчитанную цену для использования при подтверждении
      if (itemId === editingItem) {
        setEditingItemPrice(result.price);
      }
      setCart(prev => prev.map(item => 
        item.id === itemId ? { 
          ...item, 
          ...changes, 
          unitPrice: result.price!,
          sku_1c: result.sku_1c || item.sku_1c
        } : item
      ));
    } else {
      clientLogger.debug('❌ Price calculation failed:', result.error);
      // Показываем пользователю понятное сообщение об ошибке
      if (result.error) {
        alert(`Ошибка расчета цены: ${result.error}`);
      }
      // В случае ошибки обновляем корзину без изменения цены
      setCart(prev => prev.map(item => 
        item.id === itemId ? { ...item, ...changes } : item
      ));
    }
  };

  const confirmCartChanges = async () => {
    if (!editingItem) return;

    const currentItem = cart.find(i => i.id === editingItem);
    if (!currentItem) return;

    // Валидация обязательных полей (только для дверей)
    if (!currentItem.handleId && (!currentItem.finish || !currentItem.color || !currentItem.width || !currentItem.height)) {
      alert('Пожалуйста, заполните все обязательные поля');
      return;
    }

    try {
      let newPrice: number;
      
      // ИСПРАВЛЕНИЕ #2: Используем уже рассчитанную цену, если она есть, чтобы избежать двойного пересчета
      if (editingItemPrice !== null) {
        clientLogger.debug('💾 Используем уже рассчитанную цену из updateCartItem:', editingItemPrice);
        newPrice = editingItemPrice;
      } else {
        // Пересчитываем только если цена еще не была рассчитана
        if (currentItem.handleId) {
          // Для ручек получаем цену из каталога
          const handle = findHandleById(handles, currentItem.handleId);
          newPrice = handle ? handle.price : currentItem.unitPrice;
        } else {
          // Для дверей используем унифицированный сервис расчета цены
          clientLogger.debug('🚪 Door price calculation using unified service in confirmCartChanges (fallback)');
          
          const result = await priceRecalculationService.recalculateItemPrice(currentItem, {
            validateCombination: true,
            useCache: true,
            timeout: 10000
          });

          if (!result.success || !result.price) {
            const errorMessage = result.error || 'Не удалось рассчитать цену';
            alert(`Ошибка расчета цены: ${errorMessage}`);
            setEditingItem(null);
            setEditingItemPrice(null); // Сбрасываем сохраненную цену
            return;
          }

          newPrice = result.price;
        }
      }

      // Обновляем корзину
      // ИСПРАВЛЕНИЕ: Для ручек также обновляем handleName из актуального каталога
      setCart(prev => prev.map(item => {
        if (item.id === editingItem) {
          if (currentItem.handleId) {
            const handle = findHandleById(handles, currentItem.handleId);
            return { ...item, unitPrice: newPrice, handleName: handle?.name };
          }
          return { ...item, unitPrice: newPrice };
        }
        return item;
      }));

      // Сохраняем в историю
      // ИСПРАВЛЕНИЕ #1: Используем cartManagerBasePrices вместо originalPrices для единообразия
      // Это обеспечит совпадение дельты в UI и в истории
      const basePriceForDelta = cartManagerBasePrices[editingItem] || currentItem.unitPrice || 0;
      const delta = newPrice - basePriceForDelta;
      
      // Сохраняем полное состояние товара для возможности отката
      setCartHistory(prev => [...prev, {
        timestamp: new Date(),
        changes: { 
          [editingItem]: { 
            item: { ...currentItem, unitPrice: newPrice }, // Полное состояние товара
            oldPrice: currentItem.unitPrice,
            newPrice: newPrice
          } 
        },
        totalDelta: delta
      }]);

      // ИСПРАВЛЕНИЕ #1: Обновляем cartManagerBasePrices после подтверждения
      // Теперь следующая дельта будет считаться от новой базовой цены
      setCartManagerBasePrices(prev => ({
        ...prev,
        [editingItem]: newPrice
      }));

      clientLogger.debug('✅ Cart changes confirmed successfully', {
        itemId: editingItem,
        basePrice: basePriceForDelta,
        newPrice,
        delta
      });

    } catch (error) {
      clientLogger.error('❌ Error confirming cart changes:', error);
      alert('Произошла ошибка при обновлении товара');
    }

    // ИСПРАВЛЕНИЕ #2: Сбрасываем сохраненную цену после подтверждения
    // ИСПРАВЛЕНИЕ #3: Сбрасываем snapshot после подтверждения
    setEditingItem(null);
    setEditingItemPrice(null);
    setEditingItemSnapshot(null);
  };

  const cancelCartChanges = () => {
    // ИСПРАВЛЕНИЕ #3: Восстанавливаем товар из snapshot при отмене
    if (editingItem && editingItemSnapshot) {
      setCart(prev => prev.map(item => 
        item.id === editingItem ? editingItemSnapshot : item
      ));
      clientLogger.debug('↩️ Изменения отменены, товар восстановлен из snapshot');
    }
    // ИСПРАВЛЕНИЕ #2: Сбрасываем сохраненную цену при отмене
    setEditingItem(null);
    setEditingItemPrice(null);
    setEditingItemSnapshot(null);
  };

  const removeItem = (itemId: string) => {
    setCart(prev => prev.filter(item => item.id !== itemId));
  };

  const getItemDelta = (itemId: string) => {
    const basePrice = cartManagerBasePrices[itemId] || 0;
    const currentItem = cart.find(i => i.id === itemId);
    const currentPrice = currentItem?.unitPrice || 0;
    return currentPrice - basePrice;
  };

  const getTotalDelta = () => {
    return cart.reduce((total, item) => {
      return total + getItemDelta(item.id);
    }, 0);
  };

  const totalPrice = cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);

  // Функция для отката корзины к состоянию до указанной записи истории
  const rollbackToHistory = (historyIndex: number) => {
    if (historyIndex < 0 || historyIndex >= cartHistory.length) return;
    
    // Находим все записи истории до указанного индекса (включительно)
    const historyToKeep = cartHistory.slice(0, historyIndex + 1);
    
    // Применяем все изменения до этой точки
    // Для правильного отката нужно восстановить состояние каждого товара
    // из последней записи истории, где он был изменен
    const itemStates: Record<string, CartItem> = {};
    
    // Собираем состояние всех товаров из истории
    historyToKeep.forEach(entry => {
      Object.entries(entry.changes).forEach(([itemId, change]: [string, any]) => {
        if (change.item) {
          itemStates[itemId] = change.item;
        }
      });
    });
    
    // Применяем откат: обновляем товары в корзине
    setCart(prev => prev.map(item => {
      if (itemStates[item.id]) {
        return itemStates[item.id];
      }
      return item;
    }));
    
    // Обновляем базовые цены для правильного расчета дельты
    setCartManagerBasePrices(prev => {
      const newBasePrices = { ...prev };
      Object.entries(itemStates).forEach(([itemId, item]) => {
        newBasePrices[itemId] = item.unitPrice;
      });
      return newBasePrices;
    });
    
    // Удаляем записи истории после указанного индекса
    setCartHistory(historyToKeep);
    
    clientLogger.debug('↩️ Откат корзины к записи истории:', historyIndex);
  };

  // Функция для отката к состоянию до начала редактирования (полный откат всех изменений)
  const rollbackAllHistory = () => {
    if (cartHistory.length === 0) return;
    
    // Находим исходное состояние каждого товара (до первого изменения)
    const originalStates: Record<string, CartItem> = {};
    
    // Проходим по истории в обратном порядке, чтобы найти исходное состояние
    cartHistory.forEach((entry, index) => {
      Object.entries(entry.changes).forEach(([itemId, change]: [string, any]) => {
        if (change.oldPrice !== undefined && !originalStates[itemId]) {
          // Ищем оригинальный товар в корзине или используем данные из истории
          const originalItem = cart.find(i => i.id === itemId);
          if (originalItem) {
            originalStates[itemId] = { ...originalItem, unitPrice: change.oldPrice };
          }
        }
      });
    });
    
    // Восстанавливаем исходные цены
    setCart(prev => prev.map(item => {
      if (originalStates[item.id]) {
        return originalStates[item.id];
      }
      return item;
    }));
    
    // Обновляем базовые цены
    setCartManagerBasePrices(prev => {
      const newBasePrices = { ...prev };
      Object.entries(originalStates).forEach(([itemId, item]) => {
        newBasePrices[itemId] = item.unitPrice;
      });
      return newBasePrices;
    });
    
    // Очищаем историю
    setCartHistory([]);
    
    clientLogger.debug('↩️ Полный откат всех изменений корзины');
  };

  // Проверки разрешений по ролям
  const canCreateQuote = userRole === 'admin' || userRole === 'complectator';
  const canCreateInvoice = userRole === 'admin' || userRole === 'complectator';
  const canCreateOrder = userRole === 'admin' || userRole === 'complectator' || userRole === 'executor';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-2xl font-bold text-black">Корзина</h2>
          
          {/* Кнопки экспорта документов */}
          <div className="flex items-center space-x-2">
            {userRole !== 'guest' && (
              <button
                onClick={() => setShowClientManager(true)}
                className="flex items-center space-x-1 px-3 py-1 text-sm border border-gray-400 text-gray-700 hover:bg-gray-50 transition-all duration-200"
              >
                <span>👤</span>
                <span>{selectedClientName || 'Заказчик'}</span>
              </button>
            )}
            {canCreateQuote && (
            <button
                onClick={() => generateDocumentFast('quote', 'pdf')}
              className="flex items-center space-x-1 px-3 py-1 text-sm border border-blue-500 text-blue-600 hover:bg-blue-50 transition-all duration-200"
            >
              <span>📄</span>
              <span>КП</span>
            </button>
            )}
            {canCreateInvoice && (
            <button
                onClick={() => generateDocumentFast('invoice', 'pdf')}
              className="flex items-center space-x-1 px-3 py-1 text-sm border border-green-500 text-green-600 hover:bg-green-50 transition-all duration-200"
            >
                <span>📄</span>
              <span>Счет</span>
            </button>
            )}
            {canCreateOrder && (
            createdOrder ? (
              <button
                onClick={() => {
                  clientLogger.debug('Открытие модального окна заказа:', { orderId: createdOrder.id, orderNumber: createdOrder.number });
                  setShowOrderModal(true);
                }}
                className="flex items-center space-x-1 px-3 py-1 text-sm border border-blue-500 bg-blue-600 text-white hover:bg-blue-700 transition-all duration-200"
              >
                <span>📦</span>
                <span>{createdOrder.number}</span>
              </button>
            ) : (
            <button
                onClick={async () => {
                  if (!selectedClient) {
                    alert('Выберите клиента для создания заказа');
                    return;
                  }

                  if (cart.length === 0) {
                    alert('Корзина пуста');
                    return;
                  }

                  try {
                    // Преобразуем items корзины в формат для API
                    const items = cart.map(item => {
                      // Формируем полное название товара точно как в корзине
                      let fullName = '';
                      if (item.itemType === 'handle') {
                        try {
                          const handle = handles ? findHandleById(handles, item.handleId) : undefined;
                          const handleName = handle?.name || item.handleName || 'Неизвестная ручка';
                          fullName = `Ручка ${handleName}`;
                        } catch (e) {
                          fullName = `Ручка ${item.handleName || 'Неизвестная ручка'}`;
                        }
                      } else if (item.itemType === 'backplate') {
                        try {
                          const handle = handles ? findHandleById(handles, item.handleId) : undefined;
                          const handleName = handle?.name || item.handleName || 'Завертка';
                          fullName = `Завертка ${handleName}`;
                        } catch (e) {
                          fullName = `Завертка ${item.handleName || 'Завертка'}`;
                        }
                      } else if (item.itemType === 'limiter') {
                        fullName = formatLimiterDisplayName(item.limiterName);
                      } else {
                        // Дверь — полная спецификация
                        const modelName = item.model?.replace(/DomeoDoors_/g, '').replace(/_/g, ' ') || 'Неизвестная модель';
                        const doorSpecParts: string[] = [];
                        const finishVal = String(item.finish ?? '').trim();
                        const colorVal = String(item.color ?? '').trim();
                        if (finishVal) doorSpecParts.push(finishVal);
                        if (colorVal) {
                          const rest = finishVal && (colorVal === finishVal || colorVal.startsWith(finishVal + ';') || colorVal.startsWith(finishVal + ' '))
                            ? colorVal.replace(new RegExp(`^\\s*${String(finishVal).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*;?\\s*`, 'i'), '').trim()
                            : colorVal;
                          if (rest) doorSpecParts.push(rest);
                        }
                        if (item.width != null && item.height != null) doorSpecParts.push(`${item.width} × ${item.height} мм`);
                        if (item.edge === 'да') doorSpecParts.push('Кромка: да');
                        if (item.reversible) doorSpecParts.push('Реверс: да');
                        if (item.mirror) doorSpecParts.push('Зеркало: да');
                        if (item.threshold) doorSpecParts.push('Порог: да');
                        if (item.optionIds?.length) doorSpecParts.push('Наличники: да');
                        const kitName = getKitDisplayName(
                          (Array.isArray(hardwareKits) && hardwareKits.length > 0 && item.hardwareKitId)
                            ? (findHardwareKitById(hardwareKits, item.hardwareKitId)?.name ?? item.hardwareKitName)
                            : item.hardwareKitName
                        );
                        doorSpecParts.push(`Фурнитура: ${kitName}`);
                        const specStr = doorSpecParts.filter((x) => x !== '—').join('; ');
                        fullName = specStr ? `Дверь DomeoDoors ${modelName}; ${specStr}` : `Дверь DomeoDoors ${modelName}`;
                      }
                      
                      return {
                        id: item.id,
                        productId: item.id,
                        name: fullName, // Сохраняем полное название как в корзине
                        model: item.model,
                        model_name: item.model_name,
                        matchingVariants: item.matchingVariants,
                        qty: item.qty || 1,
                        quantity: item.qty || 1,
                        unitPrice: item.unitPrice || 0,
                        price: item.unitPrice || 0,
                        width: item.width,
                        height: item.height,
                        color: item.color,
                        finish: item.finish,
                        sku_1c: item.sku_1c || undefined,
                        handleId: item.handleId,
                        handleName: item.handleName,
                        limiterId: item.limiterId,
                        limiterName: item.limiterName,
                        type: item.type || (item.handleId ? 'handle' : item.limiterId ? 'limiter' : 'door'),
                        hardwareKitId: item.hardwareKitId,
                        hardwareKitName: item.hardwareKitName ?? (item.hardwareKitId && Array.isArray(hardwareKits) && hardwareKits.length > 0 ? findHardwareKitById(hardwareKits, item.hardwareKitId)?.name : undefined),
                        style: item.style,
                        // Кромка, порог, наличники — в заказ попадают все данные из конфигуратора для экспорта в Excel
                        edge: item.edge,
                        edgeId: item.edgeId,
                        edgeColorName: item.edgeColorName,
                        threshold: item.threshold === true || item.threshold === 1 || (typeof item.threshold === 'string' && item.threshold.toLowerCase().trim() === 'да'),
                        optionIds: item.optionIds,
                        architraveNames: item.architraveNames,
                        optionNames: item.optionNames,
                        reversible: item.reversible,
                        mirror: item.mirror,
                        glassColor: item.glassColor,
                        specRows: item.specRows,
                        // Разбивка цены по опциям из конфигуратора — передаём в заказ и далее в экспорт (все колонки Excel)
                        breakdown: item.breakdown
                      };
                    });

                    const totalAmount = cart.reduce((sum, item) => sum + (item.unitPrice || 0) * (item.qty || 1), 0);

                    // Создаем Order (основной документ) из корзины
                    const requestBody = {
                        client_id: selectedClient,
                        items,
                        total_amount: totalAmount,
                        subtotal: totalAmount,
                        tax_amount: 0,
                        notes: 'Создан из корзины на странице Doors'
                    };
                    
                    clientLogger.debug('Создание заказа:', {
                      client_id: selectedClient,
                      itemsCount: items.length,
                      items: items.map(item => ({
                        type: item.type,
                        qty: item.qty,
                        unitPrice: item.unitPrice,
                        model: item.model,
                        handleId: item.handleId
                      })),
                      total_amount: totalAmount
                    });
                    
                    const response = await fetchWithAuth('/api/orders', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify(requestBody)
                    });

                    if (response.ok) {
                      let result: unknown;
                      try {
                        result = await response.json();
                      } catch (jsonError) {
                        clientLogger.error('Ошибка парсинга JSON ответа create order:', jsonError);
                        alert('Ошибка при создании заказа: не удалось обработать ответ сервера');
                        return;
                      }
                      // Парсим ответ в формате apiSuccess
                      const { parseApiResponse } = await import('@/lib/utils/parse-api-response');
                      const parsedResult = parseApiResponse<{ order?: { id?: string; number?: string } }>(result);
                      
                      const orderData = parsedResult && typeof parsedResult === 'object' && parsedResult !== null && 'order' in parsedResult
                        ? (parsedResult as { order: { id?: string; number?: string } | null }).order
                        : null;
                      
                      const orderId = orderData && typeof orderData === 'object' && 'id' in orderData
                        ? String(orderData.id)
                        : '';
                      const orderNumber = orderData && typeof orderData === 'object' && 'number' in orderData
                        ? String(orderData.number)
                        : '';
                      
                      if (orderId && orderNumber) {
                        // Сохраняем данные созданного заказа
                        setCreatedOrder({ id: orderId, number: orderNumber });
                      alert(`Заказ ${orderNumber} создан успешно!`);
                      } else {
                        alert('Заказ создан успешно!');
                      }
                      // Корзина остается активной (не очищаем)
                    } else {
                      let errorData: unknown;
                      try {
                        errorData = await response.json();
                      } catch (jsonError) {
                        clientLogger.error('Ошибка парсинга JSON ответа error:', jsonError);
                        alert(`Ошибка: ${response.status} ${response.statusText}`);
                        return;
                      }
                      // Парсим ответ в формате apiError
                      const { parseApiResponse } = await import('@/lib/utils/parse-api-response');
                      const parsedError = parseApiResponse<{ error?: { code?: string; message?: string; details?: unknown } }>(errorData);
                      
                      const errorMessage = parsedError && typeof parsedError === 'object' && parsedError !== null && 'error' in parsedError
                        ? (parsedError.error && typeof parsedError.error === 'object' && 'message' in parsedError.error
                          ? String(parsedError.error.message)
                          : String(parsedError.error))
                        : (errorData && typeof errorData === 'object' && errorData !== null && 'error' in errorData
                        ? String((errorData as { error: unknown }).error)
                          : 'Неизвестная ошибка');
                      
                      clientLogger.error('Ошибка при создании заказа:', {
                        status: response.status,
                        statusText: response.statusText,
                        errorData,
                        parsedError,
                        errorMessage
                      });
                      
                      alert(`Ошибка: ${errorMessage}`);
                    }
                  } catch (error) {
                    clientLogger.error('Error creating order:', error);
                    alert('Ошибка при создании заказа');
                  }
                }}
              className="flex items-center space-x-1 px-3 py-1 text-sm border border-orange-500 bg-orange-600 text-white hover:bg-orange-700 transition-all duration-200"
            >
                <span>🛒</span>
              <span>Создать заказ</span>
            </button>
            )
            )}
          </div>
          
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>


        {/* Список товаров */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {filteredCart.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {cart.length === 0 ? 'Корзина пуста' : 'Товары не найдены'}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCart.map((item) => {
                const delta = getItemDelta(item.id);
                const isEditing = editingItem === item.id;
                
                // Ручка — отдельная строка с редактируемым количеством
                if (item.itemType === 'handle') {
                  const handle = getHandleById(item.handleId);
                  const currentHandleName = handle?.name || item.handleName || "Ручка";
                  return (
                  <div key={item.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0 min-h-[2.25rem] flex flex-col justify-center">
                        {/* ИСПРАВЛЕНИЕ: Отображаем фото ручки при редактировании */}
                        {isEditing && handle && handle.photos && handle.photos.length > 0 && (
                          <div className="mb-2 flex items-center space-x-2">
                            {handle.photos.slice(0, 3).map((photo, idx) => (
                              <img
                                key={idx}
                                src={getImageSrc(photo) ?? undefined}
                                alt={`${currentHandleName} фото ${idx + 1}`}
                                className="w-12 h-12 object-cover rounded border border-gray-200"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ))}
                          </div>
                        )}
                        <div className="font-medium text-black text-sm truncate">
                          {currentHandleName ? `Ручка ${currentHandleName}` : "Ручка"}
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 shrink-0">
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => updateCartItem(item.id, { qty: Math.max(1, item.qty - 1) })}
                            className="w-4 h-4 bg-gray-200 hover:bg-gray-300 rounded flex items-center justify-center text-xs"
                          >
                            -
                          </button>
                          <span className="min-w-[12px] text-center text-xs">{item.qty}</span>
                          <button
                            onClick={() => updateCartItem(item.id, { qty: item.qty + 1 })}
                            className="w-4 h-4 bg-gray-200 hover:bg-gray-300 rounded flex items-center justify-center text-xs"
                          >
                            +
                          </button>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-black text-sm">
                            {fmtInt(item.unitPrice * item.qty)} ₽
                          </div>
                          {isEditing && delta !== 0 && (
                            <div className={`text-xs ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {delta > 0 ? '+' : ''}{fmtInt(delta)} ₽
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-3 shrink-0 min-w-[4.5rem] justify-end">
                          <button
                            onClick={() => removeItem(item.id)}
                            className="w-5 h-5 bg-gray-500 text-white rounded hover:bg-gray-600 flex items-center justify-center text-xs shrink-0"
                            title="Удалить"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      {isEditing && (
                        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
                          {/* Компактная строка с кнопками */}
                          <div className="flex items-center space-x-2 mb-4">
                            {/* Ручка - кнопка для открытия модального окна */}
                            <div className="flex-shrink-0">
                              <label className="block text-xs font-medium text-gray-700 mb-1">Ручка</label>
                              <button
                                onClick={() => {
                                  if (item.id) {
                                    setEditingHandleItemId(item.id);
                                    setShowHandleModalInCart(true);
                                  }
                                }}
                                className="w-full text-xs border border-gray-300 rounded px-3 py-2 bg-white hover:bg-gray-50 text-left flex items-center justify-between min-w-[200px]"
                              >
                                <span>
                                  {handle && handle.name ? `Ручка ${handle.name}` : 'Выбрать ручку'}
                                </span>
                                <span className="text-gray-400 ml-2">→</span>
                              </button>
                              {handle && handle.price !== undefined && (
                                <div className="text-xs text-gray-600 mt-1">
                                  Цена: {fmtInt(handle.price)} ₽
                                </div>
                              )}
                            </div>

                            {/* Кнопки */}
                            <div className="flex-shrink-0">
                              <label className="block text-xs font-medium text-gray-700 mb-1">&nbsp;</label>
                              <div className="flex space-x-1">
                                <button
                                  onClick={confirmCartChanges}
                                  className="px-2 py-1 text-xs bg-black text-white rounded hover:bg-gray-800"
                                >
                                  Применить
                                </button>
                                <button
                                  onClick={cancelCartChanges}
                                  className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
                                >
                                  Отменить
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                // Завертка — отдельная строка с редактируемым количеством
                if (item.itemType === 'backplate') {
                  const handle = getHandleById(item.handleId);
                  const currentHandleName = handle?.name || item.handleName || "Завертка";
                  return (
                    <div key={item.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0 min-h-[2.25rem] flex flex-col justify-center">
                          <div className="font-medium text-black text-sm truncate">
                            Завертка {currentHandleName}
                          </div>
                        </div>
                        <div className="flex items-center space-x-4 shrink-0">
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => updateCartItem(item.id, { qty: Math.max(1, item.qty - 1) })}
                              className="w-4 h-4 bg-gray-200 hover:bg-gray-300 rounded flex items-center justify-center text-xs"
                            >
                              -
                            </button>
                            <span className="min-w-[12px] text-center text-xs">{item.qty}</span>
                            <button
                              onClick={() => updateCartItem(item.id, { qty: item.qty + 1 })}
                              className="w-4 h-4 bg-gray-200 hover:bg-gray-300 rounded flex items-center justify-center text-xs"
                            >
                              +
                            </button>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-black text-sm">
                              {fmtInt(item.unitPrice * item.qty)} ₽
                            </div>
                            {isEditing && delta !== 0 && (
                              <div className={`text-xs ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {delta > 0 ? '+' : ''}{fmtInt(delta)} ₽
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-3 shrink-0 min-w-[4.5rem] justify-end">
                          <span className="w-5 h-5 shrink-0" aria-hidden />
                          <button
                            onClick={() => removeItem(item.id)}
                            className="w-5 h-5 bg-gray-500 text-white rounded hover:bg-gray-600 flex items-center justify-center text-xs shrink-0"
                            title="Удалить"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }

                // Ограничитель — формат «Ограничитель скрытый магнитный SECRET DS Цвет хром» и т.д.
                if (item.itemType === 'limiter') {
                  const limiterDisplayName = formatLimiterDisplayName(item.limiterName);
                  return (
                    <div key={item.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0 min-h-[2.25rem] flex flex-col justify-center">
                          <div className="font-medium text-black text-sm truncate">
                            {limiterDisplayName}
                          </div>
                        </div>
                        <div className="flex items-center space-x-4 shrink-0">
                          <div className="flex items-center space-x-1">
                            <button
                              onClick={() => updateCartItem(item.id, { qty: Math.max(1, item.qty - 1) })}
                              className="w-4 h-4 bg-gray-200 hover:bg-gray-300 rounded flex items-center justify-center text-xs"
                            >
                              -
                            </button>
                            <span className="min-w-[12px] text-center text-xs">{item.qty}</span>
                            <button
                              onClick={() => updateCartItem(item.id, { qty: item.qty + 1 })}
                              className="w-4 h-4 bg-gray-200 hover:bg-gray-300 rounded flex items-center justify-center text-xs"
                            >
                              +
                            </button>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-black text-sm">
                              {fmtInt(item.unitPrice * item.qty)} ₽
                            </div>
                            {isEditing && delta !== 0 && (
                              <div className={`text-xs ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {delta > 0 ? '+' : ''}{fmtInt(delta)} ₽
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center space-x-3 shrink-0 min-w-[4.5rem] justify-end">
                          <span className="w-5 h-5 shrink-0" aria-hidden />
                          <button
                            onClick={() => removeItem(item.id)}
                            className="w-5 h-5 bg-gray-500 text-white rounded hover:bg-gray-600 flex items-center justify-center text-xs shrink-0"
                            title="Удалить"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                }
                
                // Дверь (полная конфигурация): название + иконка со спецификацией
                const doorSpecParts: string[] = [];
                const finishVal = String(item.finish ?? '').trim();
                const colorVal = String(item.color ?? '').trim();
                if (finishVal) doorSpecParts.push(finishVal);
                if (colorVal) {
                  const rest = finishVal && (colorVal === finishVal || colorVal.startsWith(finishVal + ';') || colorVal.startsWith(finishVal + ' '))
                    ? colorVal.replace(new RegExp(`^\\s*${String(finishVal).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*;?\\s*`, 'i'), '').trim()
                    : colorVal;
                  if (rest) doorSpecParts.push(rest);
                }
                if (item.width != null && item.height != null) doorSpecParts.push(`${item.width} × ${item.height} мм`);
                if (item.edge === 'да') doorSpecParts.push('Кромка: да');
                if (item.reversible) doorSpecParts.push('Реверс: да');
                if (item.mirror) doorSpecParts.push('Зеркало: да');
                if (item.threshold) doorSpecParts.push('Порог: да');
                if (item.optionIds?.length) doorSpecParts.push('Наличники: да');
                const doorKitName = getKitDisplayName(
                  (!Array.isArray(hardwareKits) || hardwareKits.length === 0 || !item.hardwareKitId)
                    ? item.hardwareKitName
                    : (findHardwareKitById(hardwareKits, item.hardwareKitId)?.name ?? item.hardwareKitName)
                );
                doorSpecParts.push(`Фурнитура: ${doorKitName}`);
                return (
                  <div key={item.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0 min-h-[2.25rem] flex flex-col justify-center">
                        <div className="font-medium text-black text-sm truncate flex items-center gap-1">
                          {`Дверь DomeoDoors ${item.model?.replace(/DomeoDoors_/g, '').replace(/_/g, ' ') || 'Неизвестная модель'}`}
                          <button
                            type="button"
                            onClick={() => setDoorSpecModalId(item.id)}
                            className="shrink-0 w-5 h-5 rounded flex items-center justify-center text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                            title="Полная спецификация"
                            aria-label="Показать полную спецификацию"
                          >
                            ℹ️
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4 shrink-0">
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => updateCartItem(item.id, { qty: Math.max(1, item.qty - 1) })}
                            className="w-4 h-4 bg-gray-200 hover:bg-gray-300 rounded flex items-center justify-center text-xs"
                          >
                            -
                          </button>
                          <span className="min-w-[12px] text-center text-xs">{item.qty}</span>
                          <button
                            onClick={() => updateCartItem(item.id, { qty: item.qty + 1 })}
                            className="w-4 h-4 bg-gray-200 hover:bg-gray-300 rounded flex items-center justify-center text-xs"
                          >
                            +
                          </button>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-black text-sm">
                            {fmtInt(item.unitPrice * item.qty)} ₽
                          </div>
                          {isEditing && delta !== 0 && (
                            <div className={`text-xs ${delta > 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {delta > 0 ? '+' : ''}{fmtInt(delta)} ₽
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-3 shrink-0 min-w-[4.5rem] justify-end">
                        <button
                          onClick={() => removeItem(item.id)}
                          className="w-5 h-5 bg-gray-500 text-white rounded hover:bg-gray-600 flex items-center justify-center text-xs shrink-0"
                          title="Удалить"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                    {isEditing && availableParams && (
                      <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
                        {/* Компактная строка с селектами */}
                        <div className="flex items-center space-x-2 mb-4">
                          {/* Покрытие */}
                          <div className="flex-shrink-0">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Покрытие</label>
                            <select
                              value={item.finish || ''}
                              onChange={(e) => updateCartItem(item.id, { finish: e.target.value })}
                              className="w-24 text-xs border border-gray-300 rounded px-1 py-1"
                            >
                              <option value="">Выберите</option>
                              {availableParams.finishes?.map((finish: string) => (
                                <option key={finish} value={finish}>{finish}</option>
                              ))}
                            </select>
                          </div>

                          {/* Цвет */}
                          <div className="flex-shrink-0">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Цвет</label>
                            <select
                              value={item.color || ''}
                              onChange={(e) => updateCartItem(item.id, { color: e.target.value })}
                              className="w-24 text-xs border border-gray-300 rounded px-1 py-1"
                            >
                              <option value="">Выберите</option>
                              {availableParams.colors?.map((color: string) => (
                                <option key={color} value={color}>{color}</option>
                              ))}
                            </select>
                          </div>

                          {/* Ширина */}
                          <div className="flex-shrink-0">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Ширина</label>
                            <select
                              value={item.width || ''}
                              onChange={(e) => updateCartItem(item.id, { width: Number(e.target.value) })}
                              className="w-16 text-xs border border-gray-300 rounded px-1 py-1"
                            >
                              <option value="">Выберите</option>
                              {availableParams.widths?.map((width: number) => (
                                <option key={width} value={width}>{width}</option>
                              ))}
                            </select>
                          </div>

                          {/* Высота */}
                          <div className="flex-shrink-0">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Высота</label>
                            <select
                              value={item.height || ''}
                              onChange={(e) => updateCartItem(item.id, { height: Number(e.target.value) })}
                              className="w-16 text-xs border border-gray-300 rounded px-1 py-1"
                            >
                              <option value="">Выберите</option>
                              {availableParams.heights?.map((height: number) => (
                                <option key={height} value={height}>{height}</option>
                              ))}
                            </select>
                          </div>

                          {/* Комплект фурнитуры */}
                          <div className="flex-shrink-0">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Фурнитура</label>
                            <select
                              value={item.hardwareKitId || ''}
                              onChange={(e) => updateCartItem(item.id, { hardwareKitId: e.target.value })}
                              className="w-24 text-xs border border-gray-300 rounded px-1 py-1"
                            >
                              <option value="">Выберите</option>
                              {availableParams.hardwareKits?.map((kit: {id: string, name: string}) => (
                                <option key={kit.id} value={kit.id}>{kit.name}</option>
                              ))}
                            </select>
                          </div>

                          {/* Количество */}
                          <div className="flex-shrink-0">
                            <label className="block text-xs font-medium text-gray-700 mb-1">Количество</label>
                            <div className="flex items-center space-x-1">
                              <button
                                onClick={() => updateCartItem(item.id, { qty: Math.max(1, item.qty - 1) })}
                                className="w-5 h-5 bg-gray-200 hover:bg-gray-300 rounded flex items-center justify-center text-xs"
                              >
                                -
                              </button>
                              <span className="min-w-[16px] text-center text-xs">{item.qty}</span>
                              <button
                                onClick={() => updateCartItem(item.id, { qty: item.qty + 1 })}
                                className="w-5 h-5 bg-gray-200 hover:bg-gray-300 rounded flex items-center justify-center text-xs"
                              >
                                +
                              </button>
                            </div>
                          </div>
                          {/* Кнопки */}
                          <div className="flex-shrink-0">
                            <label className="block text-xs font-medium text-gray-700 mb-1">&nbsp;</label>
                            <div className="flex space-x-1">
                              <button
                                onClick={confirmCartChanges}
                                className="px-2 py-1 text-xs bg-black text-white rounded hover:bg-gray-800"
                              >
                                Применить
                              </button>
                              <button
                                onClick={cancelCartChanges}
                                className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
                              >
                                Отменить
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="text-lg font-semibold text-black">
              Итого: {fmtInt(totalPrice)} ₽
              {editingItem && getTotalDelta() !== 0 && (
                <span className={`ml-2 text-sm ${getTotalDelta() > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ({getTotalDelta() > 0 ? '+' : ''}{fmtInt(getTotalDelta())} ₽)
                </span>
              )}
            </div>
            <div className="flex space-x-3">
              {cartHistory.length > 0 && (
                <button
                  onClick={() => setShowHistoryModal(true)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  История ({cartHistory.length})
                </button>
              )}
              <button
                onClick={() => {
                  setCart([]);
                  setCreatedOrder(null); // Сбрасываем созданный заказ при очистке корзины
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
              >
                Очистить корзину
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Модальное окно истории изменений */}
      {showHistoryModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-lg w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-black">История изменений корзины</h2>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            {/* Список истории */}
            <div className="flex-1 overflow-y-auto p-6">
              {cartHistory.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  История изменений пуста
                </div>
              ) : (
                <div className="space-y-3">
                  {cartHistory.map((entry, index) => {
                    const itemIds = Object.keys(entry.changes);
                    return (
                      <div
                        key={index}
                        className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900 mb-1">
                              {entry.timestamp.toLocaleString('ru-RU', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </div>
                            <div className="text-xs text-gray-600 mb-2">
                              Изменено товаров: {itemIds.length}
                            </div>
                            <div className="space-y-1">
                              {itemIds.map(itemId => {
                                const change = entry.changes[itemId];
                                const item = cart.find(i => i.id === itemId) || change?.item;
                                return (
                                  <div key={itemId} className="text-xs text-gray-700">
                                    <span className="font-medium">
                                      {item?.type === 'handle' 
                                        ? (() => {
                                            const displayHandle = findHandleById(handles, item?.handleId);
                                            return `Ручка ${displayHandle?.name || item?.handleName || itemId}`;
                                          })()
                                        : `Дверь ${item?.model?.replace(/DomeoDoors_/g, '').replace(/_/g, ' ') || itemId}`}
                                    </span>
                                    {' - Цена: '}
                                    {change?.oldPrice && (
                                      <>
                                        <span className="line-through text-gray-400">
                                          {fmtInt(change.oldPrice)}₽
                                        </span>
                                        {' → '}
                                      </>
                                    )}
                                    <span className="font-medium text-green-600">
                                      {fmtInt(change?.newPrice || change?.item?.unitPrice || 0)}₽
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div className="flex flex-col items-end space-y-2 ml-4">
                            <div className={`text-sm font-semibold ${entry.totalDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {entry.totalDelta >= 0 ? '+' : ''}{fmtInt(entry.totalDelta)} ₽
                            </div>
                            <button
                              onClick={() => {
                                rollbackToHistory(index);
                                setShowHistoryModal(false);
                              }}
                              className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"
                              title="Откатить к этому состоянию"
                            >
                              Откатить
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Всего записей: {cartHistory.length}
              </div>
              <div className="flex space-x-3">
                {cartHistory.length > 0 && (
                  <button
                    onClick={() => {
                      if (confirm('Вы уверены, что хотите откатить все изменения?')) {
                        rollbackAllHistory();
                        setShowHistoryModal(false);
                      }
                    }}
                    className="px-4 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600"
                  >
                    Откатить все изменения
                  </button>
                )}
                <button
                  onClick={() => setShowHistoryModal(false)}
                  className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно выбора ручек для редактирования в корзине */}
      {showHandleModalInCart && editingHandleItemId && (() => {
        const editingItem = cart.find(i => i.id === editingHandleItemId);
        if (!editingItem) {
          // Если товар не найден, закрываем модальное окно
          setShowHandleModalInCart(false);
          setEditingHandleItemId(null);
          return null;
        }
        return (
          <HandleSelectionModal
            handles={handles}
            selectedHandleId={editingItem.handleId}
            onSelect={(handleId: string) => {
              // Обновляем ручку в товаре корзины
              if (editingHandleItemId) {
                updateCartItem(editingHandleItemId, { handleId });
              }
              setShowHandleModalInCart(false);
              setEditingHandleItemId(null);
            }}
            onClose={() => {
              setShowHandleModalInCart(false);
              setEditingHandleItemId(null);
            }}
          />
        );
      })()}

      {/* Модальное окно заказа */}
      {createdOrder && (
        <OrderDetailsModal
          isOpen={showOrderModal}
          onClose={() => setShowOrderModal(false)}
          orderId={createdOrder.id}
          userRole={userRole}
        />
      )}

      {/* Модальное окно — полная спецификация двери (как в правой панели) */}
      {doorSpecModalId && (() => {
        const specItem = cart.find((i) => i.itemType === 'door' && i.id === doorSpecModalId) as CartItem | undefined;
        if (!specItem) return null;
        const kitName = getKitDisplayName(
          (!Array.isArray(hardwareKits) || hardwareKits.length === 0 || !specItem.hardwareKitId)
            ? specItem.hardwareKitName
            : (findHardwareKitById(hardwareKits, specItem.hardwareKitId)?.name ?? specItem.hardwareKitName)
        );
        const finishVal = String(specItem.finish ?? '').trim();
        const colorVal = String(specItem.color ?? '').trim();
        let coatingText = '—';
        if (finishVal || colorVal) {
          const parts: string[] = [];
          if (finishVal) parts.push(finishVal);
          if (colorVal) {
            const rest = finishVal && (colorVal === finishVal || colorVal.startsWith(finishVal + ';') || colorVal.startsWith(finishVal + ' '))
              ? colorVal.replace(new RegExp(`^\\s*${String(finishVal).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*;?\\s*`, 'i'), '').trim()
              : colorVal;
            if (rest) parts.push(rest);
          }
          coatingText = parts.join('; ');
        }
        const mirrorText = specItem.mirror === 'one' ? 'Одна сторона' : specItem.mirror === 'both' ? 'Две стороны' : specItem.mirror ? 'Да' : 'Нет';
        // Ограничитель может быть в строке двери или в отдельной позиции корзины
        const limiterFromCart = cart.find((i) => i.itemType === 'limiter');
        const limiterDisplay = (specItem.limiterName || limiterFromCart?.limiterName)
          ? formatLimiterDisplayName(specItem.limiterName || limiterFromCart?.limiterName)
          : 'Не выбран';
        const specRows =
          specItem.specRows && specItem.specRows.length > 0
            ? specItem.specRows.filter((row) => {
                const v = String(row.value ?? '').trim();
                return v !== '' && v !== '—' && v !== 'Не выбрано' && v !== 'Не выбран';
              })
            : [
                { label: 'Стиль', value: specItem.style || '—' },
                { label: 'Полотно', value: specItem.model?.replace(/DomeoDoors_/g, '').replace(/_/g, ' ') || '—' },
                { label: 'Размеры', value: specItem.width != null && specItem.height != null ? `${specItem.width} × ${specItem.height} мм` : '—' },
                { label: 'Реверсные двери', value: specItem.reversible ? 'Да' : 'Нет' },
                { label: 'Покрытие и цвет', value: coatingText },
                { label: 'Алюминиевая кромка', value: specItem.edge === 'да' ? 'Да' : 'Нет' },
                { label: 'Комплект фурнитуры', value: kitName },
                { label: 'Ручка', value: specItem.handleName || '—' },
                { label: 'Наличник', value: (specItem.optionIds?.length ?? 0) > 0 ? 'Да' : 'Не выбран' },
                { label: 'Ограничитель', value: limiterDisplay },
                { label: 'Зеркало', value: mirrorText },
                { label: 'Порог', value: specItem.threshold ? 'Да' : 'Нет' },
              ];
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50" onClick={() => setDoorSpecModalId(null)}>
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
                <h3 className="text-lg font-semibold text-black">Спецификация двери</h3>
                <button type="button" onClick={() => setDoorSpecModalId(null)} className="p-2 text-gray-500 hover:text-black rounded-lg" aria-label="Закрыть">✕</button>
              </div>
              <div className="p-5 overflow-auto flex-1">
                <div className="text-sm font-medium text-gray-800 mb-3">
                  {`DomeoDoors ${specItem.model?.replace(/DomeoDoors_/g, '').replace(/_/g, ' ') || '—'}`}
                </div>
                <div className="space-y-0 rounded-lg border border-gray-200 bg-gray-50 p-4">
                  {specRows.map((row, index) => (
                    <div
                      key={row.label}
                      className={index < specRows.length - 1 ? 'pb-2 mb-2 border-b border-gray-200' : ''}
                    >
                      <span className="text-xs font-medium text-gray-600">{row.label}: </span>
                      <span className="text-sm font-semibold text-gray-900">{row.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

