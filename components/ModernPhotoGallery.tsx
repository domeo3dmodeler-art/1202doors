"use client";

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import { ChevronLeftIcon, ChevronRightIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import { clientLogger } from '@/lib/logging/client-logger';
import { getImageSrc } from '@/lib/configurator/image-src';

interface PhotoStructure {
  cover: string | null;
  gallery: string[];
}

interface ModernPhotoGalleryProps {
  photos: PhotoStructure;
  productName: string;
  hasGallery: boolean;
  onToggleSidePanels?: (hide: boolean) => void;
}

export function ModernPhotoGallery({ photos, productName, hasGallery, onToggleSidePanels }: ModernPhotoGalleryProps) {
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Получаем все фото в правильном порядке
  const allPhotos = useMemo(() => {
    if (photos.cover) {
      return [photos.cover, ...(photos.gallery || [])];
    }
    return photos.gallery || [];
  }, [photos.cover, photos.gallery]);
  
  // Логируем при монтировании компонента (только один раз)
  useEffect(() => {
    if (allPhotos.length > 0) {
      clientLogger.debug('📸 ModernPhotoGallery mounted:', {
        allPhotosLength: allPhotos.length,
        currentIndex,
        hasGallery,
        productName: productName,
        cover: photos.cover,
        galleryLength: photos.gallery?.length || 0
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Только при монтировании
  
  // Показываем миниатюры только если есть галерея
  const showThumbnails = hasGallery && allPhotos.length > 1;

  const nextPhoto = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % allPhotos.length);
  }, [allPhotos.length]);

  const prevPhoto = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + allPhotos.length) % allPhotos.length);
  }, [allPhotos.length]);

  const goToPhoto = (index: number) => {
    setCurrentIndex(index);
  };

  const toggleZoom = useCallback(() => {
    setIsZoomed((prev) => !prev);
  }, []);
  
  // Вызываем onToggleSidePanels после обновления isZoomed
  useEffect(() => {
    if (onToggleSidePanels) {
      onToggleSidePanels(isZoomed);
    }
  }, [isZoomed, onToggleSidePanels]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsZoomed(false);
    }
    if (e.key === 'ArrowRight') nextPhoto();
    if (e.key === 'ArrowLeft') prevPhoto();
  }, [nextPhoto, prevPhoto]);

  // Обработка клавиатуры в режиме зума
  useEffect(() => {
    if (!isZoomed) return;
    
    const handleZoomKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsZoomed(false);
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextPhoto();
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevPhoto();
      }
    };

    window.addEventListener('keydown', handleZoomKeyDown);
    return () => window.removeEventListener('keydown', handleZoomKeyDown);
  }, [isZoomed, nextPhoto, prevPhoto]);

  // Сбрасываем индекс и зум при смене модели/продукта
  useEffect(() => {
    setCurrentIndex(0);
    setIsZoomed(false);
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, [productName, photos.cover]); // Сбрасываем при смене продукта или обложки

  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => setIsLoading(false), 300);
    return () => clearTimeout(timer);
  }, [currentIndex]);

  if (allPhotos.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-gray-50">
        <div className="text-center text-gray-400">
          <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <div className="text-sm font-medium">Нет фото</div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="h-full w-full relative group focus:outline-none"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{ position: 'relative', zIndex: 1 }}
    >
      {/* Основное изображение */}
      <div className="relative h-full w-full bg-gray-50" style={{ position: 'relative', zIndex: 1 }}>
        {isLoading && (
          <div className="absolute inset-0 bg-gray-200 animate-pulse rounded-lg" />
        )}
        
        <div 
          className="h-full w-full flex items-center justify-center"
          style={{ position: 'relative', zIndex: 1 }}
        >
          {allPhotos[currentIndex] ? (
            <img
              src={getImageSrc(allPhotos[currentIndex])}
              alt={`${productName} - фото ${currentIndex + 1}`}
              className="max-h-full max-w-full object-contain transition-all duration-300 hover:scale-105 cursor-pointer"
              style={{ position: 'relative', zIndex: 1, pointerEvents: 'auto' }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Клик по изображению - включаем зум
                toggleZoom();
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // MouseDown по изображению - включаем зум
                toggleZoom();
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // PointerDown по изображению - включаем зум
                toggleZoom();
              }}
              onError={() => {
                clientLogger.debug('❌ Ошибка загрузки изображения:', { photo: allPhotos[currentIndex] });
              }}
            />
          ) : (
            <div className="text-gray-400 text-center">
              <div className="text-sm">Нет фото</div>
              <div className="text-xs">{productName}</div>
            </div>
          )}
        </div>

        {/* Кнопка зума */}
        {allPhotos[currentIndex] && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Клик по кнопке зума
              toggleZoom();
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // MouseDown по кнопке зума
              toggleZoom();
            }}
            onPointerDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // PointerDown по кнопке зума
              toggleZoom();
            }}
            className="absolute top-4 right-4 bg-white/90 hover:bg-white rounded-full p-2 shadow-lg transition-all duration-200 cursor-pointer z-30"
            style={{ zIndex: 30, pointerEvents: 'auto', position: 'absolute' }}
            aria-label={isZoomed ? "Уменьшить" : "Увеличить"}
          >
            <MagnifyingGlassIcon className="w-5 h-5 text-gray-700" />
          </button>
        )}

        {/* Навигационные стрелки (только для галереи) */}
        {allPhotos.length > 1 && allPhotos[currentIndex] && (
          <>
            <div
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
                // Клик по кнопке "Предыдущее фото"
                prevPhoto();
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
                // MouseDown по кнопке "Предыдущее фото"
                prevPhoto();
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // PointerDown по кнопке "Предыдущее фото"
                prevPhoto();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-2 shadow-lg transition-all duration-200 cursor-pointer z-30"
              style={{ zIndex: 30, pointerEvents: 'auto', position: 'absolute' }}
              role="button"
              tabIndex={0}
              aria-label="Предыдущее фото"
            >
              <ChevronLeftIcon className="w-6 h-6 text-gray-700" />
            </div>
            
            <div
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
                // Клик по кнопке "Следующее фото"
                nextPhoto();
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
                // MouseDown по кнопке "Следующее фото"
                nextPhoto();
              }}
              onPointerDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // PointerDown по кнопке "Следующее фото"
                nextPhoto();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white rounded-full p-2 shadow-lg transition-all duration-200 cursor-pointer z-30"
              style={{ zIndex: 30, pointerEvents: 'auto', position: 'absolute' }}
              role="button"
              tabIndex={0}
              aria-label="Следующее фото"
            >
              <ChevronRightIcon className="w-6 h-6 text-gray-700" />
            </div>
          </>
        )}

        {/* Индикатор текущего фото */}
        {allPhotos.length > 1 && allPhotos[currentIndex] && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white px-3 py-1 rounded-full text-sm font-medium z-10">
            {currentIndex + 1} / {allPhotos.length}
          </div>
        )}
      </div>

      {/* Миниатюры под изображением - показываем только в режиме зума */}
      {false && showThumbnails && allPhotos.length > 1 && (
        <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm p-4 rounded-b-xl shadow-lg z-10">
          <div className="flex justify-center space-x-2 overflow-x-auto">
            {allPhotos.map((photo, index) => (
              photo ? (
                <button
                  key={index}
                  onClick={() => goToPhoto(index)}
                  className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                    index === currentIndex 
                      ? 'border-blue-500 shadow-lg scale-110' 
                      : 'border-gray-200 hover:border-gray-400 hover:scale-105'
                  }`}
                  aria-label={`Перейти к фото ${index + 1}`}
                >
                  <img
                    src={getImageSrc(photo)}
                    alt={`Миниатюра ${index + 1}`}
                    className="w-full h-full object-cover"
                    onError={() => {
                      clientLogger.debug('❌ Ошибка загрузки миниатюры:', { photo });
                    }}
                  />
                </button>
              ) : null
            ))}
          </div>
        </div>
      )}

      {/* Полноэкранный режим при зуме */}
      {isZoomed && allPhotos[currentIndex] && (
        <div 
          className="fixed inset-0 bg-black/90 z-[9999] flex items-center justify-center p-4 overflow-hidden"
          onClick={(e) => {
            // Закрываем зум только при клике на фон, не на содержимое
            if (e.target === e.currentTarget) {
              setIsZoomed(false);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setIsZoomed(false);
            }
          }}
          tabIndex={-1}
        >
          <div className="relative max-w-7xl w-full max-h-[90vh] flex flex-col">
            {/* Основное изображение */}
            <div className="flex items-center justify-center relative flex-none max-h-[80vh]">
              <img
                src={getImageSrc(allPhotos[currentIndex])}
                alt={`${productName} - увеличенное фото ${currentIndex + 1}`}
                className="max-w-full max-h-[80vh] object-contain cursor-default"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              />
              
              {/* Навигационные стрелки */}
              {allPhotos.length > 1 && (
                <>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      prevPhoto();
                    }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white rounded-full p-3 transition-all duration-200 z-10"
                    aria-label="Предыдущее фото"
                  >
                    <ChevronLeftIcon className="w-8 h-8" />
                  </button>
                  
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      nextPhoto();
                    }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/20 hover:bg-white/30 text-white rounded-full p-3 transition-all duration-200 z-10"
                    aria-label="Следующее фото"
                  >
                    <ChevronRightIcon className="w-8 h-8" />
                  </button>
                </>
              )}
            </div>
            
            {/* Миниатюры внизу */}
            {allPhotos.length > 1 && (
              <div className="bg-black/50 p-4 flex-none">
                <div className="flex justify-center space-x-3 overflow-x-auto scrollbar-hide">
                  {allPhotos.map((photo, index) => (
                    photo ? (
                      <button
                        key={index}
                        onClick={(e) => {
                          e.stopPropagation();
                          goToPhoto(index);
                        }}
                        className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all duration-200 ${
                          index === currentIndex 
                            ? 'border-white shadow-lg scale-110' 
                            : 'border-white/50 hover:border-white/80 hover:scale-105'
                        }`}
                        aria-label={`Перейти к фото ${index + 1}`}
                      >
                        <img
                          src={getImageSrc(photo)}
                          alt={`Миниатюра ${index + 1}`}
                          className="w-full h-full object-cover"
                          onError={() => {
                            clientLogger.debug('❌ Ошибка загрузки миниатюры:', { photo });
                          }}
                        />
                      </button>
                    ) : null
                  ))}
                </div>
              </div>
            )}
            
            {/* Кнопка закрытия */}
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsZoomed(false);
              }}
              className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition-colors duration-200 z-10"
              aria-label="Закрыть"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
