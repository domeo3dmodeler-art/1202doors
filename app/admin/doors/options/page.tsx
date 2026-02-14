// app/admin/doors/options/page.tsx
// Страница управления опциями дверей

"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { clientLogger } from '@/lib/logging/client-logger';

type Option = {
  id: string;
  name: string;
  type: 'hardware' | 'finish' | 'size' | 'color' | 'other';
  description?: string;
  price?: number;
  currency: string;
  availableForSeries: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type Series = {
  id: string;
  name: string;
};

export default function OptionsManagementPage() {
  const [options, setOptions] = useState<Option[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSeries, setFilterSeries] = useState<string>('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Заглушки для демонстрации
      const mockSeries: Series[] = [
        { id: 'series-1', name: 'Premium' },
        { id: 'series-2', name: 'Standard' },
        { id: 'series-3', name: 'Economy' }
      ];

      const mockOptions: Option[] = [
        {
          id: 'opt-1',
          name: 'Комплект фурнитуры Premium',
          type: 'hardware',
          description: 'Премиум комплект фурнитуры с доводчиком',
          price: 3000,
          currency: 'RUB',
          availableForSeries: ['series-1', 'series-2'],
          isActive: true,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-15T10:00:00Z'
        },
        {
          id: 'opt-2',
          name: 'Матовое покрытие',
          type: 'finish',
          description: 'Матовое покрытие для дверей',
          price: 500,
          currency: 'RUB',
          availableForSeries: ['series-1', 'series-2', 'series-3'],
          isActive: true,
          createdAt: '2025-01-02T00:00:00Z',
          updatedAt: '2025-01-14T15:30:00Z'
        },
        {
          id: 'opt-3',
          name: 'Ширина 800мм',
          type: 'size',
          description: 'Стандартная ширина двери',
          price: 0,
          currency: 'RUB',
          availableForSeries: ['series-1', 'series-2', 'series-3'],
          isActive: true,
          createdAt: '2025-01-03T00:00:00Z',
          updatedAt: '2025-01-13T12:00:00Z'
        },
        {
          id: 'opt-4',
          name: 'Белый цвет',
          type: 'color',
          description: 'Классический белый цвет',
          price: 0,
          currency: 'RUB',
          availableForSeries: ['series-1', 'series-2'],
          isActive: false,
          createdAt: '2025-01-04T00:00:00Z',
          updatedAt: '2025-01-12T09:00:00Z'
        }
      ];

      setSeries(mockSeries);
      setOptions(mockOptions);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (optionId: string) => {
    if (!confirm('Вы уверены, что хотите удалить эту опцию?')) return;

    try {
      clientLogger.debug('Deleting option:', { optionId });
      setOptions(prev => prev.filter(o => o.id !== optionId));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleStatus = async (optionId: string) => {
    try {
      clientLogger.debug('Toggling option status:', { optionId });
      setOptions(prev => prev.map(o => 
        o.id === optionId ? { ...o, isActive: !o.isActive } : o
      ));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getTypeLabel = (type: string) => {
    const labels = {
      hardware: 'Фурнитура',
      finish: 'Отделка',
      size: 'Размер',
      color: 'Цвет',
      other: 'Другое'
    };
    return labels[type as keyof typeof labels] || type;
  };

  const getTypeColor = (type: string) => {
    const colors = {
      hardware: 'bg-blue-100 text-blue-800',
      finish: 'bg-green-100 text-green-800',
      size: 'bg-yellow-100 text-yellow-800',
      color: 'bg-purple-100 text-purple-800',
      other: 'bg-gray-100 text-gray-800'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
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
    if (amount === 0) return 'Бесплатно';
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: currency === 'RUB' ? 'RUB' : 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const filteredOptions = options.filter(option => {
    const typeMatch = filterType === 'all' || option.type === filterType;
    const seriesMatch = filterSeries === 'all' || option.availableForSeries.includes(filterSeries);
    return typeMatch && seriesMatch;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg text-gray-600">Загрузка опций...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Заголовок и действия */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Управление опциями</h1>
          <p className="text-gray-600 mt-1">Фурнитура, размеры, отделка и другие опции</p>
        </div>
        
        <div className="flex space-x-4">
          <Link
            href="/admin/doors/options/new"
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Добавить опцию
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

      {/* Фильтры */}
      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <div className="flex flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Тип опции</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Все типы</option>
              <option value="hardware">Фурнитура</option>
              <option value="finish">Отделка</option>
              <option value="size">Размер</option>
              <option value="color">Цвет</option>
              <option value="other">Другое</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Серия</label>
            <select
              value={filterSeries}
              onChange={(e) => setFilterSeries(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Все серии</option>
              {series.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-green-100 rounded-lg">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Всего опций</p>
              <p className="text-2xl font-semibold text-gray-900">{options.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Активных</p>
              <p className="text-2xl font-semibold text-gray-900">{options.filter(o => o.isActive).length}</p>
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
              <p className="text-sm font-medium text-gray-600">Платных</p>
              <p className="text-2xl font-semibold text-gray-900">{options.filter(o => (o.price || 0) > 0).length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-purple-100 rounded-lg">
              <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Типов</p>
              <p className="text-2xl font-semibold text-gray-900">{new Set(options.map(o => o.type)).size}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Список опций */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Список опций</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Название
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Тип
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Цена
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Доступно для серий
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
              {filteredOptions.map((option) => (
                <tr key={option.id} className={!option.isActive ? 'opacity-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{option.name}</div>
                      {option.description && (
                        <div className="text-sm text-gray-500">{option.description}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTypeColor(option.type)}`}>
                      {getTypeLabel(option.type)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatCurrency(option.price || 0, option.currency)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      {option.availableForSeries.map(seriesId => {
                        const seriesName = series.find(s => s.id === seriesId)?.name || seriesId;
                        return (
                          <span
                            key={seriesId}
                            className="inline-flex px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full"
                          >
                            {seriesName}
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      option.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {option.isActive ? 'Активна' : 'Неактивна'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(option.updatedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <Link
                      href={`/admin/doors/options/${option.id}/edit`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Редактировать
                    </Link>
                    <button
                      onClick={() => handleToggleStatus(option.id)}
                      className={`${
                        option.isActive 
                          ? 'text-red-600 hover:text-red-900' 
                          : 'text-green-600 hover:text-green-900'
                      }`}
                    >
                      {option.isActive ? 'Деактивировать' : 'Активировать'}
                    </button>
                    <button
                      onClick={() => handleDelete(option.id)}
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

        {filteredOptions.length === 0 && (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Нет опций</h3>
            <p className="mt-1 text-sm text-gray-500">Начните с добавления новой опции.</p>
            <div className="mt-6">
              <Link
                href="/admin/doors/options/new"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
              >
                Добавить опцию
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
