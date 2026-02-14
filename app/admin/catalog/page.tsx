'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Checkbox, Input } from '../../../components/ui';
import CatalogTree from '../../../components/admin/CatalogTree';
import { fetchWithAuth } from '@/lib/utils/fetch-with-auth';
import { parseApiResponse } from '@/lib/utils/parse-api-response';
import { clientLogger } from '@/lib/logging/client-logger';

interface CatalogCategoryFlat {
  id: string;
  name: string;
  level: number;
  parent_id?: string | null;
  product_count?: number;
  displayName?: string;
}

interface Product {
  id: string;
  sku: string;
  name: string;
  base_price: number;
  stock_quantity: number;
  is_active?: boolean;
  properties_data?: Record<string, unknown> | string | null;
  images?: Array<{ id: string; url: string; is_primary?: boolean; sort_order?: number }>;
}

interface EditingCellState {
  productId: string;
  key: string;
  value: string;
}

const REQUIRED_DOOR_KEYS = [
  'Код модели Domeo (Web)',
  'Domeo_Название модели для Web',
  'Domeo_Цвет',
  'Domeo_Покрытие',
  'Domeo_Ширина',
  'Domeo_Высота',
];
const ATTR_PAGE_SIZE = 8;

function parseProps(value: Product['properties_data']): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
}

function stringifyValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function parseEditedValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed.length) return '';
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (!Number.isNaN(Number(trimmed)) && trimmed === String(Number(trimmed))) {
    return Number(trimmed);
  }
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  return raw;
}

function extractPhotoUrls(product: Product): string[] {
  const props = parseProps(product.properties_data);
  const urls: string[] = [];
  const propsPhotos = props.photos;
  if (Array.isArray(propsPhotos)) {
    propsPhotos.forEach((photo) => {
      if (typeof photo === 'string') {
        urls.push(photo);
      } else if (photo && typeof photo === 'object' && 'url' in photo && typeof photo.url === 'string') {
        urls.push(photo.url);
      }
    });
  }
  (product.images || []).forEach((img) => {
    if (img?.url) urls.push(img.url);
  });
  return urls;
}

function photoIssues(product: Product): string[] {
  const urls = extractPhotoUrls(product);
  if (!urls.length) return ['Нет фото'];
  const broken = urls.filter(
    (url) =>
      !url ||
      !(url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) ||
      url.includes('undefined') ||
      url.includes('null'),
  );
  return broken.length ? [`Битые ссылки: ${broken.length}`] : [];
}

function missingRequiredIssues(product: Product): string[] {
  const props = parseProps(product.properties_data);
  const missing = REQUIRED_DOOR_KEYS.filter((key) => {
    const value = props[key];
    return value == null || String(value).trim() === '';
  });
  return missing.length ? [`Пустые поля: ${missing.length}`] : [];
}

export default function CatalogPage() {
  const router = useRouter();

  const [accessChecked, setAccessChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  const [categories, setCategories] = useState<CatalogCategoryFlat[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [selectedProductId, setSelectedProductId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [editingCell, setEditingCell] = useState<EditingCellState | null>(null);
  const [savingCell, setSavingCell] = useState(false);
  const [bulkKey, setBulkKey] = useState('');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [showAllAttributes, setShowAllAttributes] = useState(false);
  const [attributePage, setAttributePage] = useState(0);

  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === selectedCategoryId) || null,
    [categories, selectedCategoryId],
  );

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId],
  );

  const visibleProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const q = productSearch.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        String(p.base_price ?? '').includes(q),
    );
  }, [products, productSearch]);

  const visibleIds = useMemo(() => visibleProducts.map((p) => p.id), [visibleProducts]);

  const attributeKeys = useMemo(() => {
    const keys = new Set<string>();
    visibleProducts.forEach((p) => {
      const props = parseProps(p.properties_data);
      Object.keys(props).forEach((k) => {
        if (!['photos', 'images', 'id', 'created_at', 'updated_at'].includes(k)) keys.add(k);
      });
    });
    return Array.from(keys).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [visibleProducts]);
  const attributePageCount = useMemo(
    () => Math.max(1, Math.ceil(attributeKeys.length / ATTR_PAGE_SIZE)),
    [attributeKeys.length],
  );
  const visibleAttributeKeys = useMemo(() => {
    if (showAllAttributes) return attributeKeys;
    const start = attributePage * ATTR_PAGE_SIZE;
    return attributeKeys.slice(start, start + ATTR_PAGE_SIZE);
  }, [showAllAttributes, attributeKeys, attributePage]);

  useEffect(() => {
    if (attributePage > attributePageCount - 1) {
      setAttributePage(Math.max(0, attributePageCount - 1));
    }
  }, [attributePage, attributePageCount]);

  const checkAccess = async () => {
    try {
      const response = await fetchWithAuth('/api/users/me');
      if (!response.ok) {
        router.push('/auth/unauthorized');
        return;
      }
      const payload = await response.json();
      const data = parseApiResponse<{ user?: { role?: string } }>(payload);
      if (data?.user?.role !== 'admin') {
        router.push('/auth/unauthorized');
        return;
      }
      setHasAccess(true);
      setAccessChecked(true);
    } catch (e) {
      clientLogger.error('Access check failed', e);
      router.push('/auth/unauthorized');
    }
  };

  const loadCategories = async () => {
    setCategoriesLoading(true);
    try {
      const response = await fetchWithAuth('/api/catalog/categories-flat');
      if (!response.ok) {
        setCategories([]);
        return;
      }
      const payload = await response.json();
      const data = parseApiResponse<{ categories?: CatalogCategoryFlat[] }>(payload);
      setCategories(data?.categories || []);
    } catch (e) {
      clientLogger.error('loadCategories failed', e);
      setCategories([]);
    } finally {
      setCategoriesLoading(false);
    }
  };

  const loadProducts = async (categoryId: string) => {
    if (!categoryId) {
      setProducts([]);
      return;
    }
    setProductsLoading(true);
    try {
      const params = new URLSearchParams({
        categoryId,
        limit: '1000',
      });
      const response = await fetchWithAuth(`/api/catalog/products?${params.toString()}`);
      if (!response.ok) {
        setProducts([]);
        return;
      }
      const payload = await response.json();
      const data = parseApiResponse<{ products?: Product[] }>(payload);
      setProducts(data?.products || []);
      setSelectedProductId('');
      setSelectedIds([]);
      setEditingCell(null);
    } catch (e) {
      clientLogger.error('loadProducts failed', e);
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  };

  useEffect(() => {
    checkAccess();
  }, []);

  useEffect(() => {
    if (accessChecked && hasAccess) loadCategories();
  }, [accessChecked, hasAccess]);

  useEffect(() => {
    if (selectedCategoryId) loadProducts(selectedCategoryId);
  }, [selectedCategoryId]);

  const saveProductProps = async (productId: string, nextProps: Record<string, unknown>) => {
    const response = await fetchWithAuth(`/api/admin/products/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties_data: nextProps }),
    });
    if (!response.ok) {
      throw new Error('Не удалось сохранить атрибут');
    }
    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, properties_data: nextProps } : p)),
    );
  };

  const commitEditingCell = async () => {
    if (!editingCell) return;
    const product = products.find((p) => p.id === editingCell.productId);
    if (!product) {
      setEditingCell(null);
      return;
    }
    const currentProps = parseProps(product.properties_data);
    const nextValue = parseEditedValue(editingCell.value);
    const prevValue = currentProps[editingCell.key];
    if (stringifyValue(prevValue) === stringifyValue(nextValue)) {
      setEditingCell(null);
      return;
    }
    setSavingCell(true);
    try {
      await saveProductProps(product.id, { ...currentProps, [editingCell.key]: nextValue });
      setEditingCell(null);
    } catch (e) {
      clientLogger.error('Inline save failed', e);
      alert('Ошибка сохранения атрибута');
    } finally {
      setSavingCell(false);
    }
  };

  const toggleSelectedId = (id: string, checked: boolean) => {
    setSelectedIds((prev) => (checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)));
  };

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      if (checked) return Array.from(new Set([...prev, ...visibleIds]));
      const visibleSet = new Set(visibleIds);
      return prev.filter((id) => !visibleSet.has(id));
    });
  };

  const applyBulkEdit = async () => {
    if (!bulkKey.trim() || selectedIds.length === 0) return;
    setBulkSaving(true);
    let ok = 0;
    let failed = 0;
    try {
      const target = products.filter((p) => selectedIds.includes(p.id));
      await Promise.all(
        target.map(async (product) => {
          try {
            const props = parseProps(product.properties_data);
            const nextProps = { ...props, [bulkKey.trim()]: parseEditedValue(bulkValue) };
            await saveProductProps(product.id, nextProps);
            ok += 1;
          } catch {
            failed += 1;
          }
        }),
      );
      alert(`Массовое обновление завершено. Успешно: ${ok}, ошибок: ${failed}`);
    } finally {
      setBulkSaving(false);
    }
  };

  if (!accessChecked) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Проверка доступа...</div>
      </div>
    );
  }

  if (!hasAccess) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Каталог</h1>
          <p className="text-sm text-gray-600">Дерево категорий и атрибуты товаров</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => router.push('/admin/catalog/import')}
          >
            Импорт doors
          </Button>
          <Button variant="outline" onClick={() => selectedCategoryId && loadProducts(selectedCategoryId)}>
            Обновить товары
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-4 lg:col-span-1">
          <h2 className="text-lg font-semibold mb-3">Дерево каталога</h2>
          <Input
            placeholder="Поиск категории..."
            value={categorySearch}
            onChange={(e) => setCategorySearch(e.target.value)}
            className="mb-3"
          />
          {categoriesLoading ? (
            <div className="text-sm text-gray-500">Загрузка категорий...</div>
          ) : (
            <CatalogTree
              categories={categories.map(c => ({ ...c, parent_id: c.parent_id ?? undefined }))}
              selectedCategoryId={selectedCategoryId}
              onCategorySelect={setSelectedCategoryId}
              searchTerm={categorySearch}
            />
          )}
        </Card>

        <Card className="p-4 lg:col-span-2 space-y-4">
          {!selectedCategory ? (
            <div className="text-gray-500">Выберите категорию слева.</div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{selectedCategory.name}</h2>
                  <p className="text-sm text-gray-600">
                    ID: {selectedCategory.id} • Товаров: {selectedCategory.product_count ?? 0}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  placeholder="Поиск по SKU/названию/цене..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
                <span className="text-sm text-gray-600 whitespace-nowrap">
                  {visibleProducts.length}/{products.length}
                </span>
              </div>

              <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <div className="text-sm font-medium mb-2">Массовое редактирование выбранных товаров</div>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    placeholder="Ключ атрибута (например Domeo_Цвет)"
                    value={bulkKey}
                    onChange={(e) => setBulkKey(e.target.value)}
                    className="min-w-[280px]"
                  />
                  <Input
                    placeholder="Новое значение"
                    value={bulkValue}
                    onChange={(e) => setBulkValue(e.target.value)}
                    className="min-w-[220px]"
                  />
                  <Button
                    onClick={applyBulkEdit}
                    disabled={bulkSaving || !bulkKey.trim() || selectedIds.length === 0}
                  >
                    {bulkSaving ? 'Сохраняю...' : `Применить к выбранным (${selectedIds.length})`}
                  </Button>
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-3 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-gray-700">
                    Атрибуты в таблице:{' '}
                    <span className="font-medium">
                      {showAllAttributes ? `все (${attributeKeys.length})` : `${visibleAttributeKeys.length} из ${attributeKeys.length}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setShowAllAttributes((v) => !v)}
                    >
                      {showAllAttributes ? 'Показать блоками' : 'Показать все'}
                    </Button>
                    {!showAllAttributes && (
                      <>
                        <Button
                          variant="outline"
                          onClick={() => setAttributePage((p) => Math.max(0, p - 1))}
                          disabled={attributePage === 0}
                        >
                          ←
                        </Button>
                        <span className="text-sm text-gray-600">
                          {attributePage + 1}/{attributePageCount}
                        </span>
                        <Button
                          variant="outline"
                          onClick={() => setAttributePage((p) => Math.min(attributePageCount - 1, p + 1))}
                          disabled={attributePage >= attributePageCount - 1}
                        >
                          →
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {productsLoading ? (
                <div className="text-sm text-gray-500">Загрузка товаров...</div>
              ) : visibleProducts.length === 0 ? (
                <div className="text-sm text-gray-500">В категории нет товаров.</div>
              ) : (
                <div className="space-y-4">
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left sticky left-0 bg-gray-50 z-20">
                            <Checkbox
                              checked={visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))}
                              onCheckedChange={toggleSelectAllVisible}
                            />
                          </th>
                          <th className="px-3 py-2 text-left sticky left-[52px] bg-gray-50 z-20">SKU</th>
                          <th className="px-3 py-2 text-left sticky left-[240px] bg-gray-50 z-20">Название</th>
                          <th className="px-3 py-2 text-left sticky left-[520px] bg-gray-50 z-20">Цена</th>
                          <th className="px-3 py-2 text-left sticky left-[620px] bg-gray-50 z-20">Проблемы</th>
                          {visibleAttributeKeys.map((k) => (
                            <th key={k} className="px-3 py-2 text-left whitespace-nowrap">
                              {k}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleProducts.map((p) => {
                          const props = parseProps(p.properties_data);
                          const selected = p.id === selectedProductId;
                          const issues = [...photoIssues(p), ...missingRequiredIssues(p)];
                          return (
                            <tr
                              key={p.id}
                              className={`border-t cursor-pointer ${selected ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                              onClick={() => setSelectedProductId(p.id)}
                            >
                              <td className="px-3 py-2 whitespace-nowrap sticky left-0 bg-white z-10" onClick={(e) => e.stopPropagation()}>
                                <Checkbox
                                  checked={selectedIds.includes(p.id)}
                                  onCheckedChange={(checked) => toggleSelectedId(p.id, checked)}
                                />
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap sticky left-[52px] bg-white z-10">{p.sku}</td>
                              <td className="px-3 py-2 whitespace-nowrap sticky left-[240px] bg-white z-10">{p.name}</td>
                              <td className="px-3 py-2 whitespace-nowrap sticky left-[520px] bg-white z-10">{p.base_price ?? 0}</td>
                              <td className="px-3 py-2 whitespace-nowrap sticky left-[620px] bg-white z-10">
                                {issues.length === 0 ? (
                                  <span className="text-green-700">OK</span>
                                ) : (
                                  <span className="text-amber-700">{issues.join(' | ')}</span>
                                )}
                              </td>
                              {visibleAttributeKeys.map((k) => (
                                <td
                                  key={k}
                                  className="px-3 py-2 whitespace-nowrap"
                                  onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setEditingCell({
                                      productId: p.id,
                                      key: k,
                                      value: stringifyValue(props[k]),
                                    });
                                  }}
                                >
                                  {editingCell?.productId === p.id && editingCell.key === k ? (
                                    <Input
                                      value={editingCell.value}
                                      onChange={(e) =>
                                        setEditingCell((prev) => (prev ? { ...prev, value: e.target.value } : prev))
                                      }
                                      onBlur={commitEditingCell}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') commitEditingCell();
                                        if (e.key === 'Escape') setEditingCell(null);
                                      }}
                                      disabled={savingCell}
                                      autoFocus
                                      className="min-w-[200px]"
                                    />
                                  ) : props[k] == null || props[k] === '' ? (
                                    '-'
                                  ) : (
                                    String(props[k])
                                  )}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {selectedProduct && (
                    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                      <div className="font-medium mb-2">Атрибуты товара: {selectedProduct.name}</div>
                      <div className="overflow-auto border border-gray-200 rounded bg-white">
                        <table className="min-w-full text-xs">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-2 py-1 text-left">Ключ</th>
                              <th className="px-2 py-1 text-left">Значение</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Object.entries(parseProps(selectedProduct.properties_data))
                              .sort((a, b) => a[0].localeCompare(b[0], 'ru'))
                              .map(([key, value]) => (
                                <tr key={key} className="border-t">
                                  <td className="px-2 py-1 whitespace-nowrap">{key}</td>
                                  <td className="px-2 py-1">{stringifyValue(value) || '-'}</td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

