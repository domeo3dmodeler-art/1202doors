'use client';

import React, { useEffect, useState, useMemo, memo } from 'react';
import { clientLogger } from '@/lib/logging/client-logger';
import { fetchWithAuth } from '@/lib/utils/fetch-with-auth';
import { parseApiResponse } from '@/lib/utils/parse-api-response';
import { getImageSrc } from '@/lib/configurator/image-src';
import { formatModelNameForCard } from './utils';
import type { ModelItem } from './types';

interface DoorCardProps {
  item: ModelItem;
  selected: boolean;
  onSelect: () => void;
}

function DoorCardComponent({ item, selected, onSelect }: DoorCardProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Мемоизируем вычисление URL изображения (единый слой getImageSrc)
  const imageUrl = useMemo(() => (item.photo && typeof item.photo === 'string' ? getImageSrc(item.photo) : null), [item.photo]);

  useEffect(() => {
    if (imageUrl) {
      setImageSrc(imageUrl);
      setIsLoading(false);
    } else if (item.modelKey) {
      // Fallback: загружаем фото через старый API используя modelKey
      const loadPhoto = async () => {
        try {
          setIsLoading(true);
          const response = await fetchWithAuth(`/api/catalog/doors/photos?model=${encodeURIComponent(item.modelKey || '')}`);

          if (response.ok) {
            const data = await response.json();
            const parsedData = parseApiResponse<{ photos?: string[] }>(data);
            if (parsedData.photos && parsedData.photos.length > 0) {
              setImageSrc(getImageSrc(parsedData.photos[0]));
            } else {
              setImageSrc(null);
            }
          } else {
            setImageSrc(null);
          }
        } catch (error) {
          clientLogger.error('❌ Ошибка загрузки фото для карточки:', error);
          setImageSrc(null);
        } finally {
          setIsLoading(false);
        }
      };

      loadPhoto();
    } else {
      setImageSrc(null);
      setIsLoading(false);
    }
  }, [imageUrl, item.modelKey]);

  return (
    <div className="flex flex-col">
      <button
        onClick={onSelect}
        aria-label={`Выбрать модель ${formatModelNameForCard(item.model)}`}
        className={[
          "group w-full text-left bg-white overflow-hidden",
          "hover:shadow-md transition",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ring-offset-2",
          selected ? "shadow-md" : "",
        ].join(" ")}
      >
        {/* Фото полностью заполняет карточку с правильным соотношением сторон для дверей */}
        <div className="aspect-[16/33] w-full bg-gray-50 relative group overflow-hidden">
          {isLoading ? (
            <div className="absolute inset-0 animate-pulse bg-gray-200" />
          ) : imageSrc ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageSrc}
                alt={formatModelNameForCard(item.model)}
                className="absolute inset-0 w-full h-full object-contain transition-transform duration-300 group-hover:scale-105"
                loading="lazy"
                decoding="async"
                onLoad={() => clientLogger.debug('✅ Изображение загружено для', item.model, ':', imageSrc)}
                onError={(e) => {
                  clientLogger.error('❌ ОШИБКА ЗАГРУЗКИ изображения:', imageSrc);
                  clientLogger.error('❌ item.photo:', item.photo);
                  clientLogger.error('❌ Тип imageSrc:', typeof imageSrc);
                  clientLogger.error('❌ item:', item);
                  setImageSrc(null);
                }}
              />
              {/* Индикатор галереи */}
              {item.hasGallery && (
                <div className="absolute top-2 right-2 bg-white/90 text-gray-700 text-xs px-2 py-1 rounded-full font-medium shadow-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  +{item.photos?.gallery.length || 0}
                </div>
              )}
            </>
          ) : (
            <div className="h-full w-full flex items-center justify-center text-gray-400">
              <div className="text-center">
                <div className="text-sm">Нет фото</div>
                <div className="text-[14px] text-center whitespace-nowrap px-2" title={formatModelNameForCard(item.model)}>
                  {formatModelNameForCard(item.model)}
                </div>
              </div>
            </div>
          )}
        </div>
      </button>
      {/* Название модели под карточкой */}
      <div className="mt-2 flex justify-center">
        <div className="text-[14px] font-medium text-gray-900 text-center whitespace-nowrap px-2" title={formatModelNameForCard(item.model)}>
          {formatModelNameForCard(item.model)}
        </div>
      </div>
    </div>
  );
}

export const DoorCard = memo(DoorCardComponent, (prevProps, nextProps) => {
  // Мемоизация: перерендериваем только если изменились важные пропсы
  return (
    prevProps.item.model === nextProps.item.model &&
    prevProps.item.photo === nextProps.item.photo &&
    prevProps.selected === nextProps.selected
  );
});

