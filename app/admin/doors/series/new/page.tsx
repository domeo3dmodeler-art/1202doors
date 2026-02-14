// app/admin/doors/series/new/page.tsx
// Страница создания новой серии

"use client";

import { useState } from 'react';
import Link from 'next/link';
import { clientLogger } from '@/lib/logging/client-logger';

type SeriesFormData = {
  name: string;
  description: string;
  materials: string[];
  basePrice: string;
  currency: string;
  isActive: boolean;
};

export default function CreateSeriesPage() {
  const [formData, setFormData] = useState<SeriesFormData>({
    name: '',
    description: '',
    materials: [],
    basePrice: '',
    currency: 'RUB',
    isActive: true
  });
  const [newMaterial, setNewMaterial] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleInputChange = (field: keyof SeriesFormData, value: string | boolean) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAddMaterial = () => {
    if (newMaterial.trim() && !formData.materials.includes(newMaterial.trim())) {
      setFormData(prev => ({
        ...prev,
        materials: [...prev.materials, newMaterial.trim()]
      }));
      setNewMaterial('');
    }
  };

  const handleRemoveMaterial = (material: string) => {
    setFormData(prev => ({
      ...prev,
      materials: prev.materials.filter(m => m !== material)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      setError('Название серии обязательно');
      return;
    }

    if (formData.materials.length === 0) {
      setError('Необходимо указать хотя бы один материал');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Здесь должен быть API вызов для создания серии
      clientLogger.debug('Creating series:', { formData });
      
      // Перенаправляем на страницу списка
      window.location.href = '/admin/doors/series';
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Заголовок */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Создание серии</h1>
          <p className="text-gray-600 mt-1">Добавьте новую серию дверей</p>
        </div>
        
        <Link
          href="/admin/doors/series"
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
        >
          Назад к списку
        </Link>
      </div>

      {/* Ошибка */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-800">{error}</div>
        </div>
      )}

      {/* Форма */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white shadow rounded-lg p-6">
          {/* Основная информация */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Основная информация</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                  Название серии *
                </label>
                <input
                  type="text"
                  id="name"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Например: Premium"
                  required
                />
              </div>

              <div>
                <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-2">
                  Валюта
                </label>
                <select
                  id="currency"
                  value={formData.currency}
                  onChange={(e) => handleInputChange('currency', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="RUB">RUB</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
              </div>
            </div>

            <div className="mt-6">
              <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
                Описание
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Описание серии и её особенности..."
              />
            </div>
          </div>

          {/* Материалы */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Материалы *</h3>
            
            <div className="space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMaterial}
                  onChange={(e) => setNewMaterial(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Добавить материал (например: МДФ)"
                  onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddMaterial())}
                />
                <button
                  type="button"
                  onClick={handleAddMaterial}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Добавить
                </button>
              </div>

              {formData.materials.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {formData.materials.map((material, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800"
                    >
                      {material}
                      <button
                        type="button"
                        onClick={() => handleRemoveMaterial(material)}
                        className="ml-2 text-blue-600 hover:text-blue-800"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Ценообразование */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Ценообразование</h3>
            
            <div>
              <label htmlFor="basePrice" className="block text-sm font-medium text-gray-700 mb-2">
                Базовая цена
              </label>
              <input
                type="number"
                id="basePrice"
                value={formData.basePrice}
                onChange={(e) => handleInputChange('basePrice', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="0"
                min="0"
                step="0.01"
              />
              <p className="mt-1 text-sm text-gray-500">
                Базовая цена для расчёта стоимости дверей в этой серии
              </p>
            </div>
          </div>

          {/* Статус */}
          <div className="mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Статус</h3>
            
            <div className="flex items-center">
              <input
                type="checkbox"
                id="isActive"
                checked={formData.isActive}
                onChange={(e) => handleInputChange('isActive', e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
              <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
                Серия активна (доступна для выбора)
              </label>
            </div>
          </div>
        </div>

        {/* Кнопки действий */}
        <div className="flex justify-end space-x-4">
          <Link
            href="/admin/doors/series"
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Отмена
          </Link>
          
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Создание...' : 'Создать серию'}
          </button>
        </div>
      </form>
    </div>
  );
}
