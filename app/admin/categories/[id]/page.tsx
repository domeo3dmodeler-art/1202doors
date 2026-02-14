'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button, Card, Input, Select, Checkbox, Alert, LoadingSpinner } from '@/components/ui';
import { clientLogger } from '@/lib/logging/client-logger';

interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
  properties: any[];
  import_mapping: any;
  is_main: boolean;
  parent_id?: string;
  subcategories?: Category[];
}

interface Photo {
  id: string;
  url: string;
  alt: string;
  category_id: string;
}

export default function CategoryEditorPage() {
  const params = useParams();
  const categoryId = params.id as string;
  
  const [category, setCategory] = useState<Category | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  
  // Форма редактирования
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    icon: '',
    properties: [] as any[],
    import_mapping: {} as any
  });

  // Загрузка фото
  const [photoFiles, setPhotoFiles] = useState<FileList | null>(null);
  const [photoFolderUrl, setPhotoFolderUrl] = useState('');
  
  // Импорт прайса
  const [priceFile, setPriceFile] = useState<File | null>(null);
  const [priceHeaders, setPriceHeaders] = useState<string[]>([]);
  const [showPriceManager, setShowPriceManager] = useState(false);
  const [priceSettings, setPriceSettings] = useState({
    calculatorFields: [] as string[],
    frontendPrice: '',
    exportFields: [] as string[]
  });
  const [importReport, setImportReport] = useState<any>(null);

  const fetchCategory = useCallback(async () => {
    try {
      const response = await fetch(`/api/categories/${categoryId}`);
      const data = await response.json();
      setCategory(data);
      setFormData({
        name: data.name || '',
        description: data.description || '',
        icon: data.icon || '',
        properties: data.properties || [],
        import_mapping: data.import_mapping || {}
      });
      
      // Инициализируем настройки прайса из существующих данных
      if (data.import_mapping) {
        setPriceSettings({
          calculatorFields: data.import_mapping.calculator_fields || [],
          frontendPrice: data.import_mapping.frontend_price || '',
          exportFields: data.import_mapping.export_fields || []
        });
      }
    } catch (error) {
      clientLogger.error('Error fetching category:', error);
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  const fetchPhotos = useCallback(async () => {
    try {
      const response = await fetch(`/api/categories/${categoryId}/photos`);
      const data = await response.json();
      setPhotos(data.photos || []);
    } catch (error) {
      clientLogger.error('Error fetching photos:', error);
    }
  }, [categoryId]);

  useEffect(() => {
    if (categoryId) {
      fetchCategory();
      fetchPhotos();
    }
  }, [categoryId, fetchCategory, fetchPhotos]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/categories/${categoryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      if (response.ok) {
        alert('Категория успешно сохранена!');
        fetchCategory();
      } else {
        alert('Ошибка при сохранении категории');
      }
    } catch (error) {
      clientLogger.error('Error saving category:', error);
      alert('Ошибка при сохранении категории');
    } finally {
      setSaving(false);
    }
  };

  const updateCategory = async (categoryData: any) => {
    try {
      const response = await fetch(`/api/categories/${categoryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryData)
      });
      
      if (response.ok) {
        clientLogger.debug('Category updated successfully');
        return true;
      } else {
        clientLogger.error('Error updating category');
        return false;
      }
    } catch (error) {
      clientLogger.error('Error updating category:', error);
      return false;
    }
  };

  const handlePhotoUpload = async () => {
    if (!photoFiles && !photoFolderUrl) {
      alert('Выберите файлы или введите ссылку на папку');
      return;
    }

    setUploadingPhotos(true);
    try {
      const formData = new FormData();
      
      if (photoFiles) {
        Array.from(photoFiles).forEach(file => {
          formData.append('photos', file);
        });
      }
      
      if (photoFolderUrl) {
        formData.append('folderUrl', photoFolderUrl);
      }
      
      formData.append('categoryId', categoryId);

      const response = await fetch('/api/categories/photos/upload', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        alert('Фото успешно загружены!');
        setPhotoFiles(null);
        setPhotoFolderUrl('');
        fetchPhotos();
      } else {
        alert('Ошибка при загрузке фото');
      }
    } catch (error) {
      clientLogger.error('Error uploading photos:', error);
      alert('Ошибка при загрузке фото');
    } finally {
      setUploadingPhotos(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm('Удалить это фото?')) return;

    try {
      const response = await fetch(`/api/categories/photos/${photoId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        alert('Фото удалено!');
        fetchPhotos();
      } else {
        alert('Ошибка при удалении фото');
      }
    } catch (error) {
      clientLogger.error('Error deleting photo:', error);
      alert('Ошибка при удалении фото');
    }
  };

  const handlePriceFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPriceFile(file);
    // Не обрабатываем файл сразу, только сохраняем
  };

  const handleProcessPriceFile = async () => {
    if (!priceFile) {
      alert('Сначала выберите файл');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', priceFile);
      formData.append('category', categoryId);
      formData.append('mode', 'headers');

      clientLogger.debug('Processing price file:', {
        fileName: priceFile.name,
        fileSize: priceFile.size,
        categoryId: categoryId
      });

      const response = await fetch('/api/admin/import/universal', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      
      clientLogger.debug('Price file processing response:', data);
      
      if (data.ok) {
        setPriceHeaders(data.headers || []);
        
        // Проверяем, есть ли уже настройки импорта для этой категории
        const hasExistingMapping = category?.import_mapping && Object.keys(category.import_mapping).length > 0;
        
        if (hasExistingMapping) {
          // Если настройки уже есть, показываем менеджер для просмотра/изменения
          setShowPriceManager(true);
          alert(`Заголовки файла прочитаны: ${data.headers?.length || 0} полей. Настройки импорта уже существуют.`);
        } else {
          // Если настроек нет, показываем менеджер для настройки
          setShowPriceManager(true);
          alert(`Заголовки файла прочитаны: ${data.headers?.length || 0} полей. Настройте поля для импорта.`);
        }
      } else {
        alert('Ошибка при чтении файла: ' + data.error);
      }
    } catch (error) {
      clientLogger.error('Error processing price file:', error);
      alert('Ошибка при обработке файла прайса: ' + error);
    }
  };

  const handleImportPrice = async () => {
    if (!priceFile) {
      alert('Сначала выберите файл');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', priceFile);
      formData.append('category', categoryId);
      formData.append('mode', 'full');
      
      // Добавляем настройки импорта
      const mappingConfig = {
        calculator_fields: priceSettings.calculatorFields,
        frontend_price: priceSettings.frontendPrice,
        export_fields: priceSettings.exportFields
      };
      formData.append('mapping', JSON.stringify(mappingConfig));

      clientLogger.debug('Importing price file:', {
        fileName: priceFile.name,
        fileSize: priceFile.size,
        categoryId: categoryId,
        mappingConfig: mappingConfig
      });

      const response = await fetch('/api/admin/import/universal', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      
      clientLogger.debug('Price import response:', data);
      
      if (data.ok) {
        // Показываем отчет об импорте
        setImportReport({
          success: true,
          imported: data.imported || 0,
          errors: data.errors || [],
          filename: data.filename,
          category: data.category,
          processing_status: data.processing_status,
          note: data.note,
          sample_product: data.sample_product,
          total_rows: data.total_rows,
          valid_rows: data.valid_rows,
          error_rows: data.error_rows
        });
        
        alert(`Прайс успешно импортирован! Обработано ${data.imported || 0} товаров.`);
        // Обновляем статистику категории
        await fetchCategory();
      } else {
        alert('Ошибка при импорте прайса: ' + data.error);
      }
    } catch (error) {
      clientLogger.error('Error importing price:', error);
      alert('Ошибка при импорте прайса: ' + error);
    }
  };

  const addProperty = () => {
    setFormData(prev => ({
      ...prev,
      properties: [...prev.properties, { key: '', name: '', type: 'text', required: false }]
    }));
  };

  const updateProperty = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      properties: prev.properties.map((prop, i) => 
        i === index ? { ...prop, [field]: value } : prop
      )
    }));
  };

  const removeProperty = (index: number) => {
    setFormData(prev => ({
      ...prev,
      properties: prev.properties.filter((_, i) => i !== index)
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <LoadingSpinner size="lg" color="black" text="Загрузка..." />
      </div>
    );
  }

  if (!category) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Категория не найдена</h1>
          <Link href="/admin/categories" className="text-blue-600 hover:text-blue-800">
            ← Вернуться к списку категорий
          </Link>
        </div>
      </div>
    );
  }

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
                <span className="text-gray-400 mx-2">•</span>
                <h2 className="text-lg font-semibold text-gray-800">Редактор категории</h2>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => window.location.href = '/admin/categories'}
              >
                ← Назад к категориям
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                loading={saving}
              >
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Левая колонка - Основные данные */}
          <div className="space-y-6">
            {/* Основная информация */}
            <Card variant="base" padding="md">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Основная информация</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Название категории</label>
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Введите название категории"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Описание
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent"
                    placeholder="Введите описание категории"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Иконка (эмодзи)</label>
                  <Input
                    value={formData.icon}
                    onChange={(e) => setFormData(prev => ({ ...prev, icon: e.target.value }))}
                    placeholder="🚪"
                  />
                </div>
              </div>
            </Card>

            {/* Свойства категории */}
            <Card variant="base" padding="md">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Свойства категории</h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={addProperty}
                >
                  + Добавить свойство
                </Button>
              </div>

              <div className="space-y-3">
                {formData.properties.map((property, index) => (
                  <div key={index} className="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg">
                    <input
                      type="text"
                      value={property.key}
                      onChange={(e) => updateProperty(index, 'key', e.target.value)}
                      placeholder="Ключ (например: material)"
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <input
                      type="text"
                      value={property.name}
                      onChange={(e) => updateProperty(index, 'name', e.target.value)}
                      placeholder="Название (например: Материал)"
                      className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                    />
                    <select
                      value={property.type}
                      onChange={(e) => updateProperty(index, 'type', e.target.value)}
                      className="px-2 py-1 border border-gray-300 rounded text-sm"
                    >
                      <option value="text">Текст</option>
                      <option value="number">Число</option>
                      <option value="select">Список</option>
                      <option value="url">Ссылка</option>
                    </select>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => removeProperty(index)}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            </Card>

            {/* Настройки импорта прайса */}
            <Card variant="base" padding="md">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Настройки импорта прайса</h3>
              
              <div className="space-y-4">
                {/* Поля для калькулятора */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Поля для калькулятора
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                    {formData.properties.map((property, index) => (
                      <label key={index} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={priceSettings.calculatorFields.includes(property.key)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setPriceSettings(prev => ({
                                ...prev,
                                calculatorFields: [...prev.calculatorFields, property.key]
                              }));
                            } else {
                              setPriceSettings(prev => ({
                                ...prev,
                                calculatorFields: prev.calculatorFields.filter(f => f !== property.key)
                              }));
                            }
                          }}
                          className="mr-2"
                        />
                        <span className="text-sm">{property.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Цена для заказчика */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Цена для заказчика (РРЦ)
                  </label>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {formData.properties.map((property, index) => (
                      <label key={index} className="flex items-center">
                        <input
                          type="radio"
                          name="frontendPrice"
                          value={property.key}
                          checked={priceSettings.frontendPrice === property.key}
                          onChange={(e) => setPriceSettings(prev => ({
                            ...prev,
                            frontendPrice: e.target.value
                          }))}
                          className="mr-2"
                        />
                        <span className="text-sm">{property.name}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Выберите поле из прайса, которое содержит розничную цену для заказчика
                  </p>
                </div>

                {/* Поля для экспорта */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Поля для экспорта "Заказ поставщику"
                  </label>
                  <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto">
                    {formData.properties.map((property, index) => (
                      <label key={index} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={priceSettings.exportFields.includes(property.key)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setPriceSettings(prev => ({
                                ...prev,
                                exportFields: [...prev.exportFields, property.key]
                              }));
                            } else {
                              setPriceSettings(prev => ({
                                ...prev,
                                exportFields: prev.exportFields.filter(f => f !== property.key)
                              }));
                            }
                          }}
                          className="mr-2"
                        />
                        <span className="text-sm">{property.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Кнопка сохранения настроек */}
                <div className="pt-4 border-t border-gray-200">
                  <Button
                    variant="primary"
                    onClick={async () => {
                      const updatedCategory = {
                        ...formData,
                        import_mapping: {
                          calculator_fields: priceSettings.calculatorFields,
                          frontend_price: priceSettings.frontendPrice,
                          export_fields: priceSettings.exportFields
                        }
                      };
                      
                      await updateCategory(updatedCategory);
                      alert('Настройки импорта прайса сохранены!');
                    }}
                  >
                    Сохранить настройки импорта
                  </Button>
                </div>
              </div>
            </Card>
          </div>

          {/* Правая колонка - Импорт прайса и Фото */}
          <div className="space-y-6">
            {/* Импорт прайса */}
            <Card variant="base" padding="md">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Импорт прайса</h3>
              
              <div className="space-y-4">
                {/* Загрузка файла прайса */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Файл прайса
                  </label>
                  <div className="flex space-x-2 mb-2">
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handlePriceFileUpload}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    Поддерживаемые форматы: .xlsx, .xls, .csv
                  </p>
                  {priceFile && (
                    <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-600">
                        Выбран файл: <span className="font-medium">{priceFile.name}</span>
                      </p>
                      <p className="text-xs text-gray-500">
                        Размер: {(priceFile.size / 1024).toFixed(1)} KB
                      </p>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleProcessPriceFile}
                      >
                        Обработать файл
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setPriceFile(null);
                          setShowPriceManager(false);
                          setPriceHeaders([]);
                        }}
                      >
                        Сбросить файл
                      </Button>
                    </div>
                  )}
                </div>

                {/* Менеджер прайса */}
                {showPriceManager && priceHeaders.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="font-medium text-gray-900 mb-3">Настройка импорта прайса</h4>
                    
                    {/* Поля для калькулятора */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Поля для калькулятора
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {priceHeaders.map((header, index) => (
                          <label key={index} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={priceSettings.calculatorFields.includes(header)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setPriceSettings(prev => ({
                                    ...prev,
                                    calculatorFields: [...prev.calculatorFields, header]
                                  }));
                                } else {
                                  setPriceSettings(prev => ({
                                    ...prev,
                                    calculatorFields: prev.calculatorFields.filter(f => f !== header)
                                  }));
                                }
                              }}
                              className="mr-2"
                            />
                            <span className="text-sm">{header}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Цена для заказчика */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Цена для заказчика (РРЦ)
                      </label>
                      <div className="space-y-2">
                        {priceHeaders.map((header, index) => (
                          <label key={index} className="flex items-center">
                            <input
                              type="radio"
                              name="frontendPrice"
                              value={header}
                              checked={priceSettings.frontendPrice === header}
                              onChange={(e) => setPriceSettings(prev => ({
                                ...prev,
                                frontendPrice: e.target.value
                              }))}
                              className="mr-2"
                            />
                            <span className="text-sm">{header}</span>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Выберите колонку из прайса, которая содержит розничную цену для заказчика
                      </p>
                    </div>

                    {/* Поля для экспорта */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Поля для экспорта "Заказ поставщику"
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {priceHeaders.map((header, index) => (
                          <label key={index} className="flex items-center">
                            <input
                              type="checkbox"
                              checked={priceSettings.exportFields.includes(header)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setPriceSettings(prev => ({
                                    ...prev,
                                    exportFields: [...prev.exportFields, header]
                                  }));
                                } else {
                                  setPriceSettings(prev => ({
                                    ...prev,
                                    exportFields: prev.exportFields.filter(f => f !== header)
                                  }));
                                }
                              }}
                              className="mr-2"
                            />
                            <span className="text-sm">{header}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      <Button
                        variant="primary"
                        onClick={async () => {
                          // Сохраняем настройки импорта в категории
                          const updatedCategory = {
                            ...category,
                            import_mapping: {
                              calculator_fields: priceSettings.calculatorFields,
                              frontend_price: priceSettings.frontendPrice,
                              export_fields: priceSettings.exportFields
                            }
                          };
                          
                          // Обновляем категорию
                          await updateCategory(updatedCategory);
                          
                          // Импортируем прайс
                          await handleImportPrice();
                          setShowPriceManager(false);
                        }}
                      >
                        Сохранить настройки и импортировать прайс
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setShowPriceManager(false)}
                      >
                        Отмена
                      </Button>
                    </div>
                  </div>
                )}

                {/* Кнопка импорта с существующими настройками */}
                {priceFile && !showPriceManager && priceHeaders.length > 0 && (
                  <div className="bg-gray-50 rounded-lg p-4 mt-4">
                    <h4 className="font-medium text-gray-900 mb-3">Импорт прайса</h4>
                    <p className="text-sm text-gray-600 mb-3">
                      Настройки импорта уже существуют. Файл будет импортирован с текущими настройками.
                    </p>
                    <Button
                      variant="success"
                      onClick={handleImportPrice}
                    >
                      Импортировать прайс
                    </Button>
                  </div>
                )}
                {/* Отчет об импорте */}
                {importReport && (
                  <Card variant="base" padding="md" className="mt-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Отчет об импорте</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                      <div className="bg-green-50 rounded-lg p-4">
                        <p className="text-sm text-green-600">Успешно импортировано</p>
                        <p className="text-2xl font-bold text-green-900">{importReport.imported}</p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-4">
                        <p className="text-sm text-blue-600">Всего строк</p>
                        <p className="text-2xl font-bold text-blue-900">{importReport.total_rows}</p>
                      </div>
                      <div className="bg-red-50 rounded-lg p-4">
                        <p className="text-sm text-red-600">Ошибок</p>
                        <p className="text-2xl font-bold text-red-900">{importReport.error_rows}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium text-gray-700">Файл:</p>
                        <p className="text-sm text-gray-900">{importReport.filename}</p>
                      </div>
                      
                      <div>
                        <p className="text-sm font-medium text-gray-700">Статус:</p>
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          importReport.processing_status === 'success' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {importReport.processing_status === 'success' ? 'Успешно' : 'Частично'}
                        </span>
                      </div>

                      {importReport.note && (
                        <div>
                          <p className="text-sm font-medium text-gray-700">Примечание:</p>
                          <p className="text-sm text-gray-900">{importReport.note}</p>
                        </div>
                      )}

                      {importReport.sample_product && (
                        <div>
                          <p className="text-sm font-medium text-gray-700">Пример товара:</p>
                          <pre className="bg-gray-100 p-2 rounded text-xs overflow-x-auto">
                            {JSON.stringify(importReport.sample_product, null, 2)}
                          </pre>
                        </div>
                      )}

                      {importReport.errors && importReport.errors.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-gray-700">Ошибки:</p>
                          <ul className="text-sm text-red-600 space-y-1">
                            {importReport.errors.slice(0, 5).map((error: string, index: number) => (
                              <li key={index}>• {error}</li>
                            ))}
                            {importReport.errors.length > 5 && (
                              <li>... и еще {importReport.errors.length - 5} ошибок</li>
                            )}
                          </ul>
                        </div>
                      )}
                    </div>

                    <div className="mt-6 flex space-x-3">
                      <Button
                        variant="primary"
                        onClick={() => window.location.href = '/admin/products'}
                      >
                        Посмотреть товары
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => setImportReport(null)}
                      >
                        Закрыть отчет
                      </Button>
                    </div>
                  </Card>
                )}
              </div>
            </Card>
            {/* Загрузка фото */}
            <Card variant="base" padding="md">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Загрузка фото</h3>
              
              <div className="space-y-4">
                {/* Загрузка файлов */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Загрузить файлы
                  </label>
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={(e) => setPhotoFiles(e.target.files)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                  />
                  {photoFiles && (
                    <p className="mt-2 text-sm text-gray-600">
                      Выбрано файлов: {photoFiles.length}
                    </p>
                  )}
                </div>

                {/* Загрузка по ссылке на папку */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Или ссылка на папку с фото
                  </label>
                  <input
                    type="url"
                    value={photoFolderUrl}
                    onChange={(e) => setPhotoFolderUrl(e.target.value)}
                    placeholder="https://example.com/photos/"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500 focus:border-transparent"
                  />
                </div>

                <Button
                  variant="primary"
                  onClick={handlePhotoUpload}
                  disabled={uploadingPhotos || (!photoFiles && !photoFolderUrl)}
                  loading={uploadingPhotos}
                  className="w-full"
                >
                  Загрузить фото
                </Button>
              </div>
            </Card>

            {/* Галерея фото */}
            <Card variant="base" padding="md">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Фото категории</h3>
              
              {photos.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Фото не загружены</p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {photos.map((photo) => (
                    <div key={photo.id} className="relative group">
                      <img
                        src={photo.url}
                        alt={photo.alt}
                        className="w-full h-32 object-cover rounded-lg"
                      />
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDeletePhoto(photo.id)}
                        className="absolute top-2 right-2 w-6 h-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ✕
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}