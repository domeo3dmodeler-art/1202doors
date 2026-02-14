// app/admin/doors/templates/page.tsx
// Страница управления шаблонами КП

"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { clientLogger } from '@/lib/logging/client-logger';

type Template = {
  id: string;
  name: string;
  description: string;
  header: {
    title: string;
    logo?: string;
    companyName: string;
    companyAddress: string;
    companyPhone: string;
    companyEmail: string;
  };
  footer: {
    text: string;
    signature?: string;
  };
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export default function TemplatesManagementPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewingTemplate, setPreviewingTemplate] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      setError(null);

      // Заглушки для демонстрации
      const mockTemplates: Template[] = [
        {
          id: 'template-1',
          name: 'Стандартный шаблон',
          description: 'Базовый шаблон для коммерческих предложений',
          header: {
            title: 'Коммерческое предложение',
            companyName: 'ООО "Домео"',
            companyAddress: 'г. Москва, ул. Примерная, д. 1',
            companyPhone: '+7 (495) 123-45-67',
            companyEmail: 'info@domeo.ru'
          },
          footer: {
            text: 'Спасибо за ваш интерес к нашим услугам!',
            signature: 'С уважением, команда Домео'
          },
          isDefault: true,
          isActive: true,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-15T10:00:00Z'
        },
        {
          id: 'template-2',
          name: 'Премиум шаблон',
          description: 'Шаблон для VIP клиентов с расширенным дизайном',
          header: {
            title: 'Эксклюзивное предложение',
            companyName: 'ООО "Домео Премиум"',
            companyAddress: 'г. Москва, ул. Премиум, д. 10',
            companyPhone: '+7 (495) 987-65-43',
            companyEmail: 'premium@domeo.ru'
          },
          footer: {
            text: 'Мы ценим ваше доверие и готовы предложить лучшие условия!',
            signature: 'Ваш персональный менеджер'
          },
          isDefault: false,
          isActive: true,
          createdAt: '2025-01-02T00:00:00Z',
          updatedAt: '2025-01-14T15:30:00Z'
        },
        {
          id: 'template-3',
          name: 'Эконом шаблон',
          description: 'Упрощенный шаблон для бюджетных предложений',
          header: {
            title: 'Предложение',
            companyName: 'Домео',
            companyAddress: 'г. Москва',
            companyPhone: '+7 (495) 111-22-33',
            companyEmail: 'sales@domeo.ru'
          },
          footer: {
            text: 'Спасибо за выбор!'
          },
          isDefault: false,
          isActive: false,
          createdAt: '2025-01-03T00:00:00Z',
          updatedAt: '2025-01-13T12:00:00Z'
        }
      ];

      setTemplates(mockTemplates);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePreview = async (templateId: string) => {
    try {
      setPreviewLoading(true);
      setPreviewingTemplate(templateId);

      // Здесь должен быть API вызов для генерации предпросмотра PDF
      clientLogger.debug('Generating preview for template:', { templateId });
      
      // Заглушка - открываем новую вкладку с примером PDF
      const previewUrl = `/api/quotes/preview?templateId=${templateId}`;
      window.open(previewUrl, '_blank');
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setPreviewLoading(false);
      setPreviewingTemplate(null);
    }
  };

  const handleSetDefault = async (templateId: string) => {
    try {
      clientLogger.debug('Setting default template:', { templateId });
      
      setTemplates(prev => prev.map(t => ({
        ...t,
        isDefault: t.id === templateId
      })));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleStatus = async (templateId: string) => {
    try {
      clientLogger.debug('Toggling template status:', { templateId });
      
      setTemplates(prev => prev.map(t => 
        t.id === templateId ? { ...t, isActive: !t.isActive } : t
      ));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDelete = async (templateId: string) => {
    if (!confirm('Вы уверены, что хотите удалить этот шаблон?')) return;

    try {
      clientLogger.debug('Deleting template:', { templateId });
      setTemplates(prev => prev.filter(t => t.id !== templateId));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg text-gray-600">Загрузка шаблонов...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Заголовок и действия */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Шаблоны КП</h1>
          <p className="text-gray-600 mt-1">Настройка шаблонов и предпросмотр PDF</p>
        </div>
        
        <div className="flex space-x-4">
          <Link
            href="/admin/doors/templates/new"
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
          >
            Создать шаблон
          </Link>
          <Link
            href="/admin/doors"
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Назад к админке
          </Link>
        </div>
      </div>

      {/* Ошибка */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-800">{error}</div>
        </div>
      )}

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Всего шаблонов</p>
              <p className="text-2xl font-semibold text-gray-900">{templates.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Активных</p>
              <p className="text-2xl font-semibold text-gray-900">{templates.filter(t => t.isActive).length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">По умолчанию</p>
              <p className="text-2xl font-semibold text-gray-900">{templates.filter(t => t.isDefault).length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Список шаблонов */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {templates.map((template) => (
          <div key={template.id} className={`bg-white rounded-lg shadow-md overflow-hidden ${!template.isActive ? 'opacity-50' : ''}`}>
            {/* Заголовок карточки */}
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{template.name}</h3>
                  <p className="text-sm text-gray-500">{template.description}</p>
                </div>
                <div className="flex space-x-2">
                  {template.isDefault && (
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800">
                      По умолчанию
                    </span>
                  )}
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    template.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {template.isActive ? 'Активен' : 'Неактивен'}
                  </span>
                </div>
              </div>
            </div>

            {/* Содержимое карточки */}
            <div className="px-6 py-4">
              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-medium text-gray-700">Заголовок</h4>
                  <p className="text-sm text-gray-900">{template.header.title}</p>
                </div>
                
                <div>
                  <h4 className="text-sm font-medium text-gray-700">Компания</h4>
                  <p className="text-sm text-gray-900">{template.header.companyName}</p>
                  <p className="text-sm text-gray-500">{template.header.companyAddress}</p>
                  <p className="text-sm text-gray-500">{template.header.companyPhone}</p>
                  <p className="text-sm text-gray-500">{template.header.companyEmail}</p>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-gray-700">Подпись</h4>
                  <p className="text-sm text-gray-900">{template.footer.signature || 'Не указана'}</p>
                </div>

                <div className="text-xs text-gray-500">
                  Обновлено: {formatDate(template.updatedAt)}
                </div>
              </div>
            </div>

            {/* Действия */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <div className="flex space-x-2">
                  <button
                    onClick={() => handlePreview(template.id)}
                    disabled={previewLoading && previewingTemplate === template.id}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {previewLoading && previewingTemplate === template.id ? 'Загрузка...' : 'Предпросмотр PDF'}
                  </button>
                  
                  <Link
                    href={`/admin/doors/templates/${template.id}/edit`}
                    className="px-3 py-1 text-sm border border-gray-300 text-gray-700 rounded hover:bg-gray-50"
                  >
                    Редактировать
                  </Link>
                </div>

                <div className="flex space-x-2">
                  {!template.isDefault && (
                    <button
                      onClick={() => handleSetDefault(template.id)}
                      className="px-3 py-1 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700"
                    >
                      По умолчанию
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleToggleStatus(template.id)}
                    className={`px-3 py-1 text-sm rounded ${
                      template.isActive 
                        ? 'bg-red-600 text-white hover:bg-red-700' 
                        : 'bg-green-600 text-white hover:bg-green-700'
                    }`}
                  >
                    {template.isActive ? 'Деактивировать' : 'Активировать'}
                  </button>
                  
                  <button
                    onClick={() => handleDelete(template.id)}
                    className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    Удалить
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {templates.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-gray-900">Нет шаблонов</h3>
          <p className="mt-1 text-sm text-gray-500">Начните с создания нового шаблона.</p>
          <div className="mt-6">
            <Link
              href="/admin/doors/templates/new"
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-purple-600 hover:bg-purple-700"
            >
              Создать шаблон
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
