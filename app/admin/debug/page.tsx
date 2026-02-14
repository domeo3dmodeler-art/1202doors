'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '../../../components/ui';
import { clientLogger } from '@/lib/logging/client-logger';

export default function DebugPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [debugInfo, setDebugInfo] = useState('');

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const response = await fetch('/api/catalog/categories');
      const data = await response.json();
      setCategories(data.categories || []);
    } catch (error) {
      clientLogger.error('Error loading categories:', error);
    }
  };

  const loadProducts = async (categoryId: string) => {
    try {
      const response = await fetch(`/api/catalog/products?category=${categoryId}&limit=5`);
      const data = await response.json();
      setProducts(data.products || []);
      
      // Анализируем данные
      let debug = `=== АНАЛИЗ ТОВАРОВ ===\n`;
      debug += `Найдено товаров: ${data.products?.length || 0}\n\n`;
      
      data.products?.forEach((product: any, index: number) => {
        debug += `ТОВАР ${index + 1}:\n`;
        debug += `  SKU: ${product.sku}\n`;
        debug += `  Name: ${product.name}\n`;
        debug += `  Properties data type: ${typeof product.properties_data}\n`;
        
        if (product.properties_data) {
          const props = typeof product.properties_data === 'string' 
            ? JSON.parse(product.properties_data) 
            : product.properties_data;
          
          debug += `  Properties keys: ${Object.keys(props).join(', ')}\n`;
          debug += `  Has photos: ${props.photos ? 'ДА' : 'НЕТ'}\n`;
          
          if (props.photos) {
            debug += `  Photos: ${JSON.stringify(props.photos)}\n`;
            debug += `  Photos type: ${typeof props.photos}\n`;
            debug += `  Photos is array: ${Array.isArray(props.photos)}\n`;
            debug += `  Photos length: ${props.photos.length || 0}\n`;
          }
          
          // Показываем несколько ключевых свойств
          const keyProps = ['Артикул поставщика', 'Название', 'Цена'];
          keyProps.forEach(key => {
            if (props[key]) {
              debug += `  ${key}: ${props[key]}\n`;
            }
          });
        }
        debug += `\n`;
      });
      
      setDebugInfo(debug);
    } catch (error) {
      clientLogger.error('Error loading products:', error);
      setDebugInfo(`Ошибка загрузки товаров: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const testPhotoUpload = async () => {
    // Сначала тестируем поиск товаров без загрузки файла
    try {
      const response = await fetch('/api/test-photo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          categoryId: selectedCategory,
          mappingProperty: 'Артикул поставщика',
          fileName: 'test-photo.jpg'
        })
      });
      
      const result = await response.json();
      
      let debug = debugInfo + `\n=== ТЕСТ ПОИСКА ТОВАРОВ ДЛЯ ФОТО ===\n`;
      debug += `Success: ${result.success}\n`;
      debug += `File name: ${result.testResults?.fileName}\n`;
      debug += `File name without ext: ${result.testResults?.fileNameWithoutExt}\n`;
      debug += `Total products: ${result.testResults?.totalProducts}\n\n`;
      
      result.testResults?.results.forEach((item: any, index: number) => {
        debug += `ТОВАР ${index + 1}: ${item.product.sku}\n`;
        debug += `  Name: ${item.product.name}\n`;
        debug += `  Matches: ${item.matches.length}\n`;
        
        if (item.matches.length > 0) {
          item.matches.forEach((match: any) => {
            debug += `    - Key: "${match.key}" = "${match.value}" (${match.matchType})\n`;
          });
        } else {
          debug += `  Available keys: ${Object.keys(item.properties).join(', ')}\n`;
        }
        debug += `\n`;
      });
      
      setDebugInfo(debug);
      
    } catch (error) {
      clientLogger.error('Error testing photo search:', error);
      setDebugInfo(debugInfo + `\nОшибка тестирования поиска: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">🔍 Отладка системы</h1>
      
      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Выберите категорию для анализа:
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => {
              setSelectedCategory(e.target.value);
              if (e.target.value) loadProducts(e.target.value);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="">Выберите категорию...</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} (ID: {category.id})
              </option>
            ))}
          </select>
        </div>

        {selectedCategory && (
          <div className="flex space-x-4">
            <Button onClick={() => loadProducts(selectedCategory)}>
              🔄 Перезагрузить товары
            </Button>
            <Button onClick={testPhotoUpload}>
              📸 Тест загрузки фото
            </Button>
          </div>
        )}

        {debugInfo && (
          <div className="bg-gray-100 p-4 rounded-lg">
            <h3 className="text-lg font-semibold mb-2">Результаты анализа:</h3>
            <pre className="text-sm whitespace-pre-wrap font-mono">
              {debugInfo}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
