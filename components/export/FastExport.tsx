"use client";

import React, { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { clientLogger } from '@/lib/logging/client-logger';
import { fetchWithAuth } from '@/lib/utils/fetch-with-auth';

interface FastExportProps {
  cartItems: any[];
  totalAmount: number;
  selectedClient: string;
  onExportComplete?: (filename: string) => void;
}

export function FastExport({ 
  cartItems, 
  totalAmount, 
  selectedClient, 
  onExportComplete 
}: FastExportProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [currentFormat, setCurrentFormat] = useState<string>('');

  const exportDocument = async (type: 'quote' | 'invoice' | 'order', format: 'pdf' | 'excel' | 'csv') => {
    if (!selectedClient) {
      alert('Выберите клиента');
      return;
    }

    setIsExporting(true);
    setCurrentFormat(format);
    setExportProgress(0);

    try {
      // Симуляция прогресса
      const progressInterval = setInterval(() => {
        setExportProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.random() * 20;
        });
      }, 200);

      const response = await fetchWithAuth('/api/export/fast', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type,
          format,
          clientId: selectedClient,
          items: cartItems,
          totalAmount
        })
      });

      if (!response.ok) {
        throw new Error('Ошибка экспорта');
      }

      // Получаем файл
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      
      // Получаем имя файла из заголовков
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition 
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
        : `${type}.${format}`;

      // Скачиваем файл
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setExportProgress(100);
      
      if (onExportComplete) {
        onExportComplete(filename);
      }

      // Показываем успех
      setTimeout(() => {
        setIsExporting(false);
        setExportProgress(0);
        setCurrentFormat('');
      }, 1000);

    } catch (error) {
      clientLogger.error('Export error:', error);
      alert('Ошибка при экспорте документа');
      setIsExporting(false);
      setExportProgress(0);
      setCurrentFormat('');
    }
  };

  const exportButtons = [
    { type: 'quote' as const, format: 'pdf' as const, label: 'КП (PDF)', icon: '📄' },
    { type: 'quote' as const, format: 'excel' as const, label: 'КП (Excel)', icon: '📊' },
    { type: 'invoice' as const, format: 'pdf' as const, label: 'Счет (PDF)', icon: '📄' },
    { type: 'invoice' as const, format: 'excel' as const, label: 'Счет (Excel)', icon: '📊' },
    { type: 'order' as const, format: 'pdf' as const, label: 'Заказ (PDF)', icon: '📄' },
    { type: 'order' as const, format: 'excel' as const, label: 'Заказ (Excel)', icon: '📊' },
    { type: 'quote' as const, format: 'csv' as const, label: 'КП (CSV)', icon: '📋' },
  ];

  return (
    <Card className="p-4">
      <h3 className="text-lg font-semibold mb-4">Быстрый экспорт</h3>
      
      {isExporting && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">
              Экспорт {currentFormat.toUpperCase()}...
            </span>
            <span className="text-sm text-gray-600">
              {Math.round(exportProgress)}%
            </span>
          </div>
          <Progress value={exportProgress} className="w-full" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {exportButtons.map((button, index) => (
          <Button
            key={index}
            variant="outline"
            size="sm"
            onClick={() => exportDocument(button.type, button.format)}
            disabled={isExporting || !selectedClient}
            className="flex items-center justify-center space-x-2 h-auto py-3"
          >
            <span className="text-lg">{button.icon}</span>
            <span className="text-xs">{button.label}</span>
          </Button>
        ))}
      </div>

      {!selectedClient && (
        <p className="text-sm text-red-600 mt-2">
          ⚠️ Выберите клиента для экспорта
        </p>
      )}

      <div className="mt-4 text-xs text-gray-500">
        <p>⚡ Оптимизированный экспорт - быстрее в 3-5 раз</p>
        <p>📦 Пакетная обработка данных</p>
        <p>🔄 Кэширование ресурсов</p>
      </div>
    </Card>
  );
}
