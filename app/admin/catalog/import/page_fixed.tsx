'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Card, Badge } from '../../../../components/ui';
import { Upload, Download, FileText, CheckCircle, XCircle, AlertTriangle, History, RefreshCw, Trash2, Database, Upload as UploadIcon, ArrowRight, ArrowLeft, Settings } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useImportTemplate, useFileAnalysis } from '../../../../hooks/useImportTemplate';
import CatalogTree from '../../../../components/admin/CatalogTree';
import TemplateManager from '../../../../components/admin/TemplateManager';
import { clientLogger } from '@/lib/logging/client-logger';

interface ImportHistoryItem {
  id: string;
  filename: string;
  imported_count: number;
  error_count: number;
  status: string;
  created_at: string;
}

interface PriceListData {
  headers: string[];
  rows: any[][];
  totalRows: number;
}

interface PhotoData {
  files: File[];
  totalCount: number;
}

interface PropertyMapping {
  fieldName: string;
  displayName: string;
  dataType: 'text' | 'number' | 'select' | 'boolean' | 'image';
  isRequired: boolean;
  isFilterable: boolean;
  isVisible: boolean;
  options?: string[];
  unit?: string;
}

interface CatalogCategory {
  id: string;
  name: string;
  level: number;
  parent_id?: string;
  product_count?: number;
  displayName?: string;
}

type ImportStep = 'catalog' | 'template' | 'upload' | 'validation' | 'import' | 'photos' | 'complete';
type TabType = 'import' | 'templates';

