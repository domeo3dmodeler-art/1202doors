'use client';

// Отключаем prerendering для этой страницы - должно быть до импортов
export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamicImport from 'next/dynamic';
import AdminLayout from '../../../../components/layout/AdminLayout';
import { Card, Button } from '../../../../components/ui';
import CategoryInfoForm from '../../../../components/category-builder/CategoryInfoForm';
import DataUpload from '../../../../components/category-builder/DataUpload';
import ProfessionalPreview from '../../../../components/constructor/ProfessionalPreview';
import { clientLogger } from '@/lib/logging/client-logger';

// Динамический импорт PageBuilder с отключением SSR
const PageBuilder = dynamicImport(
  () => import('../../../../components/page-builder/PageBuilder').then(mod => ({ default: mod.PageBuilder })),
  { 
    ssr: false,
    loading: () => <div className="h-screen w-full flex items-center justify-center">Загрузка...</div>
  }
);

type BuilderStep = 'info' | 'design' | 'preview' | 'generate';

export default function CategoryBuilderPage() {
  const searchParams = useSearchParams();
  const categoryId = searchParams.get('id');
  
  const [currentStep, setCurrentStep] = useState<BuilderStep>('info');
  const [categoryData, setCategoryData] = useState<any>(null);
  const [priceListData, setPriceListData] = useState<any>(null);
  const [photoData, setPhotoData] = useState<any>(null);
  const [cartItems, setCartItems] = useState<any[]>([]);
  const [completedSteps, setCompletedSteps] = useState<BuilderStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [pageBuilderConfig, setPageBuilderConfig] = useState<any>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [isClient, setIsClient] = useState(false);

  // Проверяем, что мы на клиенте
  useEffect(() => {
    setIsClient(true);
  }, []);

  const loadExistingCategory = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/categories/${categoryId}`);
      const result = await response.json();
      
      if (result.success && result.category) {
        const category = result.category;
        setCategoryData(category);
        setIsEditMode(true);
        
        // Определяем какие шаги уже выполнены
        const completed = [];
        if (category.name && category.slug) {
          completed.push('info');
        }
        if (category.displayConfig && Object.keys(category.displayConfig).length > 0) {
          completed.push('design');
        }
        setCompletedSteps(completed as BuilderStep[]);
        
        // Устанавливаем текущий шаг на первый невыполненный
        if (!completed.includes('info')) {
          setCurrentStep('info');
        } else if (!completed.includes('design')) {
    setCurrentStep('design');
        } else {
          setCurrentStep('preview');
        }
      } else {
        alert('Категория не найдена');
        window.location.href = '/admin/categories';
      }
    } catch (error) {
      clientLogger.error('Error loading category:', error);
      alert('Ошибка при загрузке категории');
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  // Загружаем существующую категорию для редактирования
  useEffect(() => {
    if (categoryId) {
      loadExistingCategory();
    }
  }, [categoryId, loadExistingCategory]);

  const handleInfoComplete = async (data: any) => {
    try {
      let response;
      
      if (isEditMode && categoryData?.id) {
        // Обновляем существующую категорию
        response = await fetch(`/api/admin/categories/${categoryData.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: data.name,
            slug: data.slug,
            description: data.description,
            isActive: true
          }),
        });
      } else {
        // Создаем новую категорию
        response = await fetch('/api/admin/categories', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: data.name,
            slug: data.slug,
            description: data.description,
            isActive: true
          }),
        });
      }

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          setCategoryData({ ...data, id: result.category.id || categoryData.id });
          setCompletedSteps(prev => [...prev, 'info']);
          setCurrentStep('design');
        } else {
          alert('Ошибка при сохранении информации о категории: ' + result.error);
        }
      } else {
        alert('Ошибка при сохранении информации о категории');
      }
    } catch (error) {
      clientLogger.error('Error saving category info:', error);
      alert('Ошибка при сохранении информации о категории');
    }
  };

  // Удалены функции загрузки данных - теперь они в /admin/catalog/import

  const handleDesignComplete = (config: any) => {
    setPageBuilderConfig(config);
    setCompletedSteps(prev => [...prev, 'design']);
    setCurrentStep('preview');
  };

  const handleGenerate = () => {
    setCompletedSteps(prev => [...prev, 'preview']);
    setCurrentStep('generate');
  };

  // Функции для работы с корзиной
  const handleAddToCart = (item: any) => {
    setCartItems(prev => {
      const existingItem = prev.find(cartItem => cartItem.id === item.id);
      if (existingItem) {
        return prev.map(cartItem =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + 1, total: cartItem.price * (cartItem.quantity + 1) }
            : cartItem
        );
      }
      return [...prev, { ...item, quantity: 1, total: item.price }];
    });
  };

  const handleUpdateCartQuantity = (id: string, quantity: number) => {
    setCartItems(prev =>
      prev.map(item =>
        item.id === id
          ? { ...item, quantity, total: item.price * quantity }
          : item
      ).filter(item => item.quantity > 0)
    );
  };

  const handleRemoveFromCart = (id: string) => {
    setCartItems(prev => prev.filter(item => item.id !== id));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  // Функции экспорта
  const handleExport = (format: 'pdf' | 'xlsx' | 'csv') => {
    clientLogger.debug(`Экспорт в формате ${format}:`, { cartItems });
    alert(`Экспорт в формате ${format.toUpperCase()} выполнен!`);
  };

  const handleCreateQuote = () => {
    clientLogger.debug('Создание КП:', { cartItems });
    alert('Коммерческое предложение создано!');
  };

  const handleCreateInvoice = () => {
    clientLogger.debug('Создание счета:', { cartItems });
    alert('Счет создан!');
  };

  const handleCreateFactoryOrder = () => {
    clientLogger.debug('Создание заказа на фабрику:', { cartItems });
    alert('Заказ на фабрику создан!');
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 'info': return 'Основная информация';
      case 'design': return 'Конструктор интерфейса';
      case 'preview': return 'Предпросмотр';
      case 'generate': return 'Генерация конфигуратора';
      default: return 'Конструктор категории';
    }
  };

  const getStepDescription = () => {
    switch (currentStep) {
      case 'info': return 'Заполните основную информацию о категории';
      case 'design': return 'Создайте интерфейс конфигуратора с помощью модулей';
      case 'preview': return 'Проверьте работу конфигуратора';
      case 'generate': return 'Создайте готовый конфигуратор';
      default: return '';
    }
  };

  if (loading) {
    return (
      <AdminLayout
        title={isEditMode ? `Редактирование: ${categoryData?.name || 'Загрузка...'}` : "Создание категории конфигуратора"}
        subtitle="Загрузка..."
      >
        <div className="flex justify-center items-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Загрузка данных категории...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  // Показываем загрузку до инициализации клиента
  if (!isClient) {
    return (
      <AdminLayout
        title="Создание категории конфигуратора"
        subtitle="Инициализация..."
      >
        <div className="flex justify-center items-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Инициализация...</p>
          </div>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout
        title={isEditMode ? `Редактирование: ${categoryData?.name || 'Загрузка...'}` : "Создание категории конфигуратора"}
      subtitle={isEditMode ? `${getStepDescription()} - ${categoryData?.description || ''}` : getStepDescription()}
    >
      <div className="space-y-0">
        {/* Информация о редактируемой категории - ПЕРЕМЕЩЕНО ВВЕРХ */}
        {isEditMode && categoryData && (
          <Card variant="base">
            <div className="p-2">
              <div className="flex items-center space-x-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <span className="text-2xl">📦</span>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {categoryData.name}
                  </h3>
                  <p className="text-gray-600 mt-1">
                    {categoryData.description || 'Описание не указано'}
                  </p>
                  <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                    <span>ID: {categoryData.id}</span>
                    <span>Slug: {categoryData.slug}</span>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      categoryData.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {categoryData.isActive ? 'Активна' : 'Неактивна'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Прогресс-бар */}
        <Card variant="base">
          <div className="p-2">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-black">Этапы создания</h3>
              <span className="text-sm text-gray-600">
                Шаг {['info', 'design', 'preview', 'generate'].indexOf(currentStep) + 1} из 4
              </span>
            </div>
            
            <div className="flex items-center space-x-4">
              {[
                { key: 'info', label: 'Инфо', icon: 'ℹ️' },
                { key: 'design', label: 'Дизайн', icon: '🎨' },
                { key: 'preview', label: 'Превью', icon: '👁️' },
                { key: 'generate', label: 'Генерация', icon: '⚡' }
              ].map((step, index) => {
                const isActive = step.key === currentStep;
                const isCompleted = completedSteps.includes(step.key as BuilderStep);
                
                return (
                  <div key={step.key} className="flex items-center">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                      isActive 
                        ? 'border-black bg-black text-white' 
                        : isCompleted 
                          ? 'border-green-500 bg-green-500 text-white'
                          : 'border-gray-300 bg-white text-gray-400'
                    }`}>
                      <span className="text-sm">{step.icon}</span>
                    </div>
                    <span className={`ml-2 text-sm font-medium ${
                      isActive ? 'text-black' : isCompleted ? 'text-green-600' : 'text-gray-500'
                    }`}>
                      {step.label}
                    </span>
                    {index < 3 && (
                      <div className={`w-8 h-0.5 mx-4 ${
                        isCompleted ? 'bg-green-500' : 'bg-gray-300'
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        {/* Контент в зависимости от шага */}
        {currentStep === 'info' && (
          <div className="space-y-6">
            <Card variant="base">
              <div className="p-2">
                <div className="text-center mb-6">
                  <div className="text-6xl mb-4">📋</div>
                  <h3 className="text-xl font-semibold text-black mb-2">Создание категории конфигуратора</h3>
                  <p className="text-gray-600">
                    Заполните основную информацию о категории. Товары и фотографии нужно загружать через 
                    <strong> "Каталог товаров" → "Импорт каталога"</strong>
                  </p>
                </div>
              </div>
            </Card>
            
            <CategoryInfoForm
              onComplete={handleInfoComplete}
              onCancel={() => window.history.back()}
              initialData={categoryData}
            />
          </div>
        )}

        {/* Шаг загрузки данных удален - теперь в /admin/catalog/import */}

        {currentStep === 'design' && (
          <div className="space-y-6">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Конструктор интерфейса</h2>
              <p className="text-gray-600">Создайте профессиональный конфигуратор с drag & drop интерфейсом</p>
            </div>
            
            <PageBuilder />
          </div>
        )}

        {currentStep === 'preview' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold text-black">Предпросмотр конфигуратора</h3>
                <p className="text-gray-600">Проверьте работу созданного конфигуратора</p>
              </div>
              <div className="flex space-x-2">
                <Button variant="secondary" onClick={() => setCurrentStep('design')}>
                  ← Редактировать
                </Button>
                <Button variant="outline" onClick={() => setShowPreview(true)}>
                  👁️ Предпросмотр
                </Button>
                <Button variant="primary" onClick={handleGenerate}>
                  Создать конфигуратор →
                </Button>
              </div>
            </div>
            
            <Card variant="base">
              <div className="p-6">
                <div className="text-center">
                  <h4 className="text-lg font-semibold mb-2">Конфигуратор готов!</h4>
                  <p className="text-gray-600 mb-4">
                    Ваш конфигуратор создан с использованием профессионального конструктора страниц.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <div className="text-2xl mb-2">🧩</div>
                      <h5 className="font-medium">Блоков создано</h5>
                      <p className="text-2xl font-bold text-blue-600">
                        {pageBuilderConfig?.blocks.length || 0}
                      </p>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <div className="text-2xl mb-2">📂</div>
                      <h5 className="font-medium">Категорий настроено</h5>
                      <p className="text-2xl font-bold text-green-600">
                        {pageBuilderConfig?.categories.length || 0}
                      </p>
                    </div>
                    <div className="p-4 bg-purple-50 rounded-lg">
                      <div className="text-2xl mb-2">💰</div>
                      <h5 className="font-medium">Ценообразование</h5>
                      <p className="text-sm text-purple-600">
                        {pageBuilderConfig?.categories.filter((c: any) => c.pricingRule === 'formula').length || 0} формул
                      </p>
                    </div>
                  </div>
                  <Button variant="primary" onClick={() => setShowPreview(true)}>
                    Открыть предпросмотр
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {currentStep === 'generate' && (
          <div className="space-y-6">
            <Card variant="base">
              <div className="p-2">
                <div className="text-center mb-6">
                  <h2 className="text-xl font-semibold text-black mb-2">Генерация конфигуратора</h2>
                  <p className="text-gray-600">Создание готового конфигуратора категории</p>
                </div>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <h3 className="font-medium text-green-800 mb-2">Данные загружены</h3>
                      <p className="text-sm text-green-700">
                        Прайс-лист: {priceListData?.totalRows} товаров<br/>
                        Фотографии: {photoData?.totalCount} файлов
                      </p>
                    </div>
                    
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <h3 className="font-medium text-blue-800 mb-2">Интерфейс создан</h3>
                      <p className="text-sm text-blue-700">
                        Модули настроены<br/>
                        Дизайн готов
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-center">
                    <Button variant="primary" size="lg" onClick={() => {
                      // Здесь будет логика генерации конфигуратора
                      alert('Конфигуратор создан! Переход на страницу категории...');
                    }}>
                      🚀 Создать конфигуратор
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
      
      {/* Модальное окно предпросмотра */}
      {showPreview && pageBuilderConfig && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl h-full max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Предпросмотр конфигуратора</h3>
              <button
                onClick={() => setShowPreview(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="h-full overflow-auto">
              <ProfessionalPreview config={pageBuilderConfig} />
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
