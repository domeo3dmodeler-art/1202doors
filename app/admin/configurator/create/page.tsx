'use client';

import React, { useState } from 'react';
import { Card, Button } from '../../../../components/ui';
import CategoryInfoForm from '../../../../components/category-builder/CategoryInfoForm';
import DataUpload from '../../../../components/category-builder/DataUpload';
import CategoryBuilder from '../../../../components/category-builder/CategoryBuilder';
import PreviewModule from '../../../../components/category-builder/PreviewModule';
import { clientLogger } from '@/lib/logging/client-logger';

type BuilderStep = 'info' | 'upload' | 'design' | 'preview' | 'generate';

export default function CreateConfiguratorCategoryPage() {
  const [currentStep, setCurrentStep] = useState<BuilderStep>('info');
  const [categoryData, setCategoryData] = useState<any>(null);
  const [priceListData, setPriceListData] = useState<any>(null);
  const [photoData, setPhotoData] = useState<any>(null);
  const [cartItems, setCartItems] = useState<any[]>([]);

  const handleInfoComplete = (data: any) => {
    setCategoryData(data);
    setCurrentStep('upload');
  };

  const handleDataComplete = () => {
    setCurrentStep('design');
  };

  const handlePriceListLoaded = (data: any) => {
    setPriceListData(data);
  };

  const handlePhotosLoaded = (data: any) => {
    setPhotoData(data);
  };

  const handleDesignComplete = () => {
    setCurrentStep('preview');
  };

  const handleGenerate = () => {
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

  return (
    <div className="space-y-6">
      {/* Прогресс-бар */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-black">Этапы создания</h3>
          <span className="text-sm text-gray-600">
            Шаг {['info', 'upload', 'design', 'preview', 'generate'].indexOf(currentStep) + 1} из 5
          </span>
        </div>
        
        <div className="flex items-center space-x-4">
          {[
            { key: 'info', label: 'Инфо' },
            { key: 'upload', label: 'Данные' },
            { key: 'design', label: 'Дизайн' },
            { key: 'preview', label: 'Превью' },
            { key: 'generate', label: 'Генерация' }
          ].map((step, index) => {
            const isActive = step.key === currentStep;
            const isCompleted = ['info', 'upload', 'design', 'preview', 'generate'].indexOf(currentStep) > index;
            
            return (
              <div key={step.key} className="flex items-center">
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                  isActive 
                    ? 'border-black bg-black text-white' 
                    : isCompleted 
                      ? 'border-green-500 bg-green-500 text-white'
                      : 'border-gray-300 bg-white text-gray-400'
                }`}>
                  <span className="text-sm">{step.label[0]}</span>
                </div>
                <span className={`ml-2 text-sm font-medium ${
                  isActive ? 'text-black' : isCompleted ? 'text-green-600' : 'text-gray-500'
                }`}>
                  {step.label}
                </span>
                {index < 4 && (
                  <div className={`w-8 h-0.5 mx-4 ${
                    isCompleted ? 'bg-green-500' : 'bg-gray-300'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* Контент в зависимости от шага */}
      {currentStep === 'info' && (
        <CategoryInfoForm
          onComplete={handleInfoComplete}
          onCancel={() => window.history.back()}
        />
      )}

      {currentStep === 'upload' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-black">Загрузка данных</h3>
              <p className="text-gray-600">Загрузите прайс-лист и фотографии товаров</p>
            </div>
            <Button variant="outline" onClick={() => setCurrentStep('info')}>
              ← Назад
            </Button>
          </div>
          <DataUpload
            onPriceListLoaded={handlePriceListLoaded}
            onPhotosLoaded={handlePhotosLoaded}
            onComplete={handleDataComplete}
            categoryData={categoryData}
          />
        </div>
      )}

      {currentStep === 'design' && (
        <div className="space-y-6">
          <Card className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-black">Конструктор интерфейса</h3>
              <div className="flex space-x-2">
                <Button variant="outline" onClick={() => setCurrentStep('upload')}>
                  ← Назад
                </Button>
                <Button onClick={handleDesignComplete}>
                  Превью →
                </Button>
              </div>
            </div>
            <CategoryBuilder categoryData={{ id: '', name: 'Новая категория' }} onComplete={() => {}} />
          </Card>
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
              <Button variant="outline" onClick={() => setCurrentStep('design')}>
                ← Редактировать
              </Button>
              <Button onClick={handleGenerate}>
                Создать конфигуратор →
              </Button>
            </div>
          </div>
          
          <PreviewModule
            modules={[]} // Здесь будут модули из конструктора
            cartItems={cartItems}
            onAddToCart={handleAddToCart}
            onUpdateCartQuantity={handleUpdateCartQuantity}
            onRemoveFromCart={handleRemoveFromCart}
            onClearCart={handleClearCart}
            onExport={handleExport}
            onCreateQuote={handleCreateQuote}
            onCreateInvoice={handleCreateInvoice}
            onCreateFactoryOrder={handleCreateFactoryOrder}
          />
        </div>
      )}

      {currentStep === 'generate' && (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="text-center mb-6">
              <h2 className="text-xl font-semibold text-black mb-2">Генерация конфигуратора</h2>
              <p className="text-gray-600">Создание готового конфигуратора категории</p>
            </div>
            
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <h3 className="font-medium text-green-800 mb-2">Данные загружены</h3>
                  <p className="text-sm text-green-700">
                    Прайс-лист: {priceListData?.totalRows || 0} товаров<br/>
                    Фотографии: {photoData?.totalCount || 0} файлов
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
                <Button size="lg" onClick={() => {
                  // Здесь будет логика генерации конфигуратора
                  alert('Конфигуратор создан! Переход на страницу категории...');
                  window.location.href = '/admin/configurator';
                }}>
                  🚀 Создать конфигуратор
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
