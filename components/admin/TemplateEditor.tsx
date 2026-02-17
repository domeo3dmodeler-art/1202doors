'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui';
import { Save, Plus, Trash2, GripVertical, Settings, Eye, EyeOff } from 'lucide-react';

interface TemplateField {
  id: string;
  name: string;
  displayName: string;
  type: 'text' | 'number' | 'select' | 'boolean' | 'date';
  isRequired: boolean;
  isCalculator: boolean;
  isExport: boolean;
  options?: string[];
  defaultValue?: any;
  description?: string;
}

interface TemplateEditorProps {
  templateId: string;
  catalogCategoryId: string;
  onSave: (template: any) => void;
  onCancel: () => void;
}

const TemplateEditor: React.FC<TemplateEditorProps> = ({
  templateId,
  catalogCategoryId,
  onSave,
  onCancel
}) => {
  const [template, setTemplate] = useState<any>(null);
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadTemplate = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/templates?catalogCategoryId=${catalogCategoryId}`);
      
      if (!response.ok) {
        throw new Error('Ошибка загрузки шаблона');
      }
      
      const data = await response.json();
      
      if (data.success) {
        setTemplate(data.template);
        
        // Преобразуем поля шаблона в формат для редактирования
        const templateFields: TemplateField[] = data.template.requiredFields.map((field: string, index: number) => ({
          id: `field_${index}`,
          name: field,
          displayName: field,
          type: getFieldType(field),
          isRequired: true,
          isCalculator: data.template.calculatorFields?.includes(field) || false,
          isExport: data.template.exportFields?.includes(field) || true,
          options: getFieldOptions(field),
          description: getFieldDescription(field)
        }));
        
        setFields(templateFields);
      } else {
        throw new Error(data.error || 'Шаблон не найден');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [catalogCategoryId]);

  useEffect(() => {
    loadTemplate();
  }, [templateId, loadTemplate]);

  const getFieldType = (fieldName: string): TemplateField['type'] => {
    if (fieldName.includes('Цена') || fieldName.includes('мм') || fieldName.includes('Количество')) {
      return 'number';
    }
    if (fieldName.includes('Цвет') || fieldName.includes('Стиль') || fieldName.includes('Тип')) {
      return 'select';
    }
    if (fieldName.includes('Кромка') || fieldName.includes('Молдинг') || fieldName.includes('Стекло')) {
      return 'boolean';
    }
    return 'text';
  };

  const getFieldOptions = (fieldName: string): string[] => {
    const optionsMap: Record<string, string[]> = {
      'Цвет/Отделка': ['Белый', 'Дуб', 'Орех', 'Венге', 'Черный'],
      'Domeo_Стиль Web': ['Современный', 'Классический', 'Минимализм', 'Лофт'],
      'Тип конструкции': ['Царговая', 'Щитовая', 'Филенчатая'],
      'Тип открывания': ['Распашная', 'Раздвижная', 'Складная'],
      'Тип покрытия': ['Экошпон', 'ПВХ', 'Ламинированная', 'Массив'],
      'Ед.изм.': ['шт', 'м²', 'м', 'кг']
    };
    
    return optionsMap[fieldName] || [];
  };

  const getFieldDescription = (fieldName: string): string => {
    const descriptions: Record<string, string> = {
      'Артикул поставщика': 'Уникальный идентификатор товара от поставщика',
      'Domeo_Название модели для Web': 'Название модели для отображения на сайте',
      'Ширина/мм': 'Ширина изделия в миллиметрах',
      'Высота/мм': 'Высота изделия в миллиметрах',
      'Толщина/мм': 'Толщина изделия в миллиметрах',
      'Цена РРЦ': 'Рекомендованная розничная цена',
      'Цена опт': 'Оптовая цена'
    };
    
    return descriptions[fieldName] || '';
  };

  const addField = () => {
    const newField: TemplateField = {
      id: `field_${Date.now()}`,
      name: '',
      displayName: '',
      type: 'text',
      isRequired: false,
      isCalculator: false,
      isExport: true,
      options: [],
      description: ''
    };
    
    setFields([...fields, newField]);
  };

  const removeField = (fieldId: string) => {
    setFields(fields.filter(field => field.id !== fieldId));
  };

  const updateField = (fieldId: string, updates: Partial<TemplateField>) => {
    setFields(fields.map(field => 
      field.id === fieldId ? { ...field, ...updates } : field
    ));
  };

  const moveField = (fromIndex: number, toIndex: number) => {
    const newFields = [...fields];
    const [movedField] = newFields.splice(fromIndex, 1);
    newFields.splice(toIndex, 0, movedField);
    setFields(newFields);
  };

  const saveTemplate = async () => {
    try {
      setSaving(true);
      setError(null);

      // Валидируем поля
      const validFields = fields.filter(field => field.name.trim() !== '');
      if (validFields.length === 0) {
        throw new Error('Добавьте хотя бы одно поле');
      }

      // Проверяем уникальность имен полей
      const fieldNames = validFields.map(field => field.name);
      const uniqueNames = new Set(fieldNames);
      if (uniqueNames.size !== fieldNames.length) {
        throw new Error('Имена полей должны быть уникальными');
      }

      // Подготавливаем данные для сохранения
      const templateData = {
        templateId: template?.id,
        name: template?.name || 'Шаблон импорта',
        description: template?.description || 'Шаблон для импорта товаров',
        requiredFields: validFields.map(field => field.name),
        calculatorFields: validFields.filter(field => field.isCalculator).map(field => field.name),
        exportFields: validFields.filter(field => field.isExport).map(field => field.name)
      };

      const response = await fetch('/api/admin/templates', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(templateData)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Ошибка сохранения шаблона');
      }

      const result = await response.json();
      onSave(result.template);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Загрузка шаблона...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-lg shadow-lg">
        {/* Заголовок */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                Редактирование шаблона
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {template?.name || 'Шаблон импорта'}
              </p>
            </div>
            <div className="flex space-x-3">
              <Button
                onClick={onCancel}
                variant="outline"
                disabled={saving}
              >
                Отмена
              </Button>
              <Button
                onClick={saveTemplate}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? 'Сохранение...' : 'Сохранить'}
              </Button>
            </div>
          </div>
        </div>

        {/* Ошибки */}
        {error && (
          <div className="px-6 py-4 bg-red-50 border-b border-red-200">
            <div className="flex">
              <div className="text-red-600 text-sm">{error}</div>
            </div>
          </div>
        )}

        {/* Содержимое */}
        <div className="p-6">
          {/* Поля шаблона */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-900">Поля шаблона</h3>
              <Button
                onClick={addField}
                variant="outline"
                size="sm"
              >
                <Plus className="w-4 h-4 mr-2" />
                Добавить поле
              </Button>
            </div>

            {fields.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Settings className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                <p>Нет полей в шаблоне</p>
                <p className="text-sm">Добавьте поля для создания шаблона</p>
              </div>
            ) : (
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex items-start space-x-4">
                      {/* Drag handle */}
                      <div className="flex-shrink-0 pt-2">
                        <GripVertical className="w-5 h-5 text-gray-400 cursor-move" />
                      </div>

                      {/* Основная информация */}
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Название поля
                          </label>
                          <input
                            type="text"
                            value={field.name}
                            onChange={(e) => updateField(field.id, { name: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Введите название поля"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Отображаемое название
                          </label>
                          <input
                            type="text"
                            value={field.displayName}
                            onChange={(e) => updateField(field.id, { displayName: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Название для отображения"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Тип поля
                          </label>
                          <select
                            value={field.type}
                            onChange={(e) => updateField(field.id, { type: e.target.value as TemplateField['type'] })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="text">Текст</option>
                            <option value="number">Число</option>
                            <option value="select">Список</option>
                            <option value="boolean">Да/Нет</option>
                            <option value="date">Дата</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Описание
                          </label>
                          <input
                            type="text"
                            value={field.description || ''}
                            onChange={(e) => updateField(field.id, { description: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="Описание поля"
                          />
                        </div>
                      </div>

                      {/* Настройки поля */}
                      <div className="flex-shrink-0">
                        <div className="space-y-2">
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={field.isRequired}
                              onChange={(e) => updateField(field.id, { isRequired: e.target.checked })}
                              className="mr-2"
                            />
                            <span className="text-sm text-gray-700">Обязательное</span>
                          </label>
                          
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={field.isCalculator}
                              onChange={(e) => updateField(field.id, { isCalculator: e.target.checked })}
                              className="mr-2"
                            />
                            <span className="text-sm text-gray-700">Для калькулятора</span>
                          </label>
                          
                          <label className="flex items-center">
                            <input
                              type="checkbox"
                              checked={field.isExport}
                              onChange={(e) => updateField(field.id, { isExport: e.target.checked })}
                              className="mr-2"
                            />
                            <span className="text-sm text-gray-700">Для экспорта</span>
                          </label>
                        </div>
                      </div>

                      {/* Кнопка удаления */}
                      <div className="flex-shrink-0 pt-2">
                        <Button
                          onClick={() => removeField(field.id)}
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Опции для select */}
                    {field.type === 'select' && (
                      <div className="mt-4 ml-9">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Варианты выбора (через запятую)
                        </label>
                        <input
                          type="text"
                          value={field.options?.join(', ') || ''}
                          onChange={(e) => updateField(field.id, { 
                            options: e.target.value.split(',').map(opt => opt.trim()).filter(opt => opt) 
                          })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="Вариант 1, Вариант 2, Вариант 3"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateEditor;
