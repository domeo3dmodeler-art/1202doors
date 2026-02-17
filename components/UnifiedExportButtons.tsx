'use client';

import React, { useState } from 'react';
import type { CartItem, ExportOptions } from '@/lib/services/export.service';

export interface ExportButtonsProps {
  getCart: () => CartItem[];
  acceptedKPId?: string;
  className?: string;
  showLabels?: boolean;
  compact?: boolean;
}

type ExportType = 'kp' | 'invoice' | 'factory-csv' | 'factory-xlsx' | 'order-from-kp';
type BusyState = ExportType | null;

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
      
      // Определяем тип документа и формат
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
      
      // Вызываем API route
      const response = await fetch('/api/cart/export/enhanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cart: { items: cart },
          documentType,
          format,
          clientId: cart[0]?.clientId || null,
          sourceDocumentId: acceptedKPId || null,
          sourceDocumentType: acceptedKPId ? 'quote' : null
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Ошибка экспорта' }));
        setError(errorData.error || 'Ошибка экспорта');
        return;
      }

      // API возвращает JSON с полем file.buffer (base64)
      const data = await response.json();
      if (!data?.file?.buffer) {
        setError('Некорректный ответ сервера');
        return;
      }
      const binary = atob(data.file.buffer);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: data.file.mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const filename = data.file.filename || `export.${format === 'pdf' ? 'pdf' : format === 'excel' ? 'xlsx' : 'csv'}`;

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
