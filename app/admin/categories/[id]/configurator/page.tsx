'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { NoCodeComponentRenderer } from '../../../../../components/nocode/NoCodeComponents';
import { Card, Button } from '../../../../../components/ui';
import { clientLogger } from '@/lib/logging/client-logger';

interface PageTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  layout: PageLayout;
  components: ComponentConfig[];
}

interface PageLayout {
  type: 'grid' | 'flex' | 'custom';
  columns: number;
  gap: number;
  responsive: boolean;
}

interface ComponentConfig {
  id: string;
  type: string;
  position: { row: number; col: number; span?: number };
  config: any;
  title?: string;
  visible: boolean;
}

export default function CategoryConfiguratorPage() {
  const params = useParams();
  const categoryId = params.id as string;
  
  const [template, setTemplate] = useState<PageTemplate | null>(null);
  const [category, setCategory] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [configData, setConfigData] = useState<any>({});

  const fetchTemplate = useCallback(async () => {
    try {
      const response = await fetch(`/api/admin/categories/template?categoryId=${categoryId}`);
      const result = await response.json();
      
      if (result.success) {
        setTemplate(result.template);
        setCategory(result.category);
      } else {
        clientLogger.error('Error fetching template:', result.error);
      }
    } catch (error) {
      clientLogger.error('Error fetching template:', error);
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  useEffect(() => {
    if (categoryId) {
      fetchTemplate();
    }
  }, [categoryId, fetchTemplate]);

  const handleComponentUpdate = (componentId: string, data: any) => {
    setConfigData((prev: any) => ({
      ...prev,
      [componentId]: data
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-gray-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Загрузка конфигуратора...</p>
        </div>
      </div>
    );
  }

  // Создаем fallback шаблон если template отсутствует
  const defaultTemplate: PageTemplate = {
    id: 'default',
    name: 'Базовый конфигуратор',
    description: 'Стандартный конфигуратор товаров',
    category: categoryId,
    layout: {
      type: 'grid',
      columns: 3,
      gap: 4,
      responsive: true
    },
    components: [
      {
        id: 'style-selector',
        type: 'style-selector',
        position: { row: 1, col: 1, span: 1 },
        config: {
          title: 'Выбор стиля',
          styles: [
            { id: 'classic', name: 'Классический', description: 'Традиционный стиль' },
            { id: 'modern', name: 'Современный', description: 'Современный дизайн' }
          ]
        },
        title: 'Стиль',
        visible: true
      },
      {
        id: 'model-selector',
        type: 'model-selector',
        position: { row: 1, col: 2, span: 1 },
        config: {
          title: 'Выбор модели',
          models: [
            { id: 'model-a', name: 'Модель А', price: '1000₽' },
            { id: 'model-b', name: 'Модель Б', price: '1500₽' }
          ]
        },
        title: 'Модель',
        visible: true
      },
      {
        id: 'cart-panel',
        type: 'cart-panel',
        position: { row: 1, col: 3, span: 1 },
        config: {
          showTotal: true,
          allowEdit: true,
          exportOptions: ['kp', 'invoice']
        },
        title: 'Корзина',
        visible: true
      }
    ]
  };

  const currentTemplate = template && template.components && template.layout ? template : defaultTemplate;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-2">
              <div>
                <h1 className="text-xl font-bold text-gray-900">Domeo</h1>
                <p className="text-xs text-gray-600">Configurators</p>
              </div>
              <div className="flex items-center">
                <span className="text-gray-400 mx-2 text-lg">•</span>
                <h2 className="text-lg font-semibold text-gray-800">{category?.name || 'Категория'}</h2>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                onClick={() => window.history.back()}
                variant="outline"
              >
                Назад
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Заголовок */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{category?.name || 'Конфигуратор'}</h1>
          <p className="text-gray-600">{category?.description || currentTemplate.description}</p>
        </div>

        {/* Конфигуратор */}
        <div className="bg-gray-50 p-6 rounded-lg">
          <div 
            className={`grid gap-${currentTemplate.layout.gap} ${
              currentTemplate.layout.type === 'grid' 
                ? `grid-cols-${currentTemplate.layout.columns}` 
                : 'flex flex-wrap'
            }`}
          >
            {currentTemplate.components.map(component => (
              <div
                key={component.id}
                className={`${
                  component.position.span === 4 ? 'col-span-4' :
                  component.position.span === 3 ? 'col-span-3' :
                  component.position.span === 2 ? 'col-span-2' : 'col-span-1'
                }`}
              >
                <NoCodeComponentRenderer
                  type={component.type}
                  id={component.id}
                  config={component.config}
                  data={configData[component.id]}
                  onUpdate={handleComponentUpdate}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Информация о шаблоне */}
        <div className="mt-8 bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Информация о шаблоне</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-700">Название:</span>
              <span className="ml-2 text-gray-900">{template?.name || currentTemplate.name}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Компонентов:</span>
              <span className="ml-2 text-gray-900">{currentTemplate.components.length}</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Сетка:</span>
              <span className="ml-2 text-gray-900">{currentTemplate.layout.columns} колонок</span>
            </div>
            <div>
              <span className="font-medium text-gray-700">Адаптивность:</span>
              <span className="ml-2 text-gray-900">{currentTemplate.layout.responsive ? 'Да' : 'Нет'}</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}