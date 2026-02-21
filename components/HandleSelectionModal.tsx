'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { Info } from 'lucide-react';
import { Button } from './ui';
import { parseAndNormalizeColor } from '@/lib/handle-color-normalize';
import { getImageSrc, getHandleImageSrc } from '@/lib/configurator/image-src';

type Handle = {
  id: string;
  name: string;
  group: string;
  price: number;
  isBasic: boolean;
  showroom: boolean;
  supplier?: string;
  article?: string;
  factoryName?: string;
  photos?: string[];
  /** Цвет для фильтра (из БД) */
  color?: string | null;
  /** Описание ручки (из БД) */
  description?: string | null;
};

interface HandleSelectionModalProps {
  handles: Record<string, Handle[]>;
  selectedHandleId?: string;
  onSelect: (handleId: string) => void;
  onClose: () => void;
}

/** Эффективный цвет ручки: из БД (handle.color) или из названия. Возвращает { key, label } для фильтра. */
function getEffectiveColor(handle: Handle): { key: string; label: string } {
  const fromDb = (handle.color || '').trim();
  if (fromDb) {
    const key = fromDb.toLowerCase();
    return { key, label: fromDb.charAt(0).toUpperCase() + fromDb.slice(1) };
  }
  const { key, label } = parseAndNormalizeColor(handle.name);
  return { key, label };
}

/** Диапазоны цен для фильтра «По цене» */
const PRICE_RANGES = [
  { id: '0-3000', label: 'до 3 000 Р', min: 0, max: 3000 },
  { id: '3000-5000', label: '3 000 – 5 000 Р', min: 3000, max: 5000 },
  { id: '5000+', label: 'от 5 000 Р', min: 5000, max: null as number | null },
];

export default function HandleSelectionModal({
  handles,
  selectedHandleId,
  onSelect,
  onClose
}: HandleSelectionModalProps) {
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [selectedPriceRangeIds, setSelectedPriceRangeIds] = useState<string[]>([]);
  const [zoomPhoto, setZoomPhoto] = useState<string | null>(null);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);

  const allHandlesList = useMemo(() => {
    const list: Handle[] = [];
    Object.values(handles).forEach((arr) => list.push(...(arr || [])));
    return list;
  }, [handles]);

  const colorOptions = useMemo(() => {
    const byColor: Record<string, { minPrice: number; label: string }> = {};
    allHandlesList.forEach((h) => {
      const { key, label } = getEffectiveColor(h);
      if (!key) return;
      if (byColor[key]) {
        byColor[key].minPrice = Math.min(byColor[key].minPrice, h.price || 0);
      } else {
        byColor[key] = { minPrice: h.price || 0, label };
      }
    });
    return Object.entries(byColor)
      .map(([key, { minPrice, label }]) => ({ key, label, minPrice }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allHandlesList]);

  const toggleColor = (key: string) => {
    setSelectedColors((prev) =>
      prev.includes(key) ? prev.filter((c) => c !== key) : [...prev, key]
    );
  };

  const togglePriceRange = (id: string) => {
    setSelectedPriceRangeIds((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]
    );
  };

  const filteredHandles = useMemo(() => {
    let list = allHandlesList;
    if (selectedColors.length > 0) {
      const colorSet = new Set(selectedColors);
      list = list.filter((h) => colorSet.has(getEffectiveColor(h).key));
    }
    if (selectedPriceRangeIds.length > 0) {
      const ranges = PRICE_RANGES.filter((r) => selectedPriceRangeIds.includes(r.id));
      list = list.filter((h) => {
        const p = h.price || 0;
        return ranges.some((r) => r.min <= p && (r.max == null || p <= r.max));
      });
    }
    return list;
  }, [allHandlesList, selectedColors, selectedPriceRangeIds]);

  const [descriptionForHandleId, setDescriptionForHandleId] = useState<string | null>(null);

  const getNormalizedPhotoUrl = (photoPath: string, handleName?: string) =>
    getHandleImageSrc(photoPath, handleName);
  
  const allPhotosInGroup = filteredHandles
    .flatMap(handle => handle.photos || [])
    .filter(photo => photo);

  const getCurrentHandleName = () => {
    if (!zoomPhoto || allPhotosInGroup.length === 0) return '';
    const currentPhoto = allPhotosInGroup[currentPhotoIndex];
    if (!currentPhoto) return '';
    const handle = filteredHandles.find(h =>
      h.photos && h.photos.includes(currentPhoto)
    );
    return handle ? handle.name : '';
  };
  
  const handlePhotoClick = (photoUrl: string) => {
    const photoIndex = allPhotosInGroup.findIndex(photo => photo === photoUrl);
    setCurrentPhotoIndex(photoIndex >= 0 ? photoIndex : 0);
    setZoomPhoto(photoUrl);
  };
  
  const handlePrevPhoto = () => {
    if (allPhotosInGroup.length > 0) {
      const newIndex = currentPhotoIndex > 0 ? currentPhotoIndex - 1 : allPhotosInGroup.length - 1;
      setCurrentPhotoIndex(newIndex);
      setZoomPhoto(allPhotosInGroup[newIndex]);
    }
  };
  
  const handleNextPhoto = () => {
    if (allPhotosInGroup.length > 0) {
      const newIndex = currentPhotoIndex < allPhotosInGroup.length - 1 ? currentPhotoIndex + 1 : 0;
      setCurrentPhotoIndex(newIndex);
      setZoomPhoto(allPhotosInGroup[newIndex]);
    }
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setZoomPhoto(null);
    } else if (e.key === 'ArrowLeft') {
      handlePrevPhoto();
    } else if (e.key === 'ArrowRight') {
      handleNextPhoto();
    }
  };
  
  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg w-full max-w-7xl max-h-[95vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
            <h2 className="text-2xl font-bold text-black">Выбор ручки</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>
          
          {/* Content */}
          <div className="p-4 overflow-y-auto flex-1">
            {/* Фильтр по цвету (отдельный; несколько одновременно); "+цена" — мин. цена по цвету */}
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-black mb-3">Цвет</h3>
              <div className="flex gap-2 flex-wrap">
                {colorOptions.map((opt) => {
                  const isSelected = selectedColors.includes(opt.key);
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => toggleColor(opt.key)}
                      className={`rounded border px-3 py-2 text-sm font-medium transition ${
                        isSelected ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white hover:border-gray-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Фильтр по цене (отдельный; несколько диапазонов одновременно) */}
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-black mb-3">Цена</h3>
              <div className="flex gap-2 flex-wrap">
                {PRICE_RANGES.map((range) => {
                  const isSelected = selectedPriceRangeIds.includes(range.id);
                  return (
                    <button
                      key={range.id}
                      type="button"
                      onClick={() => togglePriceRange(range.id)}
                      className={`rounded border px-3 py-2 text-sm font-medium transition ${
                        isSelected ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white hover:border-gray-400'
                      }`}
                    >
                      {range.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Сетка ручек */}
            <div>
              <div className="grid grid-cols-4 gap-3">
                {filteredHandles.map((handle) => (
                    <div
                      key={handle.id}
                      onClick={() => onSelect(handle.id)}
                      className={`border rounded-lg p-3 cursor-pointer transition-all ${
                        selectedHandleId === handle.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {/* Фото ручки - прямоугольное поле отображения */}
                      <div className="aspect-[4/2.8] mb-3 bg-gray-100 overflow-hidden px-2 py-1">
                        {handle.photos && handle.photos.length > 0 ? (
                          <img
                            src={getNormalizedPhotoUrl(handle.photos[0], handle.name)}
                            alt={handle.name}
                            loading="lazy"
                            className="w-full h-full object-contain cursor-pointer hover:scale-105 transition-transform duration-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              handlePhotoClick(handle.photos![0]);
                            }}
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              // Сначала пробуем mockup по имени ручки
                              if (!target.dataset.fallbackUsed) {
                                target.dataset.fallbackUsed = '1';
                                const mockupSrc = getHandleImageSrc(undefined, handle.name);
                                if (mockupSrc && mockupSrc !== target.src) {
                                  target.src = mockupSrc;
                                  return;
                                }
                              }
                              target.style.display = 'none';
                              const placeholder = target.nextElementSibling as HTMLElement;
                              if (placeholder) {
                                placeholder.classList.remove('hidden');
                              }
                            }}
                          />
                        ) : null}
                        <div className={`w-full h-full flex items-center justify-center text-gray-400 ${handle.photos && handle.photos.length > 0 ? 'hidden' : ''}`}>
                          <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                          </svg>
                        </div>
                      </div>
                      
                      {/* Информация о ручке: название, иконка i (описание) */}
                      <div className="text-center relative">
                        <div className="flex items-center justify-center gap-1 mb-2 flex-wrap">
                          <h4 className="font-medium text-black text-sm line-clamp-2">
                            {handle.name}
                          </h4>
                          {handle.description && (
                            <span
                              role="button"
                              tabIndex={0}
                              className="flex-shrink-0 text-gray-500 hover:text-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded p-0.5"
                              title="Описание"
                              onClick={(e) => {
                                e.stopPropagation();
                                setDescriptionForHandleId((prev) => (prev === handle.id ? null : handle.id));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setDescriptionForHandleId((prev) => (prev === handle.id ? null : handle.id));
                                }
                              }}
                            >
                              <Info className="w-4 h-4" />
                            </span>
                          )}
                        </div>
                        {descriptionForHandleId === handle.id && handle.description && (
                          <div
                            className="absolute left-0 right-0 top-full z-10 mt-1 p-3 bg-white border border-gray-200 rounded-lg shadow-lg text-left text-sm text-gray-700 max-h-32 overflow-y-auto"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {handle.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
            </div>
          </div>
          
          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 flex-shrink-0">
            <Button
              onClick={onClose}
              variant="ghost"
              className="px-4 py-2"
            >
              Отмена
            </Button>
            <Button
              onClick={() => {
                onSelect('');
                onClose();
              }}
              variant="destructive"
              className="px-4 py-2"
            >
              Убрать ручку
            </Button>
          </div>
        </div>
      </div>
      
      {/* Модальное окно зума фотографии */}
      {zoomPhoto && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[60] p-4"
          onKeyDown={handleKeyDown}
          onClick={(e) => {
            // Закрытие по клику на пустое поле (фон)
            if (e.target === e.currentTarget) {
              setZoomPhoto(null);
            }
          }}
          tabIndex={0}
        >
          {/* Кнопка закрытия */}
          <button
            onClick={() => setZoomPhoto(null)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 text-3xl z-10 bg-black bg-opacity-50 rounded-full w-10 h-10 flex items-center justify-center"
          >
            ×
          </button>
          
          {/* Контейнер для фотографии с навигацией */}
          <div className="relative max-w-5xl max-h-[90vh] flex items-center justify-center">
            {/* Кнопка предыдущего фото */}
            {allPhotosInGroup.length > 1 && (
              <button
                onClick={handlePrevPhoto}
                className="absolute -left-16 top-1/2 transform -translate-y-1/2 text-white hover:text-gray-300 text-2xl z-10 bg-black bg-opacity-80 rounded-full w-12 h-12 flex items-center justify-center hover:bg-opacity-90 transition-all"
              >
                ←
              </button>
            )}
            
            {/* Кнопка следующего фото */}
            {allPhotosInGroup.length > 1 && (
              <button
                onClick={handleNextPhoto}
                className="absolute -right-16 top-1/2 transform -translate-y-1/2 text-white hover:text-gray-300 text-2xl z-10 bg-black bg-opacity-80 rounded-full w-12 h-12 flex items-center justify-center hover:bg-opacity-90 transition-all"
              >
                →
              </button>
            )}
            
            {/* Фотография */}
            <img
              src={getNormalizedPhotoUrl(zoomPhoto || '')}
              alt="Увеличенное фото ручки"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          
          {/* Счетчик фотографий */}
          {allPhotosInGroup.length > 1 && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white text-sm bg-black bg-opacity-70 px-4 py-2 rounded-lg">
              {currentPhotoIndex + 1} / {allPhotosInGroup.length}
            </div>
          )}
          
          {/* Название ручки */}
          {getCurrentHandleName() && (
            <div className="absolute bottom-16 left-1/2 transform -translate-x-1/2 text-white text-lg font-medium bg-black bg-opacity-70 px-4 py-2 rounded-lg">
              {getCurrentHandleName()}
            </div>
          )}
        </div>
      )}
    </>
  );
}

