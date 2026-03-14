'use client';

import { useState } from 'react';
import { Package, Eye, EyeOff } from 'lucide-react';
import { formatModelName } from '@/lib/utils/format-model-name';

interface DocumentItemsProps {
  document: any;
}

export function DocumentItems({ document }: DocumentItemsProps) {
  const [showDetails, setShowDetails] = useState(false);

  const getItems = () => {
    // Получаем товары из соответствующих полей в зависимости от типа документа
    if (document.type === 'quote' && document.quote_items) {
      return document.quote_items;
    } else if (document.type === 'invoice' && document.invoice_items) {
      return document.invoice_items;
    } else if (document.type === 'order' && document.order_items) {
      return document.order_items;
    }
    return [];
  };

  const items = getItems();

  const formatItemName = (item: any) => {
    if (item.type === 'door') {
      return `Дверь ${formatModelName(item.model)} (${item.finish}, ${item.color}, ${item.width} × ${item.height} мм)`;
    } else if (item.type === 'handle') {
      return item.handleName || item.name || 'Ручка';
    }
    return item.name || 'Товар';
  };

  const formatItemDetails = (item: any) => {
    const details = [];
    
    if (item.type === 'door') {
      if (item.hardwareKitName || item.hardware) {
        const hardwareName = (item.hardwareKitName || item.hardware || 'Базовый').replace(/^Комплект фурнитуры — /, '');
        details.push(`Комплект фурнитуры - ${hardwareName}`);
      }
      if (item.thickness) {
        details.push(`Толщина: ${item.thickness} мм`);
      }
      if (item.opening_direction) {
        details.push(`Направление открывания: ${item.opening_direction}`);
      }
    } else if (item.type === 'handle') {
      if (item.finish) {
        details.push(`Отделка: ${item.finish}`);
      }
      if (item.color) {
        details.push(`Цвет: ${item.color}`);
      }
    }

    return details;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <Package className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            Товары ({items.length})
          </h2>
        </div>
        <button
          onClick={() => setShowDetails(!showDetails)}
          className="flex items-center space-x-2 px-3 py-1 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
        >
          {showDetails ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          <span>{showDetails ? 'Скрыть детали' : 'Показать детали'}</span>
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-center text-gray-500 py-8">
          <Package className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>Товары не найдены</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item: any, index: number) => (
            <div key={item.id || index} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center text-sm font-medium text-blue-600">
                      {index + 1}
                    </div>
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {formatItemName(item)}
                      </h3>
                      {showDetails && formatItemDetails(item).length > 0 && (
                        <div className="mt-1 space-y-1">
                          {formatItemDetails(item).map((detail, detailIndex) => (
                            <p key={detailIndex} className="text-sm text-gray-600">
                              {detail}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="text-sm font-medium text-gray-900">
                    {item.quantity || 1} шт.
                  </div>
                  <div className="text-sm text-gray-600">
                    {item.price?.toLocaleString('ru-RU')} ₽
                  </div>
                  <div className="text-sm font-medium text-gray-900">
                    {(item.price * (item.quantity || 1)).toLocaleString('ru-RU')} ₽
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Итого */}
      {items.length > 0 && (
        <div className="border-t border-gray-200 pt-4 mt-4">
          <div className="flex justify-between items-center">
            <span className="text-lg font-medium text-gray-900">Итого:</span>
            <span className="text-lg font-bold text-gray-900">
              {document.totalAmount?.toLocaleString('ru-RU')} ₽
            </span>
          </div>
          {document.subtotal && document.subtotal !== document.totalAmount && (
            <div className="flex justify-between items-center mt-1">
              <span className="text-sm text-gray-500">Без НДС:</span>
              <span className="text-sm text-gray-500">
                {document.subtotal.toLocaleString('ru-RU')} ₽
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
