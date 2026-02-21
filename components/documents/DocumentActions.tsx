'use client';

import { useState } from 'react';
import { Settings, Download, Share, Edit, Archive, Trash2, Send, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirmDialog } from '@/components/ui/ConfirmDialog';
import { clientLogger } from '@/lib/logging/client-logger';
import { fetchWithAuth } from '@/lib/utils/fetch-with-auth';

interface DocumentActionsProps {
  document: {
    id: string;
    status: string;
    [key: string]: unknown;
  };
}

export function DocumentActions({ document }: DocumentActionsProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState<'pdf' | 'excel' | null>(null);
  const { showConfirm, ConfirmDialogComponent } = useConfirmDialog();

  const handleDownloadExport = async (format: 'pdf' | 'excel') => {
    setDownloadBusy(format);
    try {
      const response = await fetchWithAuth(`/api/documents/${document.id}/export?format=${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Ошибка при экспорте документа');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      const disposition = response.headers.get('Content-Disposition');
      const filenameMatch = disposition?.match(/filename="?([^";\n]+)"?/);
      link.download = filenameMatch?.[1] ?? `${String((document as any).number ?? document.id)}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      window.document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(link);
    } catch (e) {
      clientLogger.error('Ошибка при скачивании', e);
      toast.error('Ошибка при скачивании документа');
    } finally {
      setDownloadBusy(null);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/documents/${document.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Ошибка при изменении статуса');
      }

      // Обновляем страницу для отображения нового статуса
      window.location.reload();
    } catch (error) {
      clientLogger.error('Ошибка при изменении статуса:', error);
      alert('Ошибка при изменении статуса');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendToClient = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/documents/${document.id}/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error('Ошибка при отправке клиенту');
      }

      alert('Документ отправлен клиенту');
    } catch (error) {
      clientLogger.error('Ошибка при отправке:', error);
      alert('Ошибка при отправке документа');
    } finally {
      setIsLoading(false);
    }
  };

  const getAvailableActions = () => {
    const actions = [];

    // Действия в зависимости от типа документа и статуса
    if (document.type === 'quote') {
      if (document.status === 'DRAFT') {
        actions.push({
          id: 'send',
          label: 'Отправить клиенту',
          icon: Send,
          color: 'bg-blue-600 hover:bg-blue-700',
          onClick: () => handleStatusChange('SENT')
        });
        actions.push({
          id: 'accept',
          label: 'Принять',
          icon: CheckCircle,
          color: 'bg-green-600 hover:bg-green-700',
          onClick: () => handleStatusChange('ACCEPTED')
        });
      } else if (document.status === 'SENT') {
        actions.push({
          id: 'accept',
          label: 'Принять',
          icon: CheckCircle,
          color: 'bg-green-600 hover:bg-green-700',
          onClick: () => handleStatusChange('ACCEPTED')
        });
        actions.push({
          id: 'reject',
          label: 'Отклонить',
          icon: XCircle,
          color: 'bg-red-600 hover:bg-red-700',
          onClick: () => handleStatusChange('REJECTED')
        });
      }
    } else if (document.type === 'invoice') {
      if (document.status === 'DRAFT') {
        actions.push({
          id: 'send',
          label: 'Отправить клиенту',
          icon: Send,
          color: 'bg-blue-600 hover:bg-blue-700',
          onClick: () => handleStatusChange('SENT')
        });
      } else if (document.status === 'SENT') {
        actions.push({
          id: 'paid',
          label: 'Отметить как оплаченный',
          icon: CheckCircle,
          color: 'bg-green-600 hover:bg-green-700',
          onClick: () => handleStatusChange('PAID')
        });
        actions.push({
          id: 'cancel',
          label: 'Отменить',
          icon: XCircle,
          color: 'bg-red-600 hover:bg-red-700',
          onClick: () => handleStatusChange('CANCELLED')
        });
      }
    }

    return actions;
  };

  const availableActions = getAvailableActions();

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center space-x-2 mb-4">
        <Settings className="w-5 h-5 text-gray-600" />
        <h2 className="text-lg font-semibold text-gray-900">Действия</h2>
      </div>

      <div className="space-y-3">
        {/* Основные действия */}
        {availableActions.map((action) => (
          <button
            key={action.id}
            onClick={action.onClick}
            disabled={isLoading}
            className={`w-full flex items-center space-x-3 px-4 py-3 text-white text-sm font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${action.color}`}
          >
            <action.icon className="w-4 h-4" />
            <span>{action.label}</span>
          </button>
        ))}

        {/* Разделитель */}
        {availableActions.length > 0 && (
          <div className="border-t border-gray-200 my-4"></div>
        )}

        {/* Дополнительные действия */}
        <div className="space-y-2">
          <button
            onClick={() => handleDownloadExport('pdf')}
            disabled={downloadBusy !== null}
            className="w-full flex items-center space-x-3 px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{downloadBusy === 'pdf' ? 'Загрузка…' : 'Скачать PDF'}</span>
          </button>

          <button
            onClick={() => handleDownloadExport('excel')}
            disabled={downloadBusy !== null}
            className="w-full flex items-center space-x-3 px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{downloadBusy === 'excel' ? 'Загрузка…' : 'Скачать Excel'}</span>
          </button>

          <button
            onClick={() => {
              const url = window.location.href;
              navigator.clipboard.writeText(url);
              alert('Ссылка скопирована в буфер обмена');
            }}
            className="w-full flex items-center space-x-3 px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            <Share className="w-4 h-4" />
            <span>Поделиться ссылкой</span>
          </button>

          <button
            onClick={() => {
              // Редактирование документа будет реализовано позже
              alert('Функция редактирования в разработке');
            }}
            className="w-full flex items-center space-x-3 px-4 py-2 text-gray-700 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors"
          >
            <Edit className="w-4 h-4" />
            <span>Редактировать</span>
          </button>
        </div>

        {/* Опасные действия */}
        <div className="border-t border-gray-200 pt-4 mt-4">
          <div className="space-y-2">
            <button
              onClick={() => {
                showConfirm(
                  'Архивирование документа',
                  'Вы уверены, что хотите архивировать этот документ?',
                  () => {
                    // Архивирование документа будет реализовано позже
                    toast.info('Функция архивирования в разработке');
                  },
                  {
                    confirmText: 'Архивировать',
                    cancelText: 'Отмена',
                    type: 'warning'
                  }
                );
              }}
              className="w-full flex items-center space-x-3 px-4 py-2 text-orange-700 hover:text-orange-900 hover:bg-orange-50 rounded-md transition-colors"
            >
              <Archive className="w-4 h-4" />
              <span>Архивировать</span>
            </button>

            <button
              onClick={() => {
                showConfirm(
                  'Удаление документа',
                  'Вы уверены, что хотите удалить этот документ? Это действие нельзя отменить.',
                  () => {
                    // Удаление документа будет реализовано позже
                    toast.info('Функция удаления в разработке');
                  },
                  {
                    confirmText: 'Удалить',
                    cancelText: 'Отмена',
                    type: 'danger'
                  }
                );
              }}
              className="w-full flex items-center space-x-3 px-4 py-2 text-red-700 hover:text-red-900 hover:bg-red-50 rounded-md transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Удалить</span>
            </button>
          </div>
        </div>
      </div>
      <ConfirmDialogComponent />
    </div>
  );
}
