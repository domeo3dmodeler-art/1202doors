// app/admin/doors/series/page.tsx
// Страница управления сериями дверей

"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { clientLogger } from '@/lib/logging/client-logger';

type Series = {
  id: string;
  name: string;
  description?: string;
  materials: string[];
  basePrice?: number;
  currency: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export default function SeriesManagementPage() {
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingSeries, setEditingSeries] = useState<Series | null>(null);

  useEffect(() => {
    fetchSeries();
  }, []);

  const fetchSeries = async () => {
    try {
      setLoading(true);
      setError(null);

      // Заглушка для демонстрации
      const mockSeries: Series[] = [
        {
          id: 'series-1',
          name: 'Premium',
          description: 'Премиум серия с высоким качеством материалов',
          materials: ['МДФ', 'Массив дуба', 'Шпон'],
          basePrice: 15000,
          currency: 'RUB',
          isActive: true,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-15T10:00:00Z'
        },
        {
          id: 'series-2',
          name: 'Standard',
          description: 'Стандартная серия для массового рынка',
          materials: ['МДФ', 'ЛДСП'],
          basePrice: 8000,
          currency: 'RUB',
          isActive: true,
          createdAt: '2025-01-02T00:00:00Z',
          updatedAt: '2025-01-14T15:30:00Z'
        },
        {
          id: 'series-3',
          name: 'Economy',
          description: 'Экономная серия для бюджетных решений',
          materials: ['ЛДСП', 'ПВХ'],
          basePrice: 5000,
          currency: 'RUB',
          isActive: false,
          createdAt: '2025-01-03T00:00:00Z',
          updatedAt: '2025-01-13T12:00:00Z'
        }
      ];

      setSeries(mockSeries);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (seriesId: string) => {
    if (!confirm('Вы уверены, что хотите удалить эту серию?')) return;

    try {
      // Здесь должен быть API вызов для удаления
      clientLogger.debug('Deleting series:', { seriesId });
      
      setSeries(prev => prev.filter(s => s.id !== seriesId));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleStatus = async (seriesId: string) => {
    try {
      // Здесь должен быть API вызов для изменения статуса
      clientLogger.debug('Toggling series status:', { seriesId });
      
      setSeries(prev => prev.map(s => 
        s.id === seriesId ? { ...s, isActive: !s.isActive } : s
      ));
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

  const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: currency === 'RUB' ? 'RUB' : 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg text-gray-600">Загрузка серий...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Заголовок и действия */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Управление сериями</h1>
          <p className="text-gray-600 mt-1">Создание и редактирование серий дверей</p>
        </div>
        
        <div className="flex space-x-4">
          <Link
            href="/admin/doors/series/new"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Создать серию
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
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Всего серий</p>
              <p className="text-2xl font-semibold text-gray-900">{series.length}</p>
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
              <p className="text-2xl font-semibold text-gray-900">{series.filter(s => s.isActive).length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Средняя цена</p>
              <p className="text-2xl font-semibold text-gray-900">
                {series.length > 0 
                  ? formatCurrency(
                      series.reduce((sum, s) => sum + (s.basePrice || 0), 0) / series.length,
                      'RUB'
                    )
                  : '—'
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Список серий */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Список серий</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Название
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Материалы
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Базовая цена
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Статус
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Обновлено
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Действия
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {series.map((s) => (
                <tr key={s.id} className={!s.isActive ? 'opacity-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{s.name}</div>
                      {s.description && (
                        <div className="text-sm text-gray-500">{s.description}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      {s.materials.map((material, index) => (
                        <span
                          key={index}
                          className="inline-flex px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full"
                        >
                          {material}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {s.basePrice ? formatCurrency(s.basePrice, s.currency) : '—'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      s.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {s.isActive ? 'Активна' : 'Неактивна'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(s.updatedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <Link
                      href={`/admin/doors/series/${s.id}/edit`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Редактировать
                    </Link>
                    <button
                      onClick={() => handleToggleStatus(s.id)}
                      className={`${
                        s.isActive 
                          ? 'text-red-600 hover:text-red-900' 
                          : 'text-green-600 hover:text-green-900'
                      }`}
                    >
                      {s.isActive ? 'Деактивировать' : 'Активировать'}
                    </button>
                    <button
                      onClick={() => handleDelete(s.id)}
                      className="text-red-600 hover:text-red-900"
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {series.length === 0 && (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Нет серий</h3>
            <p className="mt-1 text-sm text-gray-500">Начните с создания новой серии.</p>
            <div className="mt-6">
              <Link
                href="/admin/doors/series/new"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                Создать серию
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