export default function CatalogImportPage() {
  // Основные состояния
  const [activeTab, setActiveTab] = useState<TabType>('import');
  const [currentStep, setCurrentStep] = useState<ImportStep>('catalog');
  const [priceListData, setPriceListData] = useState<PriceListData | null>(null);
  const [photoData, setPhotoData] = useState<PhotoData | null>(null);
  const [propertyMappings, setPropertyMappings] = useState<PropertyMapping[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedCatalogCategoryId, setSelectedCatalogCategoryId] = useState<string>('');
  const [requiredFields, setRequiredFields] = useState<any[]>([]);
  const [completedSteps, setCompletedSteps] = useState<ImportStep[]>([]);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  
  // Новые состояния для маппинга
  const [fileHeaders, setFileHeaders] = useState<any[]>([]);
  const [fieldMappings, setFieldMappings] = useState<any[]>([]);
  
  // Хуки для работы с шаблонами
  const { template, loading: templateLoading, loadTemplate, createTemplate } = useImportTemplate();
  const { analyzeFile, analyzing } = useFileAnalysis();
  
  // Состояния для истории и результатов
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [catalogCategories, setCatalogCategories] = useState<CatalogCategory[]>([]);
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const [photoCategorySearchTerm, setPhotoCategorySearchTerm] = useState('');
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [photoMappingProperty, setPhotoMappingProperty] = useState<string>('');
  const [existingProductProperties, setExistingProductProperties] = useState<string[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(false);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());
  const [fieldSettings, setFieldSettings] = useState<Record<string, {
    displayName: string;
    isRequired: boolean;
    dataType: 'text' | 'number' | 'select' | 'boolean' | 'image';
  }>>({});

  useEffect(() => {
    loadImportHistory();
    loadCatalogCategories();
    
    // Проверяем URL параметры для предварительного выбора категории
    const urlParams = new URLSearchParams(window.location.search);
    const categoryParam = urlParams.get('category');
    if (categoryParam) {
      setSelectedCatalogCategoryId(categoryParam);
    }
  }, []);

  // Загружаем свойства существующих товаров при выборе категории
  useEffect(() => {
    if (selectedCatalogCategoryId) {
      loadExistingProductProperties(selectedCatalogCategoryId);
    }
  }, [selectedCatalogCategoryId]);

  const loadImportHistory = async () => {
    try {
      setLoadingHistory(true);
      const response = await fetch('/api/catalog/import?action=history');
      const data = await response.json();
      setImportHistory(data);
    } catch (error) {
      clientLogger.error('Error loading import history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadExistingProductProperties = async (categoryId: string) => {
    if (!categoryId) {
      setExistingProductProperties([]);
      return;
    }

    setLoadingProperties(true);
    try {
      const response = await fetch(`/api/catalog/products?categoryId=${categoryId}&limit=10`);
      const data = await response.json();
      
      clientLogger.debug('Existing products response:', data);
      
      if (data.success && data.products && data.products.length > 0) {
        // Собираем все уникальные свойства из товаров
        const allProperties = new Set<string>();
        
        data.products.forEach((product: any) => {
          if (product.properties_data) {
            try {
              const properties = typeof product.properties_data === 'string' 
                ? JSON.parse(product.properties_data) 
                : product.properties_data;
              
              Object.keys(properties).forEach(key => {
                // Исключаем служебные поля
                if (!['photos', 'id', 'created_at', 'updated_at'].includes(key)) {
                  allProperties.add(key);
                }
              });
            } catch (error) {
              clientLogger.error('Error parsing properties_data:', error);
            }
          }
        });
        
        setExistingProductProperties(Array.from(allProperties).sort());
        clientLogger.debug('Loaded existing properties:', { properties: Array.from(allProperties) });
      } else {
        setExistingProductProperties([]);
      }
    } catch (error) {
      clientLogger.error('Error loading existing product properties:', error);
      setExistingProductProperties([]);
    } finally {
      setLoadingProperties(false);
    }
  };

  const loadCatalogCategories = async () => {
    try {
      clientLogger.debug('🔄 Загружаем категории для импорта...');
      const response = await fetch('/api/catalog/categories-flat');
      const data = await response.json();
      
      clientLogger.debug('📦 Ответ API категорий:', data);
      
      // Используем данные напрямую из нового API
      const categories = data.categories || [];
      
      clientLogger.debug(`✅ Загружено ${categories.length} категорий`);
      clientLogger.debug('Пример категории:', categories[0]);
      
      // Просто устанавливаем категории без дополнительной обработки
      setCatalogCategories(categories);
      
      clientLogger.debug('📊 Категории с товарами:', categories.filter((c: any) => c.product_count > 0).length);
      
    } catch (error) {
      clientLogger.error('Error loading catalog categories:', error);
    }
  };

  // Функция для создания CSV из данных прайса
  function createCSVFromPriceListData(rows: any[][], headers: string[]): string {
    let csvContent = '';
    csvContent += headers.map(header => `"${header.replace(/"/g, '""')}"`).join(',') + '\n';
    rows.forEach(row => {
      const csvRow = row.map(cell => {
        if (cell === null || cell === undefined) return '""';
        const cellStr = String(cell);
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return `"${cellStr.replace(/"/g, '""')}"`;
        }
        return cellStr;
      }).join(',');
      csvContent += csvRow + '\n';
    });
    return csvContent;
  }

  const handleCatalogCategorySelect = (categoryId: string) => {
    setSelectedCatalogCategoryId(categoryId);
  };

  const handleCatalogComplete = async () => {
    setCompletedSteps(prev => [...prev, 'catalog']);
    setCurrentStep('template');
  };

  const handleTemplateComplete = () => {
    setCompletedSteps(prev => [...prev, 'template']);
    setCurrentStep('upload');
  };

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length < 2) {
        alert('Файл должен содержать заголовки и хотя бы одну строку данных');
        return;
      }

      const headers = jsonData[0] as string[];
      const rows = jsonData.slice(1) as any[][];

      setPriceListData({
        headers,
        rows,
        totalRows: rows.length
      });

      setCompletedSteps(prev => [...prev, 'upload']);
      setCurrentStep('validation');
    } catch (error) {
      clientLogger.error('Ошибка обработки файла:', error);
      alert('Ошибка при обработке файла');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleValidationComplete = () => {
    setCompletedSteps(prev => [...prev, 'validation']);
    setCurrentStep('import');
  };

  const handlePhotosComplete = async (photoFiles: File[]) => {
    const photoData: PhotoData = {
      files: photoFiles,
      totalCount: photoFiles.length
    };
    
    setPhotoData(photoData);
    
    try {
      setUploadingPhotos(true);
      const formData = new FormData();
      
      photoFiles.forEach((photo) => {
        formData.append('photos', photo);
      });
      
      formData.append('category', selectedCatalogCategoryId);
      formData.append('mapping_property', photoMappingProperty);

      clientLogger.debug('Отправка фотографий...', { count: photoFiles.length, unit: 'файлов' });
      
      const response = await fetch('/api/admin/import/photos-improved', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();
      clientLogger.debug('Фотографии загружены:', result);
      
      // Создаем детальный отчет
      let reportMessage = `📸 ЗАГРУЗКА ФОТО ЗАВЕРШЕНА!\n\n`;
      reportMessage += `📁 Загружено файлов: ${result.uploaded || 0}\n`;
      reportMessage += `🔗 Привязано к товарам: ${result.linked || 0}\n`;
      reportMessage += `❌ Ошибок: ${result.errors || 0}\n\n`;
      
      if (result.uploaded > 0) {
        reportMessage += `✅ Успешно обработано ${result.uploaded} фотографий\n`;
      }
      
      if (result.linked > 0) {
        reportMessage += `🎯 ${result.linked} товаров получили новые фото\n`;
      }
      
      if (result.errors > 0) {
        reportMessage += `⚠️ ${result.errors} файлов не удалось обработать\n`;
      }
      
      if (result.details && result.details.length > 0) {
        reportMessage += `\n📋 Детали:\n`;
        result.details.forEach((detail: any) => {
          reportMessage += `• ${detail.filename}: ${detail.status}\n`;
        });
      }
      
      alert(reportMessage);
      
      setCompletedSteps(prev => [...prev, 'photos']);
      setCurrentStep('complete');
      
    } catch (error) {
      clientLogger.error('Error uploading photos:', error);
      alert('Ошибка при загрузке фотографий: ' + (error instanceof Error ? error.message : 'Неизвестная ошибка'));
    } finally {
      setUploadingPhotos(false);
    }
  };

  const getStepTitle = () => {
    switch (currentStep) {
      case 'catalog': return 'Выбор категории каталога';
      case 'template': return 'Просмотр шаблона';
      case 'upload': return 'Загрузка файла';
      case 'validation': return 'Проверка соответствия';
      case 'import': return 'Импорт товаров';
      case 'complete': return 'Завершение импорта';
      default: return 'Импорт товаров';
    }
  };

  const getStepDescription = () => {
    switch (currentStep) {
      case 'catalog': return 'Выберите категорию каталога для привязки товаров';
      case 'template': return 'Просмотрите и скачайте шаблон для выбранной категории';
      case 'upload': return 'Загрузите файл с данными о товарах';
      case 'validation': return 'Проверьте соответствие полей файла шаблону';
      case 'import': return 'Выполните импорт товаров в систему';
      case 'complete': return 'Все данные загружены и настроены';
      default: return '';
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'catalog':
        return (
          <div className="space-y-6">
            <div className="grid gap-4">
              <h4 className="text-lg font-medium">Выберите категорию каталога:</h4>
              
              {/* Поиск по категориям */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Поиск по названию категории..."
                  value={categorySearchTerm}
                  onChange={(e) => setCategorySearchTerm(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
                />
                <div className="absolute right-3 top-2.5 text-gray-400">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>

              {/* Дерево категорий */}
              <div className="border rounded-lg max-h-80 overflow-y-auto">
                <CatalogTree
                  categories={catalogCategories}
                  selectedCategoryId={selectedCatalogCategoryId}
                  onCategorySelect={setSelectedCatalogCategoryId}
                  searchTerm={categorySearchTerm}
                />
              </div>

              {/* Информация о выбранной категории */}
              {selectedCatalogCategoryId && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <span className="text-sm font-medium text-blue-900">
                        Выбрана категория: {catalogCategories.find(c => c.id === selectedCatalogCategoryId)?.name}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex justify-between">
              <Button variant="secondary" onClick={() => setCurrentStep('upload')}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Назад
              </Button>
              <Button
                onClick={handleCatalogComplete}
                disabled={!selectedCatalogCategoryId}
                className={selectedCatalogCategoryId ? 'bg-black hover:bg-gray-800' : ''}
              >
                Продолжить
                <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
        );

      case 'template':
        return (
          <div className="space-y-6">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-sm font-medium text-blue-900">
                  Выбрана категория: {catalogCategories.find(c => c.id === selectedCatalogCategoryId)?.name}
                </span>
              </div>
            </div>

            {/* Управление шаблоном */}
            <TemplateManager
              catalogCategoryId={selectedCatalogCategoryId}
              catalogCategoryName={catalogCategories.find(c => c.id === selectedCatalogCategoryId)?.name}
            />

            {/* Кнопка продолжения */}
            <div className="flex justify-end">
              <Button
                onClick={handleTemplateComplete}
                className="bg-black hover:bg-gray-800"
              >
                Продолжить к загрузке файла
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        );

      case 'upload':
        return (
          <div className="space-y-6">
            <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-6">
              <div className="text-center">
                <div className="text-3xl mb-3">📊</div>
                <h3 className="text-lg font-semibold text-black mb-2">Загрузка прайс-листа</h3>
                <p className="text-gray-600 mb-4 text-sm">Загрузите файл с данными о товарах</p>
                
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleFileUpload(file);
                    }
                  }}
                  className="hidden"
                  id="price-list-upload"
                />
                <label
                  htmlFor="price-list-upload"
                  className="inline-flex items-center px-4 py-2 bg-black text-white rounded hover:bg-yellow-400 hover:text-black transition-all duration-200 cursor-pointer text-sm"
                >
                  {isProcessing ? 'Обработка...' : 'Выбрать файл'}
                </label>
                
                <p className="text-xs text-gray-500 mt-2">Форматы: .xlsx, .csv</p>
              </div>
            </div>
          </div>
        );

      case 'validation':
        return priceListData ? (
          <div className="space-y-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Проверка соответствия полей</h4>
              <p className="text-gray-700 text-sm">
                Проверьте соответствие заголовков файла шаблону категории
              </p>
            </div>

            {/* Здесь будет логика сравнения полей файла с шаблоном */}
            <div className="space-y-4">
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="text-sm font-medium text-green-900">
                    Файл успешно загружен: {priceListData.totalRows} строк
                  </span>
                </div>
              </div>
              
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-5 w-5 text-blue-500" />
                  <span className="text-sm font-medium text-blue-900">
                    Проверка соответствия полей...
                  </span>
                </div>
              </div>
            </div>

            {/* Кнопка продолжения */}
            <div className="flex justify-end">
              <Button
                onClick={handleValidationComplete}
                className="bg-black hover:bg-gray-800"
              >
                Продолжить к импорту
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
            <p className="text-gray-600">Загрузка данных...</p>
          </div>
        );

      case 'import':
        return (
          <div className="space-y-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-medium text-gray-900 mb-2">Импорт товаров</h4>
              <p className="text-gray-700 text-sm">
                Выполните импорт товаров в систему
              </p>
            </div>

            {/* Здесь будет логика импорта */}
            <div className="text-center py-8">
              <Button
                onClick={() => {
                  setCompletedSteps(prev => [...prev, 'import']);
                  setCurrentStep('complete');
                }}
                className="bg-black hover:bg-gray-800"
              >
                Загрузить товары
                <Upload className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        );

      case 'complete':
        return (
          <div className="space-y-6">
            <div className="bg-green-50 p-6 rounded-lg border border-green-200 text-center">
              <div className="text-4xl mb-4">✅</div>
              <h3 className="text-xl font-semibold text-green-900 mb-2">Импорт завершен!</h3>
              <p className="text-green-700">
                Все данные успешно загружены и настроены
              </p>
            </div>

            <div className="flex justify-center">
              <Button
                onClick={() => {
                  setCurrentStep('catalog');
                  setCompletedSteps([]);
                  setPriceListData(null);
                  setPhotoData(null);
                  setSelectedCatalogCategoryId('');
                }}
                className="bg-black hover:bg-gray-800"
              >
                Начать новый импорт
                <RefreshCw className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Заголовок */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Импорт товаров</h1>
          <p className="mt-2 text-gray-600">Загрузка и настройка товаров в каталог</p>
        </div>

        {/* Основной контент */}
        <div className="bg-white rounded-lg shadow-sm">
          {/* Заголовок шага */}
          <div className="border-b border-gray-200 p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold text-black">{getStepTitle()}</h2>
                <p className="text-gray-600">{getStepDescription()}</p>
              </div>
              {currentStep !== 'catalog' && (
                <Button variant="secondary" onClick={() => setCurrentStep('catalog')}>
                  Начать заново
                </Button>
              )}
            </div>

            {/* Прогресс бар */}
            <div className="flex items-center space-x-4 mb-8">
              {[
                { key: 'catalog', label: 'Категория', icon: '📁' },
                { key: 'template', label: 'Шаблон', icon: '📋' },
                { key: 'upload', label: 'Файл', icon: '📊' },
                { key: 'validation', label: 'Проверка', icon: '🔍' },
                { key: 'import', label: 'Импорт', icon: '⬆️' },
                { key: 'complete', label: 'Готово', icon: '✅' }
              ].map((step, index) => {
                const isActive = step.key === currentStep;
                const isCompleted = completedSteps.includes(step.key as ImportStep);
                
                return (
                  <div key={step.key} className="flex items-center">
                    <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                      isActive 
                        ? 'border-black bg-black text-white' 
                        : isCompleted 
                          ? 'border-green-500 bg-green-500 text-white' 
                          : 'border-gray-300 bg-white text-gray-500'
                    }`}>
                      <span className="text-sm font-medium">{step.icon}</span>
                    </div>
                    <div className="ml-3">
                      <p className={`text-sm font-medium ${
                        isActive ? 'text-black' : isCompleted ? 'text-green-600' : 'text-gray-500'
                      }`}>
                        {step.label}
                      </p>
                    </div>
                    {index < 5 && (
                      <div className={`w-8 h-0.5 mx-2 ${
                        isCompleted ? 'bg-green-500' : 'bg-gray-300'
                      }`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Содержимое шага */}
          <div className="p-6">
            {renderStepContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
