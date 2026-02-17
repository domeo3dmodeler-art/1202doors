'use client';

import React from 'react';
import { ModernPhotoGallery } from '@/components/ModernPhotoGallery';
import { getImageSrc } from '@/lib/configurator/image-src';
import { formatModelNameForCard, formatModelNameForPreview } from './utils';

interface ModelItem {
  model: string;
  modelKey?: string;
  style: string;
  photo?: string | null;
  photos?: { cover: string | null; gallery: string[] };
  hasGallery?: boolean;
}

interface DoorPreviewProps {
  sel: { model?: string };
  selectedModelCard: ModelItem | null;
  hideSidePanels: boolean;
  setHideSidePanels: React.Dispatch<React.SetStateAction<boolean>>;
  handleModelSelect: () => void;
}

export function DoorPreview({
  sel,
  selectedModelCard,
  hideSidePanels,
  setHideSidePanels,
  handleModelSelect,
}: DoorPreviewProps) {
  const [zoomSrc, setZoomSrc] = React.useState<string | null>(null);

  return (
    <section className={`transition-all duration-300 ${
      hideSidePanels ? 'lg:col-span-1' : 'lg:col-span-1'
    }`}>
      <div className={`mx-auto transition-all duration-300 ${
        hideSidePanels ? 'max-w-4xl' : 'max-w-md'
      }`}>
        <div className="sticky top-6">
          {sel.model ? (
            <div className="transition-all duration-500 ease-in-out">
              <div className="text-center mb-4">
                <h3 className="text-lg font-semibold text-black">
                  {selectedModelCard ? formatModelNameForPreview(selectedModelCard.model) : "Выберите модель"}
                </h3>
              </div>
              {/* Профессиональная галерея с увеличенным размером */}
              <div className="w-full bg-white rounded-xl shadow-lg overflow-visible">
                <div className="aspect-[4/6.5] overflow-visible rounded-t-xl" style={{ position: 'relative', zIndex: 1 }}>
                  {(() => {
                    const hasPhotos = selectedModelCard?.photos && selectedModelCard.photos;
                    const hasCover = hasPhotos && !!selectedModelCard.photos?.cover;
                    const hasGallery = hasPhotos && Array.isArray(selectedModelCard.photos?.gallery) && selectedModelCard.photos?.gallery.length > 0;
                    const shouldShowGallery = !!(hasCover || hasGallery);
                    
                    // Рендер галереи
                    if (shouldShowGallery && selectedModelCard?.photos) {
                      // Рендерим ModernPhotoGallery
                      return (
                        <ModernPhotoGallery
                          photos={{
                            cover: selectedModelCard.photos.cover || null,
                            gallery: selectedModelCard.photos.gallery || []
                          }}
                          productName={selectedModelCard.model || ''}
                          hasGallery={selectedModelCard.hasGallery || false}
                          onToggleSidePanels={setHideSidePanels}
                        />
                      );
                    }
                    
                    if (selectedModelCard && selectedModelCard.photo) {
                      const src = getImageSrc(selectedModelCard.photo);
                      return (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={src}
                          alt={selectedModelCard.model || 'Дверь'}
                          className="h-full w-full object-contain cursor-zoom-in"
                          onClick={() => setZoomSrc(src)}
                        />
                      );
                    }
                    
                    return (
                      <div className="h-full w-full flex items-center justify-center text-gray-400">
                        <div className="text-center">
                          <div className="text-sm">Нет фото</div>
                          <div className="text-[14px] whitespace-nowrap">
                            {selectedModelCard ? formatModelNameForCard(selectedModelCard.model) : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
              
              {/* Кнопка Выбрать под превью - показывается всегда, когда выбрана модель */}
              {sel.model && (
                <div className="mt-6 flex justify-center z-50 relative">
                  <button
                    onClick={handleModelSelect}
                    disabled={!sel.model}
                    className={`px-6 py-3 font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed border border-black ${
                      sel.model
                        ? 'bg-white text-black hover:bg-black hover:text-white'
                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                    style={{ position: 'relative', zIndex: 50 }}
                  >
                    Выбрать
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="aspect-[2/3] w-full bg-gray-50 rounded-lg flex items-center justify-center">
              <div className="text-center text-gray-400">
                <div className="text-sm">Выберите модель</div>
              </div>
            </div>
          )}
        </div>
      </div>
      {zoomSrc && (
        <div
          className="fixed inset-0 z-[10000] bg-black/90 p-4 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setZoomSrc(null);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoomSrc} alt={selectedModelCard?.model || 'Дверь'} className="max-w-full max-h-full object-contain" />
          <button
            type="button"
            className="absolute top-4 right-4 text-white bg-white/20 hover:bg-white/30 rounded-full w-10 h-10 text-xl"
            onClick={() => setZoomSrc(null)}
            aria-label="Закрыть увеличенное фото"
          >
            ×
          </button>
        </div>
      )}
    </section>
  );
}

