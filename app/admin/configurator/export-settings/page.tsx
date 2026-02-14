'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Card, Input, Select, Alert, LoadingSpinner } from '@/components/ui';
import { Plus, Trash2, Settings, FileText, Download } from 'lucide-react';

interface ExportSetting {
  id: string;
  name: string;
  document_type: 'quote' | 'invoice' | 'order';
  configurator_category_id: string;
  template_config: {
    show_header: boolean;
    show_footer: boolean;
    show_discount: boolean;
    discount_type: 'percentage' | 'fixed';
    discount_value: number;
    show_tax: boolean;
    tax_rate: number;
    fields: string[];
    custom_fields: Record<string, any>;
  };
  created_at: string;
  updated_at: string;
}

interface ConfiguratorCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
}

export default function ExportSettingsPage() {
  const [configuratorCategories, setConfiguratorCategories] = useState<ConfiguratorCategory[]>([]);
  const [selectedConfiguratorCategory, setSelectedConfiguratorCategory] = useState<string>('');
  const [exportSettings, setExportSettings] = useState<ExportSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [newSetting, setNewSetting] = useState({
    name: '',
    document_type: 'quote' as 'quote' | 'invoice' | 'order',
    template_config: {
      show_header: true,
      show_footer: true,
      show_discount: false,
      discount_type: 'percentage' as 'percentage' | 'fixed',
      discount_value: 0,
      show_tax: true,
      tax_rate: 20,
      fields: [] as string[],
      custom_fields: {}
    }
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/categories');
      const data = await response.json();
      setConfiguratorCategories(data.categories || []);
    } catch (error) {
      setAlert({ type: 'error', message: 'Ошибка загрузки данных' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const fetchExportSettings = useCallback(async () => {
    if (!selectedConfiguratorCategory) return;

    try {
      const response = await fetch(`/api/configurator/export-settings?configuratorCategoryId=${selectedConfiguratorCategory}`);
      const data = await response.json();
      
      if (data.success) {
        setExportSettings(data.settings || []);
      } else {
        setAlert({ type: 'error', message: 'Ошибка загрузки настроек экспорта' });
      }
    } catch (error) {
      setAlert({ type: 'error', message: 'Ошибка загрузки настроек экспорта' });
    }
  }, [selectedConfiguratorCategory]);

  useEffect(() => {
    if (selectedConfiguratorCategory) {
      fetchExportSettings();
    }
  }, [selectedConfiguratorCategory, fetchExportSettings]);

  const handleCreateSetting = async () => {
    if (!selectedConfiguratorCategory || !newSetting.name) {
      setAlert({ type: 'error', message: 'Заполните все обязательные поля' });
      return;
    }

    try {
      const response = await fetch('/api/configurator/export-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          configurator_category_id: selectedConfiguratorCategory,
          ...newSetting
        })
      });

      const data = await response.json();

      if (data.success) {
        setAlert({ type: 'success', message: 'Настройка экспорта создана успешно' });
        setShowCreateModal(false);
        setNewSetting({
          name: '',
          document_type: 'quote',
          template_config: {
            show_header: true,
            show_footer: true,
            show_discount: false,
            discount_type: 'percentage',
            discount_value: 0,
            show_tax: true,
            tax_rate: 20,
            fields: [],
            custom_fields: {}
          }
        });
        fetchExportSettings();
      } else {
        setAlert({ type: 'error', message: data.error || 'Ошибка создания настройки' });
      }
    } catch (error) {
      setAlert({ type: 'error', message: 'Ошибка создания настройки' });
    }
  };

  const handleDeleteSetting = async (settingId: string) => {
    if (!confirm('Удалить настройку экспорта?')) return;

    try {
      const response = await fetch(`/api/configurator/export-settings/${settingId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (data.success) {
        setAlert({ type: 'success', message: 'Настройка экспорта удалена успешно' });
        fetchExportSettings();
      } else {
        setAlert({ type: 'error', message: data.error || 'Ошибка удаления настройки' });
      }
    } catch (error) {
      setAlert({ type: 'error', message: 'Ошибка удаления настройки' });
    }
  };

  const getDocumentTypeLabel = (type: string) => {
    switch (type) {
      case 'quote': return 'Коммерческое предложение';
      case 'invoice': return 'Счет';
      case 'order': return 'Заказ поставщику';
      default: return type;
    }
  };

  const getDocumentTypeIcon = (type: string) => {
    switch (type) {
      case 'quote': return '📄';
      case 'invoice': return '🧾';
      case 'order': return '📦';
      default: return '📄';
    }
  };

  const selectedConfigurator = configuratorCategories.find(cat => cat.id === selectedConfiguratorCategory);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <LoadingSpinner size="lg" color="black" text="Загрузка данных..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Настройки экспорта</h1>
            <p className="text-gray-600 mt-2">Управление шаблонами экспорта для категорий конфигуратора</p>
          </div>
        </div>

        {/* Alert */}
        {alert && (
          <Alert
            variant={alert.type === 'error' ? 'error' : 'success'}
            onClose={() => setAlert(null)}
            className="mb-6"
          >
            {alert.message}
          </Alert>
        )}

        {/* Выбор категории конфигуратора */}
        <Card className="p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">Выберите категорию конфигуратора</h2>
          <Select
            value={selectedConfiguratorCategory}
            onValueChange={setSelectedConfiguratorCategory}
            placeholder="Выберите категорию"
          >
            {configuratorCategories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Card>

        {selectedConfiguratorCategory && (
          <>
            {/* Информация о выбранной категории */}
            <Card className="p-6 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {selectedConfigurator?.name}
                  </h2>
                  <p className="text-gray-600">{selectedConfigurator?.description}</p>
                </div>
                <Button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center space-x-2"
                >
                  <Plus className="h-4 w-4" />
                  <span>Добавить настройку</span>
                </Button>
              </div>
            </Card>

            {/* Список настроек экспорта */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Настройки экспорта</h3>
              
              {exportSettings.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p className="text-lg font-medium mb-2">Настройки не найдены</p>
                  <p className="text-sm">Создайте настройки экспорта для различных типов документов</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {exportSettings.map(setting => (
                    <div key={setting.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-2">
                          <span className="text-2xl">{getDocumentTypeIcon(setting.document_type)}</span>
                          <div>
                            <h4 className="font-medium text-gray-900">{setting.name}</h4>
                            <p className="text-sm text-gray-600">
                              {getDocumentTypeLabel(setting.document_type)}
                            </p>
                          </div>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteSetting(setting.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      
                      <div className="space-y-2 text-sm text-gray-600">
                        <div className="flex justify-between">
                          <span>Заголовок:</span>
                          <span>{setting.template_config.show_header ? 'Да' : 'Нет'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Подвал:</span>
                          <span>{setting.template_config.show_footer ? 'Да' : 'Нет'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Скидка:</span>
                          <span>{setting.template_config.show_discount ? 'Да' : 'Нет'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>НДС:</span>
                          <span>{setting.template_config.show_tax ? `${setting.template_config.tax_rate}%` : 'Нет'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Поля:</span>
                          <span>{setting.template_config.fields.length}</span>
                        </div>
                      </div>
                      
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full flex items-center justify-center space-x-2"
                        >
                          <Settings className="h-4 w-4" />
                          <span>Редактировать</span>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}

        {/* Modal создания настройки */}
        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-semibold mb-4">Добавить настройку экспорта</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Название настройки
                  </label>
                  <Input
                    value={newSetting.name}
                    onChange={(e) => setNewSetting({ ...newSetting, name: e.target.value })}
                    placeholder="Например: КП для дверей"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Тип документа
                  </label>
                  <Select
                    value={newSetting.document_type}
                    onValueChange={(value: string) => setNewSetting({ ...newSetting, document_type: value as 'quote' | 'invoice' | 'order' })}
                  >
                    <option value="quote">Коммерческое предложение</option>
                    <option value="invoice">Счет</option>
                    <option value="order">Заказ поставщику</option>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="show_header"
                      checked={newSetting.template_config.show_header}
                      onChange={(e) => setNewSetting({
                        ...newSetting,
                        template_config: { ...newSetting.template_config, show_header: e.target.checked }
                      })}
                      className="rounded"
                    />
                    <label htmlFor="show_header" className="text-sm font-medium text-gray-700">
                      Показывать заголовок
                    </label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="show_footer"
                      checked={newSetting.template_config.show_footer}
                      onChange={(e) => setNewSetting({
                        ...newSetting,
                        template_config: { ...newSetting.template_config, show_footer: e.target.checked }
                      })}
                      className="rounded"
                    />
                    <label htmlFor="show_footer" className="text-sm font-medium text-gray-700">
                      Показывать подвал
                    </label>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="show_discount"
                    checked={newSetting.template_config.show_discount}
                    onChange={(e) => setNewSetting({
                      ...newSetting,
                      template_config: { ...newSetting.template_config, show_discount: e.target.checked }
                    })}
                    className="rounded"
                  />
                  <label htmlFor="show_discount" className="text-sm font-medium text-gray-700">
                    Показывать скидку
                  </label>
                </div>

                {newSetting.template_config.show_discount && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Тип скидки
                      </label>
                      <Select
                        value={newSetting.template_config.discount_type}
                        onValueChange={(value: string) => setNewSetting({
                          ...newSetting,
                          template_config: { ...newSetting.template_config, discount_type: value as 'percentage' | 'fixed' }
                        })}
                      >
                        <option value="percentage">Процент</option>
                        <option value="fixed">Фиксированная сумма</option>
                      </Select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Значение скидки
                      </label>
                      <Input
                        type="number"
                        value={newSetting.template_config.discount_value}
                        onChange={(e) => setNewSetting({
                          ...newSetting,
                          template_config: { ...newSetting.template_config, discount_value: parseFloat(e.target.value) || 0 }
                        })}
                        placeholder="0"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="show_tax"
                    checked={newSetting.template_config.show_tax}
                    onChange={(e) => setNewSetting({
                      ...newSetting,
                      template_config: { ...newSetting.template_config, show_tax: e.target.checked }
                    })}
                    className="rounded"
                  />
                  <label htmlFor="show_tax" className="text-sm font-medium text-gray-700">
                    Показывать НДС
                  </label>
                </div>

                {newSetting.template_config.show_tax && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Ставка НДС (%)
                    </label>
                    <Input
                      type="number"
                      value={newSetting.template_config.tax_rate}
                      onChange={(e) => setNewSetting({
                        ...newSetting,
                        template_config: { ...newSetting.template_config, tax_rate: parseFloat(e.target.value) || 0 }
                      })}
                      placeholder="20"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <Button
                  variant="ghost"
                  onClick={() => setShowCreateModal(false)}
                >
                  Отмена
                </Button>
                <Button
                  onClick={handleCreateSetting}
                  disabled={!newSetting.name}
                >
                  Создать
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}