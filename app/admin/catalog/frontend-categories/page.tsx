'use client';

import React, { useState, useEffect } from 'react';
import { Button, Card, Badge, Input, Dialog, DialogContent, DialogHeader, DialogTitle, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Checkbox } from '../../../../components/ui';
import { Plus, Search, Edit, Trash2, Link, Eye, Settings } from 'lucide-react';
import { FrontendCategory, CreateFrontendCategoryDto, CatalogCategory, FrontendDisplayConfig } from '@/lib/types/catalog';
import { clientLogger } from '@/lib/logging/client-logger';

export default function FrontendCategoriesPage() {
  const [categories, setCategories] = useState<FrontendCategory[]>([]);
  const [catalogCategories, setCatalogCategories] = useState<CatalogCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState<FrontendCategory | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [categoriesRes, catalogRes] = await Promise.all([
        fetch('/api/frontend-categories'),
        fetch('/api/catalog/categories')
      ]);

      const categoriesData = await categoriesRes.json();
      const catalogData = await catalogRes.json();

      setCategories(categoriesData);
      setCatalogCategories(catalogData.categories || []);
    } catch (error) {
      clientLogger.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCategory = async (data: CreateFrontendCategoryDto) => {
    try {
      const response = await fetch('/api/frontend-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        await loadData();
        setCreateDialogOpen(false);
      }
    } catch (error) {
      clientLogger.error('Error creating category:', error);
    }
  };

  const handleEditCategory = async (data: Partial<CreateFrontendCategoryDto>) => {
    if (!categoryToEdit) return;

    try {
      const response = await fetch(`/api/frontend-categories/${categoryToEdit.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (response.ok) {
        await loadData();
        setEditDialogOpen(false);
        setCategoryToEdit(null);
      }
    } catch (error) {
      clientLogger.error('Error updating category:', error);
    }
  };

  const handleDeleteCategory = async (category: FrontendCategory) => {
    if (!confirm(`Удалить категорию "${category.name}"?`)) return;

    try {
      const response = await fetch(`/api/frontend-categories/${category.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadData();
      }
    } catch (error) {
      clientLogger.error('Error deleting category:', error);
    }
  };

  const getCatalogCategoryNames = (categoryIds: string[]): string[] => {
    return categoryIds
      .map(id => catalogCategories.find(c => c.id === id)?.name)
      .filter(Boolean) as string[];
  };

  const filteredCategories = categories.filter(category =>
    category.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    category.slug.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Загрузка категорий...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button
          onClick={() => setCreateDialogOpen(true)}
          className="flex items-center space-x-1"
        >
          <Plus className="h-4 w-4" />
          <span>Создать категорию</span>
        </Button>
      </div>

      {/* Фильтры */}
      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Поиск категорий..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <div className="flex items-center space-x-2">
            <Link className="h-4 w-4 text-gray-500" />
            <span className="text-sm text-gray-600">
              {categories.length} категорий конфигуратора
            </span>
          </div>
        </div>
      </Card>

      {/* Список категорий */}
      <Card className="p-4">
        <div className="space-y-2">
          {filteredCategories.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              {searchTerm ? 'Категории не найдены' : 'Категории конфигуратора не созданы'}
            </div>
          ) : (
            filteredCategories.map(category => {
              const catalogNames = getCatalogCategoryNames(category.catalog_category_ids);
              
              return (
                <div
                  key={category.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <h3 className="font-medium">{category.name}</h3>
                      <Badge variant="outline">/{category.slug}</Badge>
                      {category.is_active ? (
                        <Badge variant="default" className="bg-green-100 text-green-800">Активна</Badge>
                      ) : (
                        <Badge variant="secondary">Неактивна</Badge>
                      )}
                    </div>
                    
                    {category.description && (
                      <p className="text-sm text-gray-600 mt-1">{category.description}</p>
                    )}
                    
                    <div className="mt-2">
                      <p className="text-xs text-gray-500 mb-1">Связанные категории каталога:</p>
                      <div className="flex flex-wrap gap-1">
                        {catalogNames.map((name, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                      <span>ID: {category.id}</span>
                      <span>Создано: {new Date(category.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCategoryToEdit(category);
                        setEditDialogOpen(true);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteCategory(category)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      {/* Диалог создания категории */}
      <CreateFrontendCategoryDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSubmit={handleCreateCategory}
        catalogCategories={catalogCategories}
      />

      {/* Диалог редактирования категории */}
      <EditFrontendCategoryDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSubmit={handleEditCategory}
        category={categoryToEdit}
        catalogCategories={catalogCategories}
      />
    </div>
  );
}

type FrontendCategoryFormState = {
  name: string;
  slug: string;
  description: string;
  icon: string;
  catalog_category_ids: string[];
  display_config: FrontendDisplayConfig;
  is_active: boolean;
};

const defaultDisplayConfig: FrontendDisplayConfig = {
  layout: 'grid',
  show_filters: true,
  show_search: true,
  items_per_page: 20,
  sort_options: []
};

// Компоненты диалогов
function CreateFrontendCategoryDialog({ 
  open, 
  onOpenChange, 
  onSubmit, 
  catalogCategories
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateFrontendCategoryDto) => void;
  catalogCategories: CatalogCategory[];
}) {
  const [formData, setFormData] = useState<FrontendCategoryFormState>({
    name: '',
    slug: '',
    description: '',
    icon: '',
    catalog_category_ids: [],
    display_config: defaultDisplayConfig,
    is_active: true
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
    setFormData({
      name: '',
      slug: '',
      description: '',
      icon: '',
      catalog_category_ids: [],
      display_config: defaultDisplayConfig,
      is_active: true
    });
  };

  const toggleCatalogCategory = (categoryId: string) => {
    setFormData(prev => ({
      ...prev,
      catalog_category_ids: prev.catalog_category_ids.includes(categoryId)
        ? prev.catalog_category_ids.filter(id => id !== categoryId)
        : [...prev.catalog_category_ids, categoryId]
    }));
  };

  // Автоматически генерируем slug из названия
  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9а-я\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-')
      .trim();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Создать категорию конфигуратора</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Название</label>
              <Input
                value={formData.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setFormData(prev => ({
                    ...prev,
                    name,
                    slug: generateSlug(name)
                  }));
                }}
                placeholder="Введите название категории"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">URL (slug)</label>
              <Input
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="url-category"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Описание</label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Описание категории (необязательно)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Иконка</label>
            <Input
              value={formData.icon}
              onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
              placeholder="название иконки"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-3">Связать с категориями каталога:</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto border rounded-lg p-3">
              {catalogCategories.map(category => (
                <div
                  key={category.id}
                  className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                  onClick={() => toggleCatalogCategory(category.id)}
                >
                  <Checkbox
                    checked={formData.catalog_category_ids.includes(category.id)}
                    onCheckedChange={() => toggleCatalogCategory(category.id)}
                  />
                  <span className="text-sm">{category.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    L{category.level}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-medium">Настройки отображения:</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Макет</label>
                <Select value={formData.display_config.layout} onValueChange={(value: string) => 
                  setFormData(prev => ({
                    ...prev,
                    display_config: { ...prev.display_config, layout: value as 'grid' | 'list' | 'table' }
                  }))
                }>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grid">Сетка</SelectItem>
                    <SelectItem value="list">Список</SelectItem>
                    <SelectItem value="table">Таблица</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Товаров на странице</label>
                <Input
                  type="number"
                  value={formData.display_config.items_per_page}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    display_config: { 
                      ...prev.display_config, 
                      items_per_page: parseInt(e.target.value) || 20 
                    }
                  }))}
                  min="1"
                  max="100"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show_filters"
                  checked={formData.display_config.show_filters}
                  onCheckedChange={(checked) => setFormData(prev => ({
                    ...prev,
                    display_config: { ...prev.display_config, show_filters: !!checked }
                  }))}
                />
                <label htmlFor="show_filters" className="text-sm font-medium">Показывать фильтры</label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show_search"
                  checked={formData.display_config.show_search}
                  onCheckedChange={(checked) => setFormData(prev => ({
                    ...prev,
                    display_config: { ...prev.display_config, show_search: !!checked }
                  }))}
                />
                <label htmlFor="show_search" className="text-sm font-medium">Показывать поиск</label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: !!checked })}
                />
                <label htmlFor="is_active" className="text-sm font-medium">Активна</label>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={formData.catalog_category_ids.length === 0}>
              Создать
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditFrontendCategoryDialog({ 
  open, 
  onOpenChange, 
  onSubmit, 
  category,
  catalogCategories
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: Partial<CreateFrontendCategoryDto>) => void;
  category: FrontendCategory | null;
  catalogCategories: CatalogCategory[];
}) {
  const [formData, setFormData] = useState<FrontendCategoryFormState>({
    name: '',
    slug: '',
    description: '',
    icon: '',
    catalog_category_ids: [],
    display_config: defaultDisplayConfig,
    is_active: true
  });

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name,
        slug: category.slug,
        description: category.description || '',
        icon: category.icon || '',
        catalog_category_ids: category.catalog_category_ids,
        display_config: category.display_config ?? defaultDisplayConfig,
        is_active: category.is_active
      });
    }
  }, [category]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const toggleCatalogCategory = (categoryId: string) => {
    setFormData(prev => ({
      ...prev,
      catalog_category_ids: prev.catalog_category_ids.includes(categoryId)
        ? prev.catalog_category_ids.filter(id => id !== categoryId)
        : [...prev.catalog_category_ids, categoryId]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Редактировать категорию конфигуратора</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Название</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Введите название категории"
                required
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-1">URL (slug)</label>
              <Input
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="url-category"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Описание</label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Описание категории (необязательно)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Иконка</label>
            <Input
              value={formData.icon}
              onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
              placeholder="название иконки"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-3">Связать с категориями каталога:</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto border rounded-lg p-3">
              {catalogCategories.map(cat => (
                <div
                  key={cat.id}
                  className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                  onClick={() => toggleCatalogCategory(cat.id)}
                >
                  <Checkbox
                    checked={formData.catalog_category_ids.includes(cat.id)}
                    onCheckedChange={() => toggleCatalogCategory(cat.id)}
                  />
                  <span className="text-sm">{cat.name}</span>
                  <Badge variant="secondary" className="text-xs">
                    L{cat.level}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="font-medium">Настройки отображения:</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Макет</label>
                <Select value={formData.display_config.layout} onValueChange={(value: string) => 
                  setFormData(prev => ({
                    ...prev,
                    display_config: { ...prev.display_config, layout: value as 'grid' | 'list' | 'table' }
                  }))
                }>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="grid">Сетка</SelectItem>
                    <SelectItem value="list">Список</SelectItem>
                    <SelectItem value="table">Таблица</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Товаров на странице</label>
                <Input
                  type="number"
                  value={formData.display_config.items_per_page}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    display_config: { 
                      ...prev.display_config, 
                      items_per_page: parseInt(e.target.value) || 20 
                    }
                  }))}
                  min="1"
                  max="100"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show_filters_edit"
                  checked={formData.display_config.show_filters}
                  onCheckedChange={(checked) => setFormData(prev => ({
                    ...prev,
                    display_config: { ...prev.display_config, show_filters: !!checked }
                  }))}
                />
                <label htmlFor="show_filters_edit" className="text-sm font-medium">Показывать фильтры</label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="show_search_edit"
                  checked={formData.display_config.show_search}
                  onCheckedChange={(checked) => setFormData(prev => ({
                    ...prev,
                    display_config: { ...prev.display_config, show_search: !!checked }
                  }))}
                />
                <label htmlFor="show_search_edit" className="text-sm font-medium">Показывать поиск</label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_active_edit"
                  checked={formData.is_active}
                  onCheckedChange={(checked) => setFormData({ ...formData, is_active: !!checked })}
                />
                <label htmlFor="is_active_edit" className="text-sm font-medium">Активна</label>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit">
              Сохранить
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
