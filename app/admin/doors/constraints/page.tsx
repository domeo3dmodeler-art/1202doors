// app/admin/doors/constraints/page.tsx
// Страница управления ограничениями совместимости опций

"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { clientLogger } from '@/lib/logging/client-logger';

type Constraint = {
  id: string;
  name: string;
  description: string;
  type: 'incompatible' | 'required' | 'exclusive';
  options: string[];
  series?: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type Option = {
  id: string;
  name: string;
  type: string;
};

type Series = {
  id: string;
  name: string;
};

export default function ConstraintsManagementPage() {
  const [constraints, setConstraints] = useState<Constraint[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Заглушки для демонстрации
      const mockOptions: Option[] = [
        { id: 'opt-1', name: 'Комплект фурнитуры Premium', type: 'hardware' },
        { id: 'opt-2', name: 'Матовое покрытие', type: 'finish' },
        { id: 'opt-3', name: 'Глянцевое покрытие', type: 'finish' },
        { id: 'opt-4', name: 'Ширина 800мм', type: 'size' },
        { id: 'opt-5', name: 'Ширина 900мм', type: 'size' },
        { id: 'opt-6', name: 'Белый цвет', type: 'color' },
        { id: 'opt-7', name: 'Черный цвет', type: 'color' }
      ];

      const mockSeries: Series[] = [
        { id: 'series-1', name: 'Premium' },
        { id: 'series-2', name: 'Standard' },
        { id: 'series-3', name: 'Economy' }
      ];

      const mockConstraints: Constraint[] = [
        {
          id: 'constraint-1',
          name: 'Несовместимость покрытий',
          description: 'Матовое и глянцевое покрытие не могут быть выбраны одновременно',
          type: 'incompatible',
          options: ['opt-2', 'opt-3'],
          isActive: true,
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-15T10:00:00Z'
        },
        {
          id: 'constraint-2',
          name: 'Обязательная фурнитура для Premium',
          description: 'Для серии Premium обязательно выбирать комплект фурнитуры Premium',
          type: 'required',
          options: ['opt-1'],
          series: ['series-1'],
          isActive: true,
          createdAt: '2025-01-02T00:00:00Z',
          updatedAt: '2025-01-14T15:30:00Z'
        },
        {
          id: 'constraint-3',
          name: 'Исключающие размеры',
          description: 'Ширина 800мм и 900мм взаимоисключающие',
          type: 'exclusive',
          options: ['opt-4', 'opt-5'],
          isActive: true,
          createdAt: '2025-01-03T00:00:00Z',
          updatedAt: '2025-01-13T12:00:00Z'
        },
        {
          id: 'constraint-4',
          name: 'Цветовые ограничения',
          description: 'Белый и черный цвета несовместимы',
          type: 'incompatible',
          options: ['opt-6', 'opt-7'],
          isActive: false,
          createdAt: '2025-01-04T00:00:00Z',
          updatedAt: '2025-01-12T09:00:00Z'
        }
      ];

      setOptions(mockOptions);
      setSeries(mockSeries);
      setConstraints(mockConstraints);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (constraintId: string) => {
    if (!confirm('Вы уверены, что хотите удалить это ограничение?')) return;

    try {
      clientLogger.debug('Deleting constraint:', { constraintId });
      setConstraints(prev => prev.filter(c => c.id !== constraintId));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleStatus = async (constraintId: string) => {
    try {
      clientLogger.debug('Toggling constraint status:', { constraintId });
      setConstraints(prev => prev.map(c => 
        c.id === constraintId ? { ...c, isActive: !c.isActive } : c
      ));
    } catch (err: any) {
      setError(err.message);
    }
  };

  const getTypeLabel = (type: string) => {
    const labels = {
      incompatible: 'Несовместимость',
      required: 'Обязательность',
      exclusive: 'Исключение'
    };
    return labels[type as keyof typeof labels] || type;
  };

  const getTypeColor = (type: string) => {
    const colors = {
      incompatible: 'bg-red-100 text-red-800',
      required: 'bg-green-100 text-green-800',
      exclusive: 'bg-yellow-100 text-yellow-800'
    };
    return colors[type as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getTypeIcon = (type: string) => {
    const icons = {
      incompatible: '🚫',
      required: '✅',
      exclusive: '⚡'
    };
    return icons[type as keyof typeof icons] || '❓';
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

  const getOptionName = (optionId: string) => {
    return options.find(o => o.id === optionId)?.name || optionId;
  };

  const getSeriesName = (seriesId: string) => {
    return series.find(s => s.id === seriesId)?.name || seriesId;
  };

  const filteredConstraints = constraints.filter(constraint => {
    return filterType === 'all' || constraint.type === filterType;
  });

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-lg text-gray-600">Загрузка ограничений...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Заголовок и действия */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ограничения совместимости</h1>
          <p className="text-gray-600 mt-1">Правила совместимости опций между собой</p>
        </div>
        
        <div className="flex space-x-4">
          <Link
            href="/admin/doors/constraints/new"
            className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
          >
            Добавить ограничение
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Тип ограничения</label>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Все типы</option>
              <option value="incompatible">Несовместимость</option>
              <option value="required">Обязательность</option>
              <option value="exclusive">Исключение</option>
            </select>
          </div>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Всего ограничений</p>
              <p className="text-2xl font-semibold text-gray-900">{constraints.length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-red-100 rounded-lg">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728L18.364 5.636M5.636 18.364l12.728-12.728" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Несовместимости</p>
              <p className="text-2xl font-semibold text-gray-900">{constraints.filter(c => c.type === 'incompatible').length}</p>
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
              <p className="text-sm font-medium text-gray-600">Обязательные</p>
              <p className="text-2xl font-semibold text-gray-900">{constraints.filter(c => c.type === 'required').length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center">
            <div className="p-2 bg-blue-100 rounded-lg">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-600">Исключающие</p>
              <p className="text-2xl font-semibold text-gray-900">{constraints.filter(c => c.type === 'exclusive').length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Список ограничений */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Список ограничений</h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ограничение
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Тип
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Опции
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Серии
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
              {filteredConstraints.map((constraint) => (
                <tr key={constraint.id} className={!constraint.isActive ? 'opacity-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{constraint.name}</div>
                      <div className="text-sm text-gray-500">{constraint.description}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ${getTypeColor(constraint.type)}`}>
                      <span className="mr-1">{getTypeIcon(constraint.type)}</span>
                      {getTypeLabel(constraint.type)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1">
                      {constraint.options.map(optionId => (
                        <span
                          key={optionId}
                          className="inline-flex px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full"
                        >
                          {getOptionName(optionId)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {constraint.series && constraint.series.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {constraint.series.map(seriesId => (
                          <span
                            key={seriesId}
                            className="inline-flex px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full"
                          >
                            {getSeriesName(seriesId)}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-500">Все серии</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      constraint.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {constraint.isActive ? 'Активно' : 'Неактивно'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(constraint.updatedAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                    <Link
                      href={`/admin/doors/constraints/${constraint.id}/edit`}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      Редактировать
                    </Link>
                    <button
                      onClick={() => handleToggleStatus(constraint.id)}
                      className={`${
                        constraint.isActive 
                          ? 'text-red-600 hover:text-red-900' 
                          : 'text-green-600 hover:text-green-900'
                      }`}
                    >
                      {constraint.isActive ? 'Деактивировать' : 'Активировать'}
                    </button>
                    <button
                      onClick={() => handleDelete(constraint.id)}
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

        {filteredConstraints.length === 0 && (
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">Нет ограничений</h3>
            <p className="mt-1 text-sm text-gray-500">Начните с добавления нового ограничения.</p>
            <div className="mt-6">
              <Link
                href="/admin/doors/constraints/new"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-yellow-600 hover:bg-yellow-700"
              >
                Добавить ограничение
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
