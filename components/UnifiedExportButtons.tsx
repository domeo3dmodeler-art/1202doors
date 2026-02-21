'use client';

import React, { useState } from 'react';
import type { CartItem, ExportOptions } from '@/lib/services/export.service';
import { fetchWithAuth } from '@/lib/utils/fetch-with-auth';

export interface ExportButtonsProps {
  getCart: () => CartItem[];
  acceptedKPId?: string;
  className?: string;
  showLabels?: boolean;
  compact?: boolean;
}

type ExportType = 'kp' | 'invoice' | 'factory-csv' | 'factory-xlsx' | 'order-from-kp';
type BusyState = ExportType | null;

/** Приводит элемент корзины к виду items для POST /api/export/fast (как в ЛК исполнителя). */
function cartToExportItems(cart: CartItem[]): Record<string, unknown>[] {
  return cart.map((item: any) => ({
    id: item.id || item.productId,
    productId: item.productId || item.id,
    name: item.name || item.productName || item.model,
    model: item.model || item.productName || item.name,
    model_name: item.model_name,
    qty: item.qty ?? item.quantity ?? 1,
    quantity: item.qty ?? item.quantity ?? 1,
    unitPrice: item.unitPrice ?? item.price ?? item.basePrice ?? 0,
    price: item.unitPrice ?? item.price ?? item.basePrice ?? 0,
    width: item.width,
    height: item.height,
    color: item.color,
    finish: item.finish,
    style: item.style,
    type: item.type ?? item.itemType,
    itemType: item.itemType ?? item.type,
    sku_1c: item.sku_1c,
    handleId: item.handleId,
    handleName: item.handleName,
    limiterId: item.limiterId,
    limiterName: item.limiterName,
    hardwareKitId: item.hardwareKitId,
    hardwareKitName: item.hardwareKitName ?? item.hardware,
    edge: item.edge,
    edgeId: item.edgeId,
    edgeColorName: item.edgeColorName ?? item.edge_color_name,
    glassColor: item.glassColor ?? item.glass_color,
    reversible: item.reversible,
    mirror: item.mirror,
    threshold: item.threshold,
    optionIds: item.optionIds,
    architraveNames: item.architraveNames,
    optionNames: item.optionNames,
  }));
}

export default function ExportButtons({ 
  getCart, 
  acceptedKPId, 
  className = '',
  showLabels = true,
  compact = false
}: ExportButtonsProps) {
  const [busy, setBusy] = useState<BusyState>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async (type: ExportType, options: ExportOptions = {}) => {
    if (busy) return;

    setBusy(type);
    setError(null);

    try {
      const cart = getCart();
      if (!cart?.length) {
        setError('Корзина пуста');
        return;
      }

      const clientId = (cart[0] as any)?.clientId ?? (cart[0] as any)?.client_id ?? null;
      if (!clientId) {
        setError('Выберите клиента');
        return;
      }

      const items = cartToExportItems(cart);
      const totalAmount = cart.reduce((sum: number, item: any) => {
        const qty = item.qty ?? item.quantity ?? 1;
        const price = item.unitPrice ?? item.price ?? item.basePrice ?? item.total / (qty || 1) ?? 0;
        return sum + price * qty;
      }, 0);

      let documentType: 'quote' | 'invoice' | 'order' = 'quote';
      let format: 'pdf' | 'excel' | 'csv' = 'pdf';

      if (type === 'kp') {
        documentType = 'quote';
        format = options.format === 'pdf' ? 'pdf' : 'excel';
      } else if (type === 'invoice') {
        documentType = 'invoice';
        format = options.format === 'pdf' ? 'pdf' : 'excel';
      } else if (type === 'factory-csv' || type === 'factory-xlsx' || type === 'order-from-kp') {
        documentType = 'order';
        format = type === 'factory-csv' ? 'csv' : 'excel';
      }

      // Тот же API, что в окне заказа ЛК исполнителя: POST /api/export/fast с авторизацией
      const response = await fetchWithAuth('/api/export/fast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: documentType,
          format,
          clientId,
          items,
          totalAmount,
          parentDocumentId: acceptedKPId || null,
          cartSessionId: null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Ошибка экспорта' }));
        setError(errorData.error || 'Ошибка экспорта');
        return;
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition?.match(/filename="?(.+)"?/)?.[1]?.trim() ||
        `export.${format === 'pdf' ? 'pdf' : format === 'excel' ? 'xlsx' : 'csv'}`;
      const url = URL.createObjectURL(blob);

      if (options.openInNewTab) {
        window.open(url, '_blank');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }

      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Неизвестная ошибка');
    } finally {
      setBusy(null);
    }
  };

  const isDisabled = busy !== null;
  const buttonClass = compact 
    ? "px-2 py-1 text-xs border border-black text-black hover:bg-black hover:text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
    : "px-3 py-2 text-sm border border-black text-black hover:bg-black hover:text-white transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed";

  const getButtonText = (type: ExportType, busy: BusyState) => {
    if (busy === type) {
      switch (type) {
        case 'kp': return 'Готовим КП…';
        case 'invoice': return 'Готовим счет…';
        case 'factory-csv': return 'Готовим CSV…';
        case 'factory-xlsx': return 'Готовим XLSX…';
        case 'order-from-kp': return 'Экспорт заказа…';
        default: return 'Обработка…';
      }
    }

    if (compact) {
      switch (type) {
        case 'kp': return 'КП';
        case 'invoice': return 'Счет';
        case 'factory-csv': return 'CSV';
        case 'factory-xlsx': return 'XLSX';
        case 'order-from-kp': return 'Заказ';
        default: return type;
      }
    }

    switch (type) {
      case 'kp': return 'КП';
      case 'invoice': return 'Счет';
      case 'factory-csv': return 'Заказ (CSV)';
      case 'factory-xlsx': return 'Заказ (XLSX)';
      case 'order-from-kp': return 'Заказ на фабрику';
      default: return type;
    }
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {error && (
        <div className="w-full p-2 bg-red-50 border border-red-200 text-red-700 text-sm rounded">
          {error}
        </div>
      )}
      
      <button
        onClick={() => handleExport('kp', { format: 'html', openInNewTab: true })}
        disabled={isDisabled}
        className={buttonClass}
        title="Создать коммерческое предложение"
      >
        {getButtonText('kp', busy)}
      </button>

      <button
        onClick={() => handleExport('invoice', { format: 'html', openInNewTab: true })}
        disabled={isDisabled}
        className={buttonClass}
        title="Создать счет"
      >
        {getButtonText('invoice', busy)}
      </button>

      <button
        onClick={() => handleExport('factory-csv', { format: 'csv' })}
        disabled={isDisabled}
        className={buttonClass}
        title="Экспорт заказа на фабрику в формате CSV"
      >
        {getButtonText('factory-csv', busy)}
      </button>

      <button
        onClick={() => handleExport('factory-xlsx', { format: 'xlsx' })}
        disabled={isDisabled}
        className={buttonClass}
        title="Экспорт заказа на фабрику в формате XLSX"
      >
        {getButtonText('factory-xlsx', busy)}
      </button>

      {acceptedKPId && (
        <button
          onClick={() => handleExport('order-from-kp', { format: 'xlsx' })}
          disabled={isDisabled}
          className={`${buttonClass} bg-yellow-50 hover:bg-yellow-100`}
          title="Экспорт заказа на фабрику из принятого КП"
        >
          {getButtonText('order-from-kp', busy)}
        </button>
      )}
    </div>
  );
}
