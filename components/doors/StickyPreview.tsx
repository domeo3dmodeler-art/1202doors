'use client';

import React, { useEffect, useState } from 'react';
import { clientLogger } from '@/lib/logging/client-logger';
import { getImageSrc } from '@/lib/configurator/image-src';
import { formatModelNameForCard, formatModelNameForPreview } from './utils';

interface StickyPreviewProps {
  item: { model: string; modelKey?: string; sku_1c?: string | number | null; photo?: string | null } | null;
}

export function StickyPreview({ item }: StickyPreviewProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isZoomed, setIsZoomed] = useState(false);

  useEffect(() => {
    if (!item?.model) {
      setImageSrc(null);
      setIsLoading(false);
      return;
    }

    // Если фото уже предзагружено в item.photo — единый слой getImageSrc (Цвет→doors, uploadsproducts и т.д.)
    if (item.photo && typeof item.photo === 'string') {
      const imageUrl = getImageSrc(item.photo);
      if (imageUrl) {
        setImageSrc(imageUrl);
        setIsLoading(false);
        return;
      }
    }

    // Fallback: загружаем фото через старый API (для совместимости)
    const loadPhoto = async () => {
      try {
        setIsLoading(true);
        clientLogger.debug('🔄 Загружаем фото для превью:', item.modelKey || item.model);

        const response = await fetch(`/api/catalog/doors/photos?model=${encodeURIComponent(item.modelKey || item.model)}`);

        if (response.ok) {
          const data = await response.json();
          if (data.photos && data.photos.length > 0) {
            setImageSrc(getImageSrc(data.photos[0]));
          } else {
            setImageSrc(null);
          }
        } else {
          setImageSrc(null);
        }
      } catch (error) {
        clientLogger.error('❌ Ошибка загрузки фото для превью:', error);
        setImageSrc(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadPhoto();
  }, [item?.model, item?.modelKey, item?.photo]);

  if (!item) return null;
  return (
    <aside>
      <div className="mb-4 text-xl font-semibold text-center">{formatModelNameForPreview(item.model)}</div>
      <div className="aspect-[1/2] w-full overflow-hidden rounded-xl bg-gray-50">
        {isLoading ? (
          <div className="h-full w-full animate-pulse bg-gray-200" />
        ) : imageSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrc}
            alt={formatModelNameForCard(item.model)}
            className="h-full w-full object-contain cursor-zoom-in"
            onClick={() => setIsZoomed(true)}
            onError={() => {
              clientLogger.debug('❌ Ошибка загрузки изображения для превью:', imageSrc);
              setImageSrc(null);
            }}
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <div className="text-sm">Нет фото</div>
              <div className="text-xs">{formatModelNameForCard(item.model)}</div>
            </div>
          </div>
        )}
      </div>
      {isZoomed && imageSrc && (
        <div
          className="fixed inset-0 z-[10000] bg-black/90 p-4 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsZoomed(false);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageSrc} alt={formatModelNameForCard(item.model)} className="max-w-full max-h-full object-contain" />
          <button
            type="button"
            className="absolute top-4 right-4 text-white bg-white/20 hover:bg-white/30 rounded-full w-10 h-10 text-xl"
            onClick={() => setIsZoomed(false)}
            aria-label="Закрыть увеличенное фото"
          >
            ×
          </button>
        </div>
      )}
    </aside>
  );
}

