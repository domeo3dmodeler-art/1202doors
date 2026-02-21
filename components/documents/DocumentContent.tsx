'use client';

import { useState } from 'react';
import { Eye, Download, FileText, ExternalLink } from 'lucide-react';
import { clientLogger } from '@/lib/logging/client-logger';
import { fetchWithAuth } from '@/lib/utils/fetch-with-auth';

interface DocumentContentProps {
  document: any;
}

export function DocumentContent({ document }: DocumentContentProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleDownload = async (format: 'pdf' | 'excel' | 'csv') => {
    setIsLoading(true);
    try {
      const response = await fetchWithAuth(`/api/documents/${document.id}/export?format=${format}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Ошибка при экспорте документа');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${document.number}.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      clientLogger.error('Ошибка при скачивании:', error);
      alert('Ошибка при скачивании документа');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePreview = () => {
    // Открываем PDF в новом окне
    window.open(`/api/documents/${document.id}/preview`, '_blank');
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Содержимое документа</h2>
        <div className="flex items-center space-x-2">
          <button
            onClick={handlePreview}
            className="flex items-center space-x-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-md transition-colors"
          >
            <Eye className="w-4 h-4" />
            <span>Предпросмотр</span>
          </button>
        </div>
      </div>

      {/* Информация о документе */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Номер документа:</span>
            <span className="text-sm font-medium">{document.number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Дата создания:</span>
            <span className="text-sm font-medium">
              {new Date(document.created_at || document.createdAt).toLocaleDateString('ru-RU')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Статус:</span>
            <span className="text-sm font-medium">{document.status}</span>
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-sm text-gray-500">Общая сумма:</span>
            <span className="text-sm font-medium">
              {document.totalAmount?.toLocaleString('ru-RU')} ₽
            </span>
          </div>
          {document.subtotal && document.subtotal !== document.totalAmount && (
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Без НДС:</span>
              <span className="text-sm font-medium">
                {document.subtotal.toLocaleString('ru-RU')} ₽
              </span>
            </div>
          )}
          {document.dueDate && (
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Срок оплаты:</span>
              <span className="text-sm font-medium">
                {new Date(document.dueDate).toLocaleDateString('ru-RU')}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Действия с документом */}
      <div className="border-t border-gray-200 pt-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Экспорт документа</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleDownload('pdf')}
            disabled={isLoading}
            className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <FileText className="w-4 h-4" />
            <span>PDF</span>
          </button>
          <button
            onClick={() => handleDownload('excel')}
            disabled={isLoading}
            className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>Excel</span>
          </button>
          <button
            onClick={() => handleDownload('csv')}
            disabled={isLoading}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Примечания */}
      {document.notes && (
        <div className="border-t border-gray-200 pt-4 mt-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">Примечания</h3>
          <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-md">
            {document.notes}
          </p>
        </div>
      )}
    </div>
  );
}
