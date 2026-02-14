'use client';

import Link from 'next/link';
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { designTokens } from '@/lib/design/tokens';
import HandleSelectionModal from '@/components/HandleSelectionModal';
import { Info } from 'lucide-react';
import { useConfiguratorData, useModelDetails, usePriceCalculation } from '@/lib/configurator/useConfiguratorData';
import { useModelOptions } from '@/lib/configurator/useModelOptions';
import type { DoorModel, DoorCoating, DoorEdge, DoorOption, DoorHandle, DoorLimiter } from '@/lib/configurator/api';
import { CartManager } from '@/components/doors';
import type { CartItem, HardwareKit } from '@/components/doors';
import { formatModelNameForCard } from '@/components/doors/utils';
import {
  getImageSrc,
  getImageSrcWithPlaceholder,
  createPlaceholderSvgDataUrl,
  getHandleImageSrc,
} from '@/lib/configurator/image-src';
import GlobalHeader from '@/components/layout/GlobalHeader';
import NotificationBell from '@/components/ui/NotificationBell';
import { useAuth } from '@/lib/auth/AuthContext';
import { CreateClientModal } from '@/components/clients/CreateClientModal';
import { clientLogger } from '@/lib/logging/client-logger';
import { fetchWithAuth } from '@/lib/utils/fetch-with-auth';
import { parseApiResponse } from '@/lib/utils/parse-api-response';

/** Описания комплектов фурнитуры для UI (названия не меняем, только описание) */
const HARDWARE_KIT_DESCRIPTIONS: Record<string, { specs: string[]; note: string }> = {
  'БАЗОВЫЙ (СИЛЬВЕР)': {
    specs: [
      'Петли: универсальные',
      'Тип монтажа: Накладные',
      'Количество: 2шт',
      'Сплав: сталь',
      'Защелка: сантехническая механическая 1шт',
    ],
    note: '',
  },
  'Комфорт (ГОЛД)': {
    specs: [
      'Петли: универсальные',
      'Тип монтажа: Скрытые',
      'Количество: 2шт',
      'Сплав: ЦАМ',
      'Защелка: сантехническая магнитная 1шт',
    ],
    note: '',
  },
  'Бизнес (Платинум)': {
    specs: [
      'Петли: универсальные',
      'Тип монтажа: Скрытые',
      'Производство: ИТАЛИЯ',
      'Количество: 2шт',
      'Сплав: ЦАМ',
      'Защелка: сантехническая магнитная 1шт',
    ],
    note: '',
  },
};

function getKitDescription(kitName: string): { specs: string[]; note: string } | null {
  const normalized = kitName.replace(/^Комплект фурнитуры\s*[—\-]\s*/i, '').trim();
  if (HARDWARE_KIT_DESCRIPTIONS[normalized]) return HARDWARE_KIT_DESCRIPTIONS[normalized];
  const lower = normalized.toLowerCase();
  if (lower.includes('сильвер') || (lower.includes('базовый') && lower.includes('сильвер'))) return HARDWARE_KIT_DESCRIPTIONS['БАЗОВЫЙ (СИЛЬВЕР)'];
  if (lower.includes('голд') || lower.includes('комфорт')) return HARDWARE_KIT_DESCRIPTIONS['Комфорт (ГОЛД)'];
  if (lower.includes('платинум') || lower.includes('бизнес')) return HARDWARE_KIT_DESCRIPTIONS['Бизнес (Платинум)'];
  return null;
}

/**
 * ТОЧНАЯ копия макета из Figma
 * На основе визуального описания и данных из Figma API
 * 
 * Структура:
 * - Header: "Межкомнатные двери"
 * - Заголовки: "Стили", "Модели"
 * - Табы: "полотно" (активный), "ПОКРЫТИЕ И ЦВЕТ"
 * - Сетка моделей: 2 ряда миниатюр
 * - Большое превью справа: вертикальное изображение двери
 * - Параметры справа: список параметров
 * - Цена: "66 200 Р"
 * - Кнопки: "В корзину", "Заказать в 1 клик"
 * - "ЗАВЕРШИТЬ ОБРАЗ": опции фурнитуры
 */

export default function FigmaExactReplicaPage() {
  // Аутентификация
  const { user, isAuthenticated } = useAuth();
  const userRole = user?.role || 'guest';

  // Загружаем данные через хуки
  const { models: allModels, rawModels, handles: allHandles, limiters: allLimiters, architraves: allArchitraves, kits: configKits, loading: dataLoading, error: dataError } = useConfiguratorData();
  
  // Состояние для выбранной модели (ID из API)
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  
  // Загружаем детали выбранной модели (у каждой модели — тип покрытия и набор цветов по типам)
  const { model: selectedModelData, coatings, finishes, colorsByFinish, edges, options, loading: modelLoading } = useModelDetails(selectedModelId, rawModels);

  // Хук для расчета цены
  const { calculate: calculatePrice, calculating: priceCalculating, priceData, clearPrice } = usePriceCalculation();
  
  // Состояние для стиля и наполнения (наполнение — только фильтр)
  const [selectedStyle, setSelectedStyle] = useState<string>('');
  const [selectedFilling, setSelectedFilling] = useState<string | null>(null);
  
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'полотно' | 'размеры' | 'покрытие' | 'фурнитура' | 'наличники' | 'доп-опции'>('полотно');
  
  // Состояние для покрытия и цвета: тип покрытия из данных модели, затем цвет этого типа
  const [selectedFinish, setSelectedFinish] = useState<string | null>(null);
  const [selectedCoatingId, setSelectedCoatingId] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedWood, setSelectedWood] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  /** Цвет стекла (лист Стекло_доступность); на цену не влияет, только в спецификацию */
  const [selectedGlassColor, setSelectedGlassColor] = useState<string | null>(null);
  
  // Состояние для размеров, реверса и наполнения (вкладка Полотно)
  const [width, setWidth] = useState<number>(800);
  const [height, setHeight] = useState<number>(2000);
  const [reversible, setReversible] = useState<boolean>(false);
  const [filling, setFilling] = useState<'standard' | 'good' | 'excellent'>('good');

  // Каскадные опции: доступность и списки по текущим фильтрам (реверс, наполнение, размер, покрытие, цвет)
  const selectedCoatingForOptions = selectedCoatingId ? coatings.find((c) => c.id === selectedCoatingId) : null;
  const modelOptionsParams = useMemo(
    () => ({
      reversible,
      filling: selectedFilling,
      width,
      height,
      finish: selectedFinish,
      color: selectedCoatingForOptions?.color_name ?? null,
    }),
    [reversible, selectedFilling, width, height, selectedFinish, selectedCoatingForOptions?.color_name]
  );
  const { data: modelOptionsData } = useModelOptions(selectedModelId, selectedStyle, modelOptionsParams);

  // При смене модели выставляем первый тип покрытия из каскада/модели
  useEffect(() => {
    const list = selectedModelId && modelOptionsData.finishes.length > 0 ? modelOptionsData.finishes : finishes;
    if (list.length > 0) {
      setSelectedFinish((prev) => (prev && list.includes(prev) ? prev : list[0]));
    } else {
      setSelectedFinish(null);
    }
  }, [selectedModelId, modelOptionsData.finishes, finishes]);
  // При смене типа покрытия сбрасываем выбранный цвет, если он не из этого типа
  useEffect(() => {
    if (!selectedFinish || !selectedCoatingId) return;
    const coating = coatings.find((c) => c.id === selectedCoatingId);
    if (coating && coating.coating_type !== selectedFinish) {
      setSelectedCoatingId(null);
      setSelectedColor(null);
      setSelectedWood(null);
    }
  }, [selectedFinish, selectedCoatingId, coatings]);
  
  // Состояние для фурнитуры
  const [selectedHardwareKit, setSelectedHardwareKit] = useState<string | null>(null);
  const [selectedHandleId, setSelectedHandleId] = useState<string | null>(null);
  const [showHandleModal, setShowHandleModal] = useState(false);
  const [hasLock, setHasLock] = useState<boolean | null>(null);
  
  // Состояние для наличников (ID опции)
  const [selectedArchitraveId, setSelectedArchitraveId] = useState<string | null>(null);
  
  // Состояние для дополнительных опций
  const [selectedStopperId, setSelectedStopperId] = useState<string | null>(null);
  const [selectedStopperColor, setSelectedStopperIdColor] = useState<string | null>(null);
  const [showLimiterGalleryForType, setShowLimiterGalleryForType] = useState<string | null>(null);
  const [limiterGalleryIndex, setLimiterGalleryIndex] = useState(0);
  const [selectedMirrorId, setSelectedMirrorId] = useState<string | null>(null);
  const [selectedThresholdId, setSelectedThresholdId] = useState<string | null>(null);
  const [zoomPreviewSrc, setZoomPreviewSrc] = useState<string | null>(null);
  const [zoomPreviewAlt, setZoomPreviewAlt] = useState<string>('');
  const [showHandleDescription, setShowHandleDescription] = useState(false);

  // Корзина
  const [cart, setCart] = useState<CartItem[]>([]);
  const [originalPrices, setOriginalPrices] = useState<Record<string, number>>({});
  const [cartHistory, setCartHistory] = useState<Array<{timestamp: Date, changes: Record<string, any>, totalDelta: number}>>([]);
  const [showCartManager, setShowCartManager] = useState(false);
  const [cartManagerBasePrices, setCartManagerBasePrices] = useState<Record<string, number>>({});
  
  // Клиенты
  const [showClientManager, setShowClientManager] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [selectedClientName, setSelectedClientName] = useState<string>('');
  const [clients, setClients] = useState<any[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [showCreateClientForm, setShowCreateClientForm] = useState(false);
  const [clientSearchInput, setClientSearchInput] = useState('');
  const [clientSearch, setClientSearch] = useState('');

  // Комплекты фурнитуры для CartManager
  const [hardwareKits, setHardwareKits] = useState<HardwareKit[]>([]);
  
  // Таб для админ-панели (если нужен)
  const [tab, setTab] = useState<'config' | 'admin'>('config');

  useEffect(() => {
    if (!zoomPreviewSrc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setZoomPreviewSrc(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [zoomPreviewSrc]);

  // Загружаем комплекты фурнитуры
  useEffect(() => {
    const loadHardwareKits = async () => {
      try {
        const kitsResponse = await fetchWithAuth('/api/catalog/hardware?type=kits');
        if (kitsResponse.ok) {
          let kitsData: unknown;
          try {
            kitsData = await kitsResponse.json();
            const parsedKits = parseApiResponse<HardwareKit[] | { kits?: HardwareKit[] } | { data?: HardwareKit[] }>(kitsData);
            let kits: HardwareKit[] = [];
            if (Array.isArray(parsedKits)) {
              kits = parsedKits;
            } else if (parsedKits && typeof parsedKits === 'object' && 'kits' in parsedKits && Array.isArray(parsedKits.kits)) {
              kits = parsedKits.kits;
            } else if (parsedKits && typeof parsedKits === 'object' && 'data' in parsedKits && Array.isArray((parsedKits as { data: HardwareKit[] }).data)) {
              kits = (parsedKits as { data: HardwareKit[] }).data;
            }
            setHardwareKits(kits);
          } catch (jsonError) {
            clientLogger.error('Ошибка парсинга JSON ответа kits:', jsonError);
            setHardwareKits([]);
          }
        } else if (kitsResponse.status === 401) {
          clientLogger.warn('🔒 Необходима авторизация для загрузки комплектов фурнитуры');
          setHardwareKits([]);
        }
      } catch (error) {
        clientLogger.error('Ошибка загрузки комплектов фурнитуры:', error);
        setHardwareKits([]);
      }
    };

    if (isAuthenticated) {
      loadHardwareKits();
    }
  }, [isAuthenticated]);

  // Дублируем комплекты из конфигуратора в state для CartManager (публичный API, без авторизации)
  useEffect(() => {
    if (configKits && configKits.length > 0) {
      setHardwareKits(configKits.map((k) => ({
        id: k.id,
        name: k.name,
        description: '',
        price: k.price,
        priceGroup: k.priceGroup || '',
        isBasic: k.isBasic || false,
      })));
    }
  }, [configKits]);

  // Фильтруем модели по стилю и наполнению (название наполнения из листа «Опции»)
  const filteredModels = useMemo(() => {
    let list = allModels;
    if (selectedStyle) list = list.filter(m => m.style === selectedStyle);
    if (selectedFilling) {
      list = list.filter(m => {
        const fillings = (m as { filling_names?: string[]; doorOptions?: { filling_name?: string } }).filling_names
          ?? (m.doorOptions?.filling_name ? [m.doorOptions.filling_name] : []);
        return fillings.includes(selectedFilling);
      });
    }
    return list;
  }, [allModels, selectedStyle, selectedFilling]);

  // Уникальные стили из моделей
  const availableStyles = useMemo(() => {
    const styles = Array.from(new Set(allModels.map(m => m.style))).sort();
    return styles;
  }, [allModels]);

  // Уникальные названия наполнения: по всем моделям или по каскаду (если модель выбрана и API вернул список)
  const availableFillingsFromAll = useMemo(() => {
    const names = new Set<string>();
    allModels.forEach((m: { filling_names?: string[]; doorOptions?: { filling_name?: string } }) => {
      const list = m.filling_names ?? (m.doorOptions?.filling_name ? [m.doorOptions.filling_name] : []);
      list.forEach(name => { if (name) names.add(name); });
    });
    return Array.from(names).sort();
  }, [allModels]);
  const availableFillings =
    selectedModelId && modelOptionsData.fillings.length > 0 ? modelOptionsData.fillings : availableFillingsFromAll;

  // Диагностика фото моделей (в консоль)
  useEffect(() => {
    if (allModels.length === 0) return;
    const withPhoto = allModels.filter((m) => m.photo);
    console.log('[Doors] Фото моделей: всего', allModels.length, ', с полем photo:', withPhoto.length);
    allModels.slice(0, 3).forEach((m, i) => {
      const p = m.photo ? (m.photo.length > 50 ? m.photo.slice(0, 50) + '…' : m.photo) : null;
      console.log(`[Doors] Модель ${i + 1}:`, m.model_name || m.id, '| photo:', p);
    });
    if (withPhoto.length === 0) {
      console.log('[Doors] Подсказка: API complete-data вернул photo: null для всех моделей. Проверьте БД (PropertyPhoto, ProductImage) и файлы в public/uploads/ — см. docs/PHOTOS_FLOW_ANALYSIS.md');
    }
  }, [allModels]);

  // Инициализация стиля: при появлении availableStyles выставляем первый стиль, если текущий пустой или не в списке
  useEffect(() => {
    if (availableStyles.length === 0) return;
    if (!selectedStyle || !availableStyles.includes(selectedStyle)) {
      setSelectedStyle(availableStyles[0]);
    }
  }, [availableStyles, selectedStyle]);

  // Устанавливаем первую модель при загрузке данных
  useEffect(() => {
    if (filteredModels.length > 0 && !selectedModelId) {
      const firstModel = filteredModels[0];
      setSelectedModelId(firstModel.id);
      setSelectedModel(firstModel.model_name);
    }
  }, [filteredModels, selectedModelId]);

  // Сброс выбранной модели, если она не входит в отфильтрованный список (сужение фильтров по стилю/наполнению)
  useEffect(() => {
    if (!selectedModelId || filteredModels.length === 0) return;
    const isInList = filteredModels.some((m) => m.id === selectedModelId);
    if (!isInList) {
      const first = filteredModels[0];
      setSelectedModelId(first?.id ?? null);
      setSelectedModel(first?.model_name ?? '');
    }
  }, [filteredModels, selectedModelId]);

  // Обновляем выбранную модель при изменении selectedModelId
  useEffect(() => {
    if (selectedModelId && selectedModelData) {
      setSelectedModel(selectedModelData.model_name);
    }
  }, [selectedModelId, selectedModelData]);

  // При смене модели сбрасываем цвет стекла (варианты зависят от модели)
  useEffect(() => {
    setSelectedGlassColor(null);
  }, [selectedModelId]);

  // При смене модели: если кромка в базе — выбираем базовую (первую); иначе сбрасываем, если выбранная не в списке
  useEffect(() => {
    if (selectedModelData?.edge_in_base && edges.length > 0) {
      const edgeIds = new Set(edges.map((e) => e.id));
      if (!selectedEdgeId || !edgeIds.has(selectedEdgeId)) setSelectedEdgeId(edges[0].id);
    } else {
      if (!selectedEdgeId || selectedEdgeId === 'none') return;
      const edgeIds = new Set(edges.map((e) => e.id));
      if (!edgeIds.has(selectedEdgeId)) setSelectedEdgeId(null);
    }
  }, [selectedModelId, edges, selectedEdgeId, selectedModelData?.edge_in_base]);

  // При смене на модель без реверса (по каскаду) сбрасываем выбор «Да»
  useEffect(() => {
    if (reversible && !modelOptionsData.revers_available) setReversible(false);
  }, [selectedModelId, modelOptionsData.revers_available, reversible]);

  // Цвета ограничителей
  const stopperColors = [
    { id: 'black', name: 'Черный', color: '#000000' },
    { id: 'white', name: 'Белый', color: '#FFFFFF' },
    { id: 'chrome', name: 'Хром', color: '#C0C0C0' },
    { id: 'gold', name: 'Золото', color: '#FFD700' },
  ];



  // Функция для создания SVG иконок стилей (соотношение 1:2, на всю плашку)
  const createDoorStyleIcon = (styleName: string) => {
    const strokeColor = '#6B7280';
    const strokeWidth = 1.5;
    
    switch(styleName) {
      case 'Скрытая':
        // Простая прямоугольная дверь с ручкой справа посередине
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 200" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="96" height="196" stroke={strokeColor} strokeWidth={strokeWidth} rx="0"/>
            <line x1="82" y1="100" x2="96" y2="100" stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round"/>
          </svg>
        );
      case 'Современные':
        // Дверь с одним большим внутренним прямоугольником (панель/стекло), ручка справа посередине
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 200" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="96" height="196" stroke={strokeColor} strokeWidth={strokeWidth} rx="0"/>
            <rect x="8" y="8" width="84" height="184" stroke={strokeColor} strokeWidth={strokeWidth} rx="0"/>
            <line x1="82" y1="100" x2="96" y2="100" stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round"/>
          </svg>
        );
      case 'Неоклассика':
        // Дверь с двумя панелями (верхняя больше), круглая ручка справа на верхней панели
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 200" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="96" height="196" stroke={strokeColor} strokeWidth={strokeWidth} rx="0"/>
            <rect x="8" y="8" width="84" height="120" stroke={strokeColor} strokeWidth={strokeWidth} rx="0"/>
            <rect x="8" y="132" width="84" height="60" stroke={strokeColor} strokeWidth={strokeWidth} rx="0"/>
            <circle cx="82" cy="70" r="3" fill={strokeColor}/>
          </svg>
        );
      case 'Классические':
        // Дверь с двумя панелями, каждая с внутренними рамками, ручка справа на верхней панели
        return (
          <svg width="100%" height="100%" viewBox="0 0 100 200" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="2" y="2" width="96" height="196" stroke={strokeColor} strokeWidth={strokeWidth} rx="0"/>
            {/* Верхняя панель с внутренней рамкой */}
            <rect x="8" y="8" width="84" height="120" stroke={strokeColor} strokeWidth={strokeWidth} rx="0"/>
            <rect x="14" y="16" width="72" height="104" stroke={strokeColor} strokeWidth={strokeWidth} rx="0"/>
            {/* Нижняя панель с внутренней рамкой */}
            <rect x="8" y="132" width="84" height="60" stroke={strokeColor} strokeWidth={strokeWidth} rx="0"/>
            <rect x="14" y="140" width="72" height="44" stroke={strokeColor} strokeWidth={strokeWidth} rx="0"/>
            {/* Ручка справа на верхней панели */}
            <line x1="82" y1="70" x2="96" y2="70" stroke={strokeColor} strokeWidth={strokeWidth} strokeLinecap="round"/>
          </svg>
        );
      default:
        return null;
    }
  };

  // Стили с SVG иконками (соотношение 1:2) - из доступных стилей
  const styles = useMemo(() => {
    return availableStyles.map(styleName => ({
      id: styleName,
      name: styleName,
      icon: createDoorStyleIcon(styleName)
    }));
  }, [availableStyles]);

  // Варианты размеров: всегда из всех размеров выбранной модели (complete-data),
  // чтобы список не схлопывался текущим выбором width/height из model-options.
  const widthOptions = useMemo(() => {
    if (!selectedModelData || !selectedModelData.sizes) return [600, 700, 800, 900];
    const widths = Array.from(new Set(selectedModelData.sizes.map((s) => s.width))).sort((a, b) => a - b);
    return widths.length > 0 ? widths : [600, 700, 800, 900];
  }, [selectedModelData]);

  // Высоты из товаров модели + для всех моделей диапазоны 2301–2500 и 2501–3000 (надбавка % к 2000 мм)
  const HEIGHT_BAND_2301_2500 = 2350;
  const HEIGHT_BAND_2501_3000 = 2750;
  const heightOptions = useMemo(() => {
    const fromSizes = selectedModelData?.sizes
      ? Array.from(new Set(selectedModelData.sizes.map((s) => s.height))).sort((a, b) => a - b)
      : [];
    const baseOptions = fromSizes.length > 0
      ? fromSizes.map((h) => ({ value: h, label: String(h) }))
      : [
          { value: 2000, label: '2000' },
          { value: 2100, label: '2100' },
          { value: 2200, label: '2200' },
          { value: 2300, label: '2300' },
        ];
    const bands = [
      { value: HEIGHT_BAND_2301_2500, label: '2301–2500' },
      { value: HEIGHT_BAND_2501_3000, label: '2501–3000' },
    ];
    return [...baseOptions, ...bands];
  }, [selectedModelData]);

  // Варианты наполнения
  const fillingOptions = [
    { type: 'standard' as const, name: 'Стандартное', soundInsulation: '~27 дБ', description: 'Для коридоров, кладовых' },
    { type: 'good' as const, name: 'Хорошее', soundInsulation: '~30 дБ', description: 'Для спален, кабинетов, гостиных' },
    { type: 'excellent' as const, name: 'Отличное', soundInsulation: '35-42 дБ', description: 'Максимальная звукоизоляция' },
  ];

  // Описания видов наполнения для UI: спецификации и эффект (звукоизоляция)
  const FILLING_DESCRIPTIONS: Record<string, { specs: string; effect: string }> = {
    'сильвер': {
      specs: 'Толщина 36-39 мм | Rw: 18-21 дБ',
      effect: 'Базовое снижение шума. Такую дверь можно назвать «преградой для взгляда, а не для звука». Она приглушит обычный разговор, но четкие слова и громкие звуки будут различимы.',
    },
    'стандарт сильвер': {
      specs: 'Толщина 36-39 мм | Rw: 18-21 дБ',
      effect: 'Базовое снижение шума. Такую дверь можно назвать «преградой для взгляда, а не для звука». Она приглушит обычный разговор, но четкие слова и громкие звуки будут различимы.',
    },
    'голд': {
      specs: 'Толщина 40-45 мм | Rw: 22-26 дБ',
      effect: 'Заметное повышение приватности! Это решение для большинства квартир. Дверь надежно скроет содержание разговоров, приглушит звук телевизора и большинство бытовых шумов. Вы сможете отдыхать, не отвлекаясь на происходящее в других комнатах.',
    },
    'комфорт голд': {
      specs: 'Толщина 40-45 мм | Rw: 22-26 дБ',
      effect: 'Заметное повышение приватности! Это решение для большинства квартир. Дверь надежно скроет содержание разговоров, приглушит звук телевизора и большинство бытовых шумов. Вы сможете отдыхать, не отвлекаясь на происходящее в других комнатах.',
    },
    'платинум': {
      specs: 'Толщина 45-60 мм | Rw: 27-32 дБ и выше',
      effect: 'Максимальная звукоизоляция, как в профессиональных студиях. Такие двери создают по-настоящему приватную обстановку. Они гасят даже громкую музыку, ссоры и шум работающей техники. Это инвестиция в ваш покой и качественный сон.',
    },
    'бизнес платинум': {
      specs: 'Толщина 45-60 мм | Rw: 27-32 дБ и выше',
      effect: 'Максимальная звукоизоляция, как в профессиональных студиях. Такие двери создают по-настоящему приватную обстановку. Они гасят даже громкую музыку, ссоры и шум работающей техники. Это инвестиция в ваш покой и качественный сон.',
    },
  };
  const getFillingDescription = (name: string): { specs: string; effect: string } | null => {
    const key = (name || '').trim().toLowerCase();
    if (FILLING_DESCRIPTIONS[key]) return FILLING_DESCRIPTIONS[key];
    if (/сильвер|silver/.test(key)) return FILLING_DESCRIPTIONS['сильвер'];
    if (/голд|gold/.test(key)) return FILLING_DESCRIPTIONS['голд'];
    if (/платинум|platinum/.test(key)) return FILLING_DESCRIPTIONS['платинум'];
    return null;
  };

  // Три фиксированных блока наполнения: Сильвер, Голд, Платинум — в таком порядке
  const FILLING_BLOCKS = [
    { id: 'silver' as const, title: '1. Сильвер', descKey: 'сильвер' as const },
    { id: 'gold' as const, title: '2. Голд', descKey: 'голд' as const },
    { id: 'platinum' as const, title: '3. Платинум', descKey: 'платинум' as const },
  ];
  const fillingBlockMatches = useMemo(() => {
    const match = (pattern: RegExp) => availableFillings.find((name) => pattern.test((name || '').toLowerCase())) ?? null;
    return {
      silver: match(/сильвер|silver|стандарт\s*сильвер/),
      gold: match(/голд|gold|комфорт\s*голд/),
      platinum: match(/платинум|platinum|бизнес\s*платинум/),
    };
  }, [availableFillings]);

  // Ручки из API (отображение фото через getHandleImageSrc / image-src)
  const handles = useMemo(() => {
    return allHandles.map(h => ({
      id: h.id,
      name: h.name,
      photo: h.photo_path,
      price: h.price_rrc || h.price_opt || 0
    }));
  }, [allHandles]);

  // Получаем выбранную ручку из API данных
  const selectedHandleIdObj = selectedHandleId 
    ? allHandles.find(h => h.id === selectedHandleId)
    : null;

  // Типы покрытия: из каскада или из модели; при смене модели выставляем первый доступный
  const cascadeFinishes = useMemo(() => {
    if (selectedModelId && modelOptionsData.finishes.length > 0) return modelOptionsData.finishes;
    return finishes;
  }, [selectedModelId, modelOptionsData.finishes, finishes]);

  // Цвета только для выбранного типа покрытия, с учётом каскада (только доступные по опциям)
  const filteredCoatings = useMemo(() => {
    if (!selectedFinish || !coatings.length) return [];
    let list = coatings.filter((c) => c.coating_type === selectedFinish);
    const allowedColors = modelOptionsData.colorsByFinish[selectedFinish];
    // Fallback to full model palette when cascade endpoint returns an empty list.
    if (selectedModelId && Array.isArray(allowedColors) && allowedColors.length > 0) {
      const allowed = new Set(allowedColors);
      list = list.filter((c) => allowed.has(c.color_name));
    }
    return list;
  }, [coatings, selectedFinish, selectedModelId, modelOptionsData.colorsByFinish]);

  // Монохромная палитра: цвета выбранного типа ПЭТ/ПВХ/Эмаль
  const monochromeColors = useMemo(() => {
    if (!selectedFinish || !['ПЭТ', 'ПВХ', 'Эмаль'].includes(selectedFinish)) return [];
    return filteredCoatings.map((c) => ({
      id: c.id,
      name: c.color_name,
      color: '#FFFFFF',
      photo_path: c.photo_path ?? null,
    }));
  }, [filteredCoatings, selectedFinish]);

  // Древесная палитра: цвета выбранного типа Шпон
  const woodOptions = useMemo(() => {
    if (selectedFinish !== 'Шпон') return [];
    return filteredCoatings.map((c) => ({
      id: c.id,
      name: c.color_name,
      photo_path: c.photo_path ?? null,
    }));
  }, [filteredCoatings, selectedFinish]);

  // Опции кромки: из API (с наценкой). Если кромка в базе — без варианта «Без кромки», только цвета с +ценой
  const edgeOptions = useMemo(() => {
    const edgeList: Array<{ id: string; name: string; icon: string; color?: string; photo_path: string | null; surcharge?: number }> = [];
    if (!selectedModelData?.edge_in_base) edgeList.push({ id: 'none', name: 'Без кромки', icon: 'none', photo_path: null, surcharge: 0 });
    const allowed = selectedModelId && modelOptionsData.edges.length > 0 ? new Set(modelOptionsData.edges) : null;
    edges.forEach((edge) => {
      if (allowed && !allowed.has(edge.edge_color_name)) return;
      edgeList.push({
        id: edge.id,
        name: edge.edge_color_name,
        icon: 'none',
        photo_path: edge.photo_path ?? null,
        surcharge: edge.surcharge ?? 0,
      });
    });
    return edgeList;
  }, [edges, selectedModelId, modelOptionsData.edges, selectedModelData?.edge_in_base]);

  // Поставщики выбранной модели (по коду модели может быть несколько поставщиков)
  const modelSuppliers = useMemo(() => {
    if (selectedModelData?.suppliers?.length) return selectedModelData.suppliers;
    if (!selectedModelId || !rawModels) return [];
    const m = rawModels.find((r: { modelKey?: string; model?: string; suppliers?: string[] }) => (r.modelKey || r.model) === selectedModelId);
    return Array.isArray(m?.suppliers) ? m.suppliers : [];
  }, [selectedModelId, selectedModelData?.suppliers, rawModels]);

  // Наличники: только от поставщиков, привязанных к выбранной модели (коду). Если совпадений нет — показываем все (fallback), чтобы список не был пустым.
  const architraveOptions = useMemo(() => {
    const list = allArchitraves || [];
    const norm = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, '');
    const supplierSet = new Set(modelSuppliers.map((s: string) => norm(s)).filter(Boolean));
    let filtered = list;
    if (supplierSet.size > 0) {
      const bySupplier = list.filter((o: { supplier?: string }) => {
        const sup = (o.supplier || '').trim();
        if (!sup) return false;
        return supplierSet.has(norm(sup));
      });
      filtered = bySupplier.length > 0 ? bySupplier : list;
    }
    return filtered.map((o: { id: string; option_name?: string; option_type?: string; photo_path?: string | null; supplier?: string; price_surcharge?: number }) => ({
      id: o.id,
      name: o.option_name || o.option_type || '',
      photo_path: o.photo_path ?? null,
      supplier: o.supplier,
      price_surcharge: o.price_surcharge ?? 0,
    }));
  }, [allArchitraves, modelSuppliers]);

  // Ограничители из API (плоский список для API цены и корзины)
  const stopperOptions = useMemo(() => {
    const stopperList: Array<{ id: string; name: string; price?: number; photo_path: string | null }> = [{ id: 'none', name: 'Без ограничителя', photo_path: null }];
    allLimiters.forEach(limiter => {
      stopperList.push({
        id: limiter.id,
        name: limiter.name,
        price: limiter.price_rrc || limiter.price_opt,
        photo_path: limiter.photo_path ?? null,
      });
    });
    return stopperList;
  }, [allLimiters]);

  // Группировка ограничителей по виду (типу): SECRET DS, DS1 и т.д. — в каждом виде несколько цветов (вариантов)
  // Палитра цветов ограничителей: названия из каталога → hex для кружков (точное совпадение и по ключевым словам)
  const LIMITER_COLOR_HEX: Record<string, string> = {
    'чёрный': '#1a1a1a', 'черный': '#1a1a1a', 'black': '#1a1a1a', 'bl': '#1a1a1a',
    'белый': '#f5f5f5', 'white': '#f5f5f5',
    'хром': '#c8c8c8', 'chrome': '#c8c8c8', 'cp': '#c8c8c8',
    'матовый хром': '#9ca3af', 'мат. хром': '#9ca3af', 'sc': '#9ca3af',
    'бронза': '#b87333', 'bronze': '#b87333', 'ab': '#b87333', 'антик бронза': '#b87333',
    'черный никель': '#3d3d3d', 'black nickel': '#3d3d3d', 'bn': '#3d3d3d',
    'кофе': '#5c4033', 'coffee': '#5c4033', 'коф': '#5c4033', 'cof': '#5c4033',
    'золото': '#d4af37', 'gold': '#d4af37', 'золотой': '#d4af37',
    'жёлтый': '#e6c200', 'желтый': '#e6c200', 'yellow': '#e6c200',
    'серый': '#6b7280', 'gray': '#6b7280', 'grey': '#6b7280',
    'светло-серый': '#9ca3af', 'светло серый': '#9ca3af', 'light gray': '#9ca3af',
    'тёмно-серый': '#4b5563', 'темно-серый': '#4b5563', 'dark gray': '#4b5563',
    'синий': '#2563eb', 'blue': '#2563eb',
    'зелёный': '#16a34a', 'зеленый': '#16a34a', 'green': '#16a34a',
    'оливковый': '#6b7c2d', 'олива': '#6b7c2d', 'olive': '#6b7c2d',
    'коричневый': '#6f4e37', 'brown': '#6f4e37',
    'кремовый': '#f5e6d3', 'крем': '#f5e6d3', 'cream': '#f5e6d3',
    'бежевый': '#d4b896', 'beige': '#d4b896',
  };
  const getLimiterColorHex = (colorName: string, fallbackIdx: number): string => {
    const lower = (colorName || '').trim().toLowerCase();
    if (!lower) return `hsl(${(fallbackIdx * 55) % 360}, 35%, 50%)`;
    if (LIMITER_COLOR_HEX[lower]) return LIMITER_COLOR_HEX[lower];
    const byPart = Object.keys(LIMITER_COLOR_HEX).find(k => lower.includes(k) || k.includes(lower));
    if (byPart) return LIMITER_COLOR_HEX[byPart];
    if (/\bбл\b|чёрн|черн|black/i.test(lower)) return '#1a1a1a';
    if (/\bбел|white/i.test(lower)) return '#f5f5f5';
    if (/\bхром|chrome|sc\b|cp\b/i.test(lower)) return lower.includes('мат') ? '#9ca3af' : '#c8c8c8';
    if (/\bбронз|bronze|ab\b/i.test(lower)) return '#b87333';
    if (/\bникел|nickel|bn\b/i.test(lower)) return '#3d3d3d';
    if (/\bкофе|cof|coffee/i.test(lower)) return '#5c4033';
    if (/\bзолот|gold|жёлт|желт|yellow/i.test(lower)) return '#d4af37';
    if (/\bсер|gray|grey/i.test(lower)) return lower.includes('светл') ? '#9ca3af' : lower.includes('тёмн') ? '#4b5563' : '#6b7280';
    if (/\bсин|blue/i.test(lower)) return '#2563eb';
    if (/\bзелен|green|олив|olive/i.test(lower)) return lower.includes('олив') ? '#6b7c2d' : '#16a34a';
    if (/\bкоричн|brown/i.test(lower)) return '#6f4e37';
    return `hsl(${(fallbackIdx * 55) % 360}, 35%, 50%)`;
  };
  const parseLimiterType = (name: string): string => {
    const n = (name || '').toLowerCase();
    if (n.includes('secret ds')) return 'SECRET DS';
    if (n.includes('ds1')) return 'DS1';
    if (n.includes('ds2')) return 'DS2';
    if (n.includes('ds3')) return 'DS3';
    if (n.includes('mds')) return 'MDS';
    const m = name.match(/\b(DS\d+|[A-Z]{2,}\s*[A-Z0-9]*)/i);
    return m ? m[1].trim() : (name || '').slice(0, 30);
  };
  /** Отображаемые наименования типов ограничителей в блоке «ОГРАНИЧИТЕЛИ» */
  const LIMITER_TYPE_DISPLAY_NAMES: Record<string, string> = {
    'SECRET DS': 'Скрытый магнитный SECRET DS',
    'DS1': 'Напольный DS1',
    'DS2': 'Настенный DS2',
    'DS3': 'Напольный DS3',
    'MDS': 'Напольный магнитный MDS-1',
  };
  const parseLimiterColorName = (name: string): string => {
    const match = name.match(/цвет\s+([^,]+)/i) || name.match(/,\s*цвет\s+([^.]*)/i);
    return match ? match[1].trim() : '';
  };
  const stopperGroups = useMemo(() => {
    const groups = new Map<string, { typeId: string; typeName: string; variants: Array<{ id: string; name: string; photo_path: string | null; price: number; colorName: string; colorHex: string }> }>();
    allLimiters.forEach((limiter, idx) => {
      const typeKey = parseLimiterType(limiter.name);
      const typeId = typeKey.replace(/\s+/g, '_').toLowerCase() || `type_${idx}`;
      const typeName = LIMITER_TYPE_DISPLAY_NAMES[typeKey] ?? typeKey;
      const colorName = parseLimiterColorName(limiter.name);
      const colorHex = getLimiterColorHex(colorName, idx);
      if (!groups.has(typeId)) groups.set(typeId, { typeId, typeName, variants: [] });
      groups.get(typeId)!.variants.push({
        id: limiter.id,
        name: limiter.name,
        photo_path: limiter.photo_path ?? null,
        price: limiter.price_rrc || limiter.price_opt || 0,
        colorName: colorName || `Вариант ${groups.get(typeId)!.variants.length + 1}`,
        colorHex,
      });
    });
    return Array.from(groups.values());
  }, [allLimiters]);

  // Зеркало из API (опции типа "зеркало")
  const mirrorOptions = useMemo(() => {
    const mirrorList: Array<{id: string, name: string, price?: number}> = [{ id: 'none', name: 'Без зеркала' }];
    const mirrorOpts = options.filter(o => o.option_type === 'зеркало');
    mirrorOpts.forEach(opt => {
      mirrorList.push({
        id: opt.id,
        name: opt.option_name,
        price: opt.price_surcharge || undefined
      });
    });
    return mirrorList;
  }, [options]);

  // Порог из API (опции типа "порог")
  const thresholdOptions = useMemo(() => {
    return options.filter(o => o.option_type === 'порог');
  }, [options]);

  // Спецификация (динамические, обновляются при выборе)
  const getCoatingText = () => {
    if (!selectedCoatingId) return 'Не выбрано';
    const coating = coatings.find(c => c.id === selectedCoatingId);
    if (!coating) return 'Не выбрано';
    return `${coating.coating_type}; ${coating.color_name}`;
  };

  // Описания типов покрытия
  const coatingDescriptions: Record<string, string> = {
    'пэт': 'Покрытие, имитирующее эмаль, пластик',
    'пвх': 'Высококачественная современная пленка с различными текстурами',
    'эмаль': 'Многослойное лакокрасочное покрытие',
    'шпон': 'Натуральные срезы различных пород дерева с покрытием лаком',
    'алюминий': 'Металлическое покрытие',
  };
  const getCoatingDescription = () =>
    selectedFinish ? (coatingDescriptions[selectedFinish.toLowerCase()] ?? `Тип покрытия: ${selectedFinish}`) : '';

  const getFillingText = () => {
    const fillingOption = fillingOptions.find(f => f.type === filling);
    return fillingOption ? `${fillingOption.name} (${fillingOption.soundInsulation})` : 'Не выбрано';
  };

  // Кромка недоступна для модели, если нет ни одного варианта кроме «Без кромки»
  const edgeAvailableForModel = useMemo(
    () => edgeOptions.some((e) => e.id !== 'none'),
    [edgeOptions]
  );

  const getEdgeText = () => {
    if (!edgeAvailableForModel) return 'Кромка не доступна';
    if (!selectedEdgeId) return 'Без кромки';
    const edge = edges.find(e => e.id === selectedEdgeId);
    return edge ? edge.edge_color_name : 'Без кромки';
  };

  const getHandleText = () => {
    if (!selectedHandleId || !selectedHandleIdObj) return 'Не выбрано';
    return selectedHandleIdObj.name || 'Не выбрано';
  };

  const getHardwareKitText = () => {
    if (!selectedHardwareKit) return 'Не выбрано';
    const kit = configKits?.find((k) => k.id === selectedHardwareKit) || hardwareKits.find((k) => k.id === selectedHardwareKit);
    return kit?.name || selectedHardwareKit;
  };

  const getStopperText = () => {
    if (!selectedStopperId || selectedStopperId === 'none') return 'Без ограничителя';
    const stopper = allLimiters.find(l => l.id === selectedStopperId);
    if (!stopper) return 'Не выбрано';
    if (selectedStopperColor) {
      const color = stopperColors.find(c => c.id === selectedStopperColor);
      return color ? `${stopper.name} (${color.name})` : stopper.name;
    }
    return stopper.name;
  };

  const getMirrorText = () => {
    if (!selectedMirrorId || selectedMirrorId === 'none') return 'Без зеркала';
    const mirror = options.find(o => o.id === selectedMirrorId && o.option_type === 'зеркало');
    return mirror ? mirror.option_name : 'Не выбрано';
  };


  const getThresholdText = () => {
    if (!selectedThresholdId) return 'Нет';
    const threshold = options.find(o => o.id === selectedThresholdId && o.option_type === 'порог');
    return threshold ? threshold.option_name : 'Нет';
  };

  // Добавление в корзину: дверь, ручка, завертка, ограничитель — отдельными строками (qty редактируется в корзине)
  const addToCart = useCallback(() => {
    if (!priceData) return;

    const optionIds: string[] = [];
    if (selectedArchitraveId) optionIds.push(selectedArchitraveId);

    const breakdown = priceData.breakdown || [];
    const handleEntry = breakdown.find(b => b.label.startsWith('Ручка:'));
    const backplateEntry = breakdown.find(b => b.label.startsWith('Завертка:'));
    const limiterEntry = breakdown.find(b => b.label.startsWith('Ограничитель:'));
    const handleAmount = handleEntry?.amount ?? 0;
    const backplateAmount = backplateEntry?.amount ?? 0;
    const limiterAmount = limiterEntry?.amount ?? 0;
    const doorPrice = priceData.total - handleAmount - backplateAmount - limiterAmount;

    const ts = Date.now();
    const handleName = selectedHandleIdObj?.name || '';
    const limiterName = selectedStopperId && selectedStopperId !== 'none'
      ? (allLimiters.find(l => l.id === selectedStopperId)?.name || '')
      : '';

    const doorItem: CartItem = {
      id: `door-${selectedModelId}-${ts}`,
      itemType: 'door',
      model: selectedModelData?.model_name || '',
      style: selectedModelData?.style || '',
      width,
      height,
      color: getCoatingText(),
      edge: selectedEdgeId ? 'да' : 'нет',
      unitPrice: doorPrice,
      qty: 1,
      handleId: selectedHandleId || undefined,
      handleName: handleName || undefined,
      coatingId: selectedCoatingId || undefined,
      edgeId: selectedEdgeId || undefined,
      optionIds: optionIds.length > 0 ? optionIds : undefined,
      sku_1c: priceData.sku || undefined,
      reversible,
      mirror: selectedMirrorId && selectedMirrorId !== 'none' ? selectedMirrorId : undefined,
      threshold: selectedThresholdId != null,
      hardwareKitId: selectedHardwareKit || undefined,
    };

    const newItems: CartItem[] = [doorItem];

    if (selectedHandleId && handleAmount >= 0) {
      newItems.push({
        id: `handle-${selectedHandleId}-${ts}`,
        itemType: 'handle',
        unitPrice: handleAmount,
        qty: 1,
        handleId: selectedHandleId,
        handleName: handleName || undefined,
      });
    }
    if (hasLock && selectedHandleId) {
      newItems.push({
        id: `backplate-${selectedHandleId}-${ts}`,
        itemType: 'backplate',
        unitPrice: backplateAmount,
        qty: 1,
        handleId: selectedHandleId,
        handleName: handleName || undefined,
      });
    }
    if (selectedStopperId && selectedStopperId !== 'none' && limiterAmount >= 0) {
      newItems.push({
        id: `limiter-${selectedStopperId}-${ts}`,
        itemType: 'limiter',
        unitPrice: limiterAmount,
        qty: 1,
        limiterId: selectedStopperId,
        limiterName: limiterName || undefined,
      });
    }

    setCart(prev => [...prev, ...newItems]);
    setOriginalPrices(prev => {
      const next = { ...prev };
      newItems.forEach(item => { next[item.id] = item.unitPrice; });
      return next;
    });
  }, [
    selectedModelId,
    selectedModelData,
    priceData,
    width,
    height,
    selectedCoatingId,
    selectedEdgeId,
    selectedHandleId,
    selectedHandleIdObj,
    selectedStopperId,
    allLimiters,
    selectedArchitraveId,
    selectedMirrorId,
    selectedThresholdId,
    hasLock,
    getCoatingText,
    selectedHardwareKit,
  ]);

  // Генерация документов
  const generateDocument = async (type: 'quote' | 'invoice' | 'order') => {
    if (cart.length === 0) {
      alert('Корзина пуста');
      return;
    }

    if (!selectedClient) {
      setShowClientManager(true);
      return;
    }

    try {
      const response = await fetchWithAuth('/api/documents/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          type,
          clientId: selectedClient,
          items: cart.map(item => ({
            id: item.id,
            type: item.itemType ?? (item.limiterId ? 'limiter' : item.handleId ? 'handle' : 'door'),
            model: item.model,
            style: item.style,
            color: item.color,
            width: item.width,
            height: item.height,
            qty: item.qty,
            unitPrice: item.unitPrice,
            sku_1c: item.sku_1c,
            handleId: item.handleId,
            limiterId: item.limiterId,
            coatingId: item.coatingId,
            edgeId: item.edgeId,
            optionIds: item.optionIds,
            hardwareKitId: item.hardwareKitId,
            reversible: item.reversible,
            mirror: item.mirror,
            threshold: item.threshold,
          })),
          totalAmount: cart.reduce((sum, item) => sum + item.unitPrice * item.qty, 0)
        })
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        if (type === 'order') {
          a.download = `Заказ_${new Date().toISOString().split('T')[0]}.xlsx`;
        } else {
          a.download = `${type === 'quote' ? 'КП' : 'Счет'}_${new Date().toISOString().split('T')[0]}.pdf`;
        }
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        let message = 'Ошибка при генерации документа';
        try {
          const json = await response.json();
          if (json?.error?.message) message = json.error.message;
          if (json?.error?.details && typeof json.error.details === 'object') {
            clientLogger.error('Document generation validation details', { details: json.error.details });
          }
        } catch {
          if (response.statusText) message = `${message}: ${response.statusText}`;
        }
        alert(message);
      }
    } catch (error) {
      clientLogger.error('Error generating document:', error);
      const message = error instanceof Error ? error.message : 'Сеть или сервер недоступны';
      alert(`Ошибка при генерации документа: ${message}`);
    }
  };

  // Расчёт цены только после выбора: Стиль, Модель, Размеры, Реверс, Наполнение, Покрытие и Цвет
  const canCalculatePrice = Boolean(
    selectedStyle &&
    selectedModelId &&
    width &&
    height &&
    selectedFinish &&
    selectedCoatingId
  );

  // Сброс цены при смене модели (другая модель — сразу очищаем, чтобы не показывать старую цену)
  const prevModelIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevModelIdRef.current !== selectedModelId) {
      prevModelIdRef.current = selectedModelId;
      clearPrice();
    }
  }, [selectedModelId, clearPrice]);

  // Ключ покрытия для сброса цены и зависимостей расчёта (finish + color)
  const coatingKey = useMemo(() => {
    if (!selectedCoatingId) return null;
    const c = coatings.find((x) => x.id === selectedCoatingId);
    return c ? `${selectedCoatingId}-${c.coating_type}-${c.color_name}` : selectedCoatingId;
  }, [selectedCoatingId, coatings]);

  // Сброс цены при смене покрытия/цвета, чтобы не показывать старую цену до прихода нового расчёта
  const prevCoatingKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevCoatingKeyRef.current !== coatingKey) {
      prevCoatingKeyRef.current = coatingKey;
      if (coatingKey != null) clearPrice();
    }
  }, [coatingKey, clearPrice]);

  useEffect(() => {
    if (!canCalculatePrice) {
      clearPrice();
      return;
    }
    // Не вызывать расчёт, пока детали модели не синхронизированы с выбранной моделью (избегаем запроса со старым style)
    if (selectedModelData?.id !== selectedModelId) return;

    const coating = coatings.find(c => c.id === selectedCoatingId);
    const finish = coating?.coating_type;
    const colorName = coating?.color_name;
    const optionIds: string[] = [];
    if (selectedArchitraveId) optionIds.push(selectedArchitraveId);

    const selectedArchitraveSupplier = (allArchitraves || []).find((a: { id: string; supplier?: string }) => a.id === selectedArchitraveId)?.supplier;

    calculatePrice({
      door_model_id: selectedModelId!,
      style: selectedModelData?.style || undefined,
      finish: finish || undefined,
      color: colorName || undefined,
      coating_id: selectedCoatingId || undefined,
      edge_id: selectedEdgeId || undefined,
      option_ids: optionIds.length > 0 ? optionIds : undefined,
      handle_id: selectedHandleId || undefined,
      limiter_id: selectedStopperId && selectedStopperId !== 'none' ? selectedStopperId : undefined,
      hardware_kit_id: selectedHardwareKit || undefined,
      width,
      height,
      reversible,
      mirror: selectedMirrorId && selectedMirrorId !== 'none' ? (selectedMirrorId as 'one' | 'both' | 'mirror_one' | 'mirror_both') : 'none',
      threshold: selectedThresholdId != null,
      filling: selectedFilling ?? undefined,
      backplate: hasLock === true,
      supplier: selectedArchitraveSupplier,
    }).catch(err => {
      console.error('Ошибка расчета цены:', err);
    });
  }, [canCalculatePrice, selectedModelId, selectedModelData?.id, selectedModelData?.style, selectedCoatingId, coatingKey, selectedEdgeId, selectedHandleId, selectedStopperId, selectedArchitraveId, selectedHardwareKit, reversible, selectedMirrorId, selectedThresholdId, width, height, selectedFilling, hasLock, calculatePrice, clearPrice, selectedModelData, coatings, allArchitraves]);

  // Форматируем цену (показываем подсказку, если не выбраны все обязательные параметры)
  const price = useMemo(() => {
    if (priceCalculating) return 'Рассчитывается...';
    if (priceData) return `${priceData.total.toLocaleString('ru-RU')} Р`;
    if (!canCalculatePrice) return 'Для расчета цены выберите\nСтиль, Модель\nРазмеры, Наполнение\nПокрытие и Цвет';
    return '—';
  }, [priceData, priceCalculating, canCalculatePrice]);

  return (
    <>
      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @keyframes slideInFromLeft {
          from {
            transform: translateX(-10px);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
      `}</style>
      <div 
        className="min-h-screen"
        style={{ 
          backgroundColor: designTokens.colors.gray[50],
          maxWidth: '1920px', 
          margin: '0 auto',
          width: '100%'
        }}
      >
      {/* Header - как в старой странице */}
      <header className="bg-white border-b-2 border-gray-300">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center">
            <div className="flex items-baseline space-x-3 flex-1 min-w-0">
              <Link href="/" className="text-2xl font-bold text-black">
                Domeo
              </Link>
              <span className="text-black text-lg font-bold">•</span>
              <span className="text-lg font-semibold text-black">Doors</span>
            </div>
            <nav className="flex items-center space-x-4 justify-end flex-shrink-0 ml-auto">
              {isAuthenticated && <NotificationBell userRole={user?.role || "executor"} />}
              <Link 
                href="/" 
                className="px-3 py-1 border border-black text-black hover:bg-black hover:text-white transition-all duration-200 text-sm"
              >
                ← Категории
              </Link>
              {isAuthenticated && (
                <button
                  onClick={() => setShowClientManager(true)}
                  className="px-3 py-1 border border-black text-black hover:bg-black hover:text-white transition-all duration-200 text-sm"
                >
                  👤 {selectedClientName || 'Заказчик'}
                </button>
              )}
              {tab === "admin" && (
                <button
                  onClick={() => setTab("admin")}
                  className={`px-3 py-1 border transition-all duration-200 text-sm ${
                    tab === "admin" 
                      ? "bg-black text-white border-black" 
                      : "border-black text-black hover:bg-black hover:text-white"
                  }`}
                >
                  Админ
                </button>
              )}
              <button
                onClick={() => {
                  // Сохраняем текущие цены как базовые для расчета дельты
                  const basePrices: Record<string, number> = {};
                  cart.forEach(item => {
                    basePrices[item.id] = item.unitPrice;
                  });
                  setCartManagerBasePrices(basePrices);
                  setShowCartManager(true);
                }}
                className="flex items-center space-x-2 px-3 py-1 border border-black text-black hover:bg-black hover:text-white transition-all duration-200 text-sm"
              >
                <span>🛒</span>
                <span>Корзина</span>
                {cart.length > 0 && (
                  <span className="border border-black text-black text-xs rounded-full w-4 h-4 flex items-center justify-center">
                    {cart.length}
                  </span>
                )}
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{ padding: `${designTokens.spacing[6]} ${designTokens.spacing[6]}` }}>
        <div style={{ maxWidth: '1614px', margin: '0 auto' }}>
          <div className="flex gap-8">
            {/* Левая колонка - выбор моделей */}
            <div style={{ flex: '0 0 795px', maxWidth: '795px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: designTokens.spacing[8] }}>
                {/* Заголовок "Стили" и кнопки выбора в одну строку */}
                <div className="flex items-center gap-4">
                  <h2 
                    style={{
                      fontFamily: designTokens.typography.fontFamily.sans.join(', '),
                      fontSize: designTokens.typography.fontSize['3xl'],
                      fontWeight: designTokens.typography.fontWeight.medium,
                      lineHeight: designTokens.typography.lineHeight.tight,
                      color: designTokens.colors.gray[800],
                      letterSpacing: '-0.02em',
                      margin: 0,
                      textAlign: 'left',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Стили
                  </h2>
                  {/* Кнопки выбора стилей */}
                  <div className="flex gap-2">
                    {styles.map((style) => (
                      <button
                        key={style.id}
                        onClick={() => setSelectedStyle(style.name)}
                        className="group relative transition-all duration-200"
                        style={{
                          borderRadius: 0,
                          border: 'none',
                          backgroundColor: selectedStyle === style.name 
                            ? designTokens.colors.black[950] 
                            : designTokens.colors.gray[100],
                          color: selectedStyle === style.name 
                            ? '#FFFFFF' 
                            : designTokens.colors.gray[900],
                          padding: `${designTokens.spacing[2]} ${designTokens.spacing[4]}`,
                          fontSize: designTokens.typography.fontSize.sm,
                          fontWeight: designTokens.typography.fontWeight.medium,
                          cursor: 'pointer',
                          boxShadow: selectedStyle === style.name 
                            ? designTokens.boxShadow.md 
                            : 'none',
                        }}
                        onMouseEnter={(e) => {
                          if (selectedStyle !== style.name) {
                            e.currentTarget.style.backgroundColor = designTokens.colors.gray[200];
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedStyle !== style.name) {
                            e.currentTarget.style.backgroundColor = designTokens.colors.gray[100];
                          }
                            }}
                          >
                            {style.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Заголовок "Модели" */}
                <div>
                  <h2 
                    style={{
                      fontFamily: designTokens.typography.fontFamily.sans.join(', '),
                      fontSize: designTokens.typography.fontSize['3xl'],
                      fontWeight: designTokens.typography.fontWeight.medium,
                      lineHeight: designTokens.typography.lineHeight.tight,
                      color: designTokens.colors.gray[800],
                      letterSpacing: '-0.02em',
                      margin: `0 0 ${designTokens.spacing[5]} 0`,
                      textAlign: 'left'
                    }}
                  >
                    Модели
                  </h2>

                  {/* Табы — липкий блок при скролле (как превью справа) */}
                  <div 
                    className="sticky flex gap-6 mb-5 overflow-x-auto pb-1 z-10"
                    style={{
                      top: 0,
                      borderBottom: `2px solid ${designTokens.colors.gray[200]}`,
                      backgroundColor: designTokens.colors.gray[50],
                      paddingTop: designTokens.spacing[2],
                    }}
                  >
                    <button
                      onClick={() => setActiveTab('полотно')}
                      className="pb-3 px-2 font-semibold transition-all duration-200 whitespace-nowrap relative"
                      style={{ 
                        fontFamily: designTokens.typography.fontFamily.sans.join(', '),
                        fontSize: designTokens.typography.fontSize.xs,
                        fontWeight: designTokens.typography.fontWeight.semibold,
                        letterSpacing: '0.02em',
                        color: activeTab === 'полотно' 
                          ? designTokens.colors.gray[900] 
                          : designTokens.colors.gray[500]
                      }}
                      onMouseEnter={(e) => {
                        if (activeTab !== 'полотно') {
                          e.currentTarget.style.color = designTokens.colors.gray[700];
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (activeTab !== 'полотно') {
                          e.currentTarget.style.color = designTokens.colors.gray[500];
                        }
                      }}
                    >
                      ПОЛОТНО
                      {activeTab === 'полотно' && (
                        <div 
                          className="absolute bottom-0 left-0 right-0 rounded-full"
                          style={{
                            height: '2px',
                            backgroundColor: designTokens.colors.black[950],
                            animation: 'slideInFromLeft 0.2s ease-out'
                          }}
                        />
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab('размеры')}
                      className={`pb-3 px-2 font-semibold transition-all duration-300 whitespace-nowrap relative ${
                        activeTab === 'размеры'
                          ? 'text-gray-900'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      style={{ 
                        fontFamily: 'Roboto, sans-serif',
                        fontSize: '13px',
                        fontWeight: 600,
                        letterSpacing: '0.3px'
                      }}
                    >
                      РАЗМЕРЫ
                      {activeTab === 'размеры' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full animate-in slide-in-from-left duration-300" />
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab('покрытие')}
                      className={`pb-3 px-2 font-semibold transition-all duration-300 whitespace-nowrap relative ${
                        activeTab === 'покрытие'
                          ? 'text-gray-900'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      style={{ 
                        fontFamily: 'Roboto, sans-serif',
                        fontSize: '13px',
                        fontWeight: 600,
                        letterSpacing: '0.3px'
                      }}
                    >
                      ПОКРЫТИЕ И ЦВЕТ
                      {activeTab === 'покрытие' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full animate-in slide-in-from-left duration-300" />
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab('фурнитура')}
                      className={`pb-3 px-2 font-semibold transition-all duration-300 whitespace-nowrap relative ${
                        activeTab === 'фурнитура'
                          ? 'text-gray-900'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      style={{ 
                        fontFamily: 'Roboto, sans-serif',
                        fontSize: '13px',
                        fontWeight: 600,
                        letterSpacing: '0.3px'
                      }}
                    >
                      ФУРНИТУРА
                      {activeTab === 'фурнитура' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full animate-in slide-in-from-left duration-300" />
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab('наличники')}
                      className={`pb-3 px-2 font-semibold transition-all duration-300 whitespace-nowrap relative ${
                        activeTab === 'наличники'
                          ? 'text-gray-900'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      style={{ 
                        fontFamily: 'Roboto, sans-serif',
                        fontSize: '13px',
                        fontWeight: 600,
                        letterSpacing: '0.3px'
                      }}
                    >
                      НАЛИЧНИКИ
                      {activeTab === 'наличники' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full animate-in slide-in-from-left duration-300" />
                      )}
                    </button>
                    <button
                      onClick={() => setActiveTab('доп-опции')}
                      className={`pb-3 px-2 font-semibold transition-all duration-300 whitespace-nowrap relative ${
                        activeTab === 'доп-опции'
                          ? 'text-gray-900'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                      style={{ 
                        fontFamily: 'Roboto, sans-serif',
                        fontSize: '13px',
                        fontWeight: 600,
                        letterSpacing: '0.3px'
                      }}
                    >
                      ДОП ОПЦИИ
                      {activeTab === 'доп-опции' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-900 rounded-full animate-in slide-in-from-left duration-300" />
                      )}
                    </button>
                  </div>

                  {/* Сетка моделей */}
                  {activeTab === 'полотно' && (
                    <div className="space-y-5">
                      {/* Модели */}
                      <div className="grid grid-cols-4 gap-2">
                        {dataLoading ? (
                          <div className="col-span-5 text-center py-8 text-gray-500">Загрузка моделей...</div>
                        ) : filteredModels.length === 0 ? (
                          <div className="col-span-5 text-center py-8 text-gray-500">Модели не найдены</div>
                        ) : (
                          filteredModels.map((model) => (
                            <button
                              key={model.id}
                              onClick={() => {
                                setSelectedModelId(model.id);
                                setSelectedModel(model.model_name);
                              }}
                              className={`group relative overflow-hidden transition-all duration-300 ${
                                selectedModelId === model.id
                                  ? 'shadow-lg scale-105'
                                  : 'border-2 border-gray-200 shadow-sm hover:shadow-md hover:border-gray-400 hover:scale-102'
                              }`}
                            >
                              {/* Миниатюра модели — бокс по контуру фото */}
                              <div className="bg-gray-100 relative overflow-hidden min-h-[60px]">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  loading="lazy"
                                  src={getImageSrcWithPlaceholder(model.photo, createPlaceholderSvgDataUrl(400, 800, '#E2E8F0', '#4A5568', formatModelNameForCard(model.model_name || model.id)))}
                                  alt={formatModelNameForCard(model.model_name || model.id)}
                                  className="w-full h-auto block bg-white"
                                  onError={(e) => {
                                    const placeholder = createPlaceholderSvgDataUrl(400, 800, '#E2E8F0', '#4A5568', formatModelNameForCard(model.model_name || model.id));
                                    if (e.currentTarget.src !== placeholder) e.currentTarget.src = placeholder;
                                  }}
                                />
                              </div>
                              {/* Код модели Domeo (Web) */}
                              <div style={{ padding: '8px', background: 'white', textAlign: 'center' }}>
                                <div 
                                  className="font-medium text-gray-900"
                                  style={{ fontSize: '12px' }}
                                  title={model.model_name}
                                >
                                  {formatModelNameForCard(model.model_name || model.id)}
                                </div>
                              </div>
                              {/* Галочка при выборе */}
                              {selectedModelId === model.id && (
                                <div className="absolute top-2 right-2 z-10 animate-in zoom-in duration-300">
                                  <div className="w-5 h-5 bg-gray-900 rounded-full flex items-center justify-center shadow-md">
                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                </div>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Вкладка "РАЗМЕРЫ" */}
                  {activeTab === 'размеры' && (
                    <div className="space-y-5">
                      {/* Размеры */}
                      <div>
                        <h3 
                          className="mb-3 font-semibold"
                          style={{
                            fontFamily: 'Roboto, sans-serif',
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#3D3A3A'
                          }}
                        >
                          РАЗМЕРЫ
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                          {/* Ширина */}
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Ширина (мм)</label>
                            <div className="flex gap-2 flex-wrap">
                              {widthOptions.map((w) => (
                                <button
                                  key={w}
                                  onClick={() => setWidth(w)}
                                  className={`px-6 py-2.5 rounded-lg font-semibold transition-all duration-300 ${
                                    width === w
                                      ? 'bg-gray-900 text-white shadow-md scale-105'
                                      : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-gray-500 hover:shadow-sm'
                                  }`}
                                  style={{ fontSize: '13px' }}
                                >
                                  {w}
                                </button>
                              ))}
                            </div>
                          </div>
                          {/* Высота */}
                          <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">Высота (мм)</label>
                            <div className="flex gap-2 flex-wrap">
                              {heightOptions.map((h) => (
                                <button
                                  key={h.value}
                                  onClick={() => setHeight(h.value)}
                                  className={`px-6 py-2.5 rounded-lg font-semibold transition-all duration-300 ${
                                    height === h.value
                                      ? 'bg-gray-900 text-white shadow-md scale-105'
                                      : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-gray-500 hover:shadow-sm'
                                  }`}
                                  style={{ fontSize: '13px' }}
                                >
                                  {h.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Реверсные двери */}
                      <div>
                        <h3 
                          className="mb-3 font-semibold"
                          style={{
                            fontFamily: 'Roboto, sans-serif',
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#3D3A3A'
                          }}
                        >
                          РЕВЕРСНЫЕ ДВЕРИ
                        </h3>
                        <div className="flex gap-3">
                          <button
                            onClick={() => setReversible(false)}
                            className={`px-6 py-2.5 rounded-lg font-semibold transition-all duration-300 ${
                              !reversible
                                ? 'bg-gray-900 text-white shadow-md scale-105'
                                : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-gray-500 hover:shadow-sm'
                            }`}
                            style={{ fontSize: '13px' }}
                          >
                            Нет
                          </button>
                          <button
                            type="button"
                            disabled={!modelOptionsData.revers_available}
                            onClick={() => modelOptionsData.revers_available && setReversible(true)}
                            className={`px-6 py-2.5 rounded-lg font-semibold transition-all duration-300 ${
                              !modelOptionsData.revers_available
                                ? 'bg-gray-200 text-gray-400 border-2 border-gray-200 cursor-not-allowed'
                                : reversible
                                  ? 'bg-gray-900 text-white shadow-md scale-105'
                                  : 'bg-white text-gray-700 border-2 border-gray-300 hover:border-gray-500 hover:shadow-sm'
                            }`}
                            style={{ fontSize: '13px' }}
                            title={!modelOptionsData.revers_available ? 'Реверс недоступен для выбранной модели' : undefined}
                          >
                            Да
                          </button>
                        </div>
                        <p className="mt-2 text-xs text-gray-600 font-medium">Дверь со скрытым коробом, открывается внутрь</p>
                      </div>

                      {/* Наполнение: 3 столбца в рамке, выбор — галочкой как у других блоков; Rw: на второй строке */}
                      <div>
                        <h3 className="mb-3 font-semibold" style={{ fontFamily: 'Roboto, sans-serif', fontSize: '14px', fontWeight: 600, color: '#3D3A3A' }}>
                          НАПОЛНЕНИЕ
                        </h3>
                        <div className="grid grid-cols-3 gap-4">
                          {FILLING_BLOCKS.map((block) => {
                            const desc = FILLING_DESCRIPTIONS[block.descKey];
                            const modelFillingName = fillingBlockMatches[block.id];
                            const enabled = !!modelFillingName;
                            const selected = selectedFilling === modelFillingName;
                            const specsParts = desc?.specs ? desc.specs.split(/\s*\|\s*/) : [];
                            const line1 = specsParts[0]?.trim() ?? '';
                            const line2 = specsParts[1]?.trim() ?? '';
                            return (
                              <div
                                key={block.id}
                                className={`relative rounded-lg border-2 p-3 text-left transition ${
                                  enabled
                                    ? selected
                                      ? 'border-gray-900 ring-1 ring-gray-100 shadow-md bg-gray-50'
                                      : 'border-gray-300 hover:border-gray-400 cursor-pointer bg-white'
                                    : 'border-gray-200 bg-gray-50 opacity-70 cursor-not-allowed pointer-events-none'
                                }`}
                                role={enabled ? 'button' : undefined}
                                tabIndex={enabled ? 0 : undefined}
                                onClick={enabled ? () => setSelectedFilling(selected ? null : modelFillingName!) : undefined}
                                onKeyDown={enabled ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedFilling(selected ? null : modelFillingName!); } } : undefined}
                              >
                                {enabled && selected && (
                                  <div className="absolute top-1 right-1 w-3.5 h-3.5 bg-gray-900 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                                    <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                  </div>
                                )}
                                <div className="font-medium text-gray-900">{block.title}</div>
                                {desc && (line1 || line2) && (
                                  <div className="text-gray-600 font-normal mt-0.5" style={{ fontSize: '13px' }}>
                                    {line1 && <div>{line1}</div>}
                                    {line2 && <div>{line2}</div>}
                                  </div>
                                )}
                                {desc && (
                                  <p className="mt-2 text-gray-600 text-sm pl-0.5">
                                    Эффект: {desc.effect}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Вкладка "ПОКРЫТИЕ И ЦВЕТ" */}
                  {activeTab === 'покрытие' && (
                    <div className="space-y-5">
                      {/* Выбор типа покрытия */}
                      <div>
                        <h3 
                          className="mb-3 font-semibold"
                          style={{
                            fontFamily: 'Roboto, sans-serif',
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#3D3A3A',
                            letterSpacing: '0.3px'
                          }}
                        >
                          ПОКРЫТИЕ
                        </h3>
                        <div className="space-y-3">
                          <div className="flex gap-2 flex-wrap">
                            {(cascadeFinishes.length ? cascadeFinishes : ['ПЭТ', 'ПВХ', 'Шпон', 'Эмаль']).map((finishType) => (
                              <button
                                key={finishType}
                                onClick={() => {
                                  setSelectedFinish(finishType);
                                  if (finishType === 'Шпон') {
                                    setSelectedColor(null);
                                    setSelectedWood(null);
                                    setSelectedCoatingId(null);
                                  } else {
                                    setSelectedWood(null);
                                    setSelectedCoatingId(null);
                                    if (!selectedColor) setSelectedColor('Белый');
                                  }
                                }}
                                className={`relative flex items-center justify-center gap-2 px-4 py-2.5 rounded font-semibold transition-all duration-300 ${
                                  selectedFinish === finishType
                                    ? 'bg-gray-900 text-white shadow-md'
                                    : 'bg-white text-gray-700 border border-gray-200 hover:border-gray-300 hover:shadow-sm'
                                }`}
                                style={{ 
                                  fontFamily: 'Roboto, sans-serif',
                                  fontSize: '13px',
                                  fontWeight: 600,
                                  letterSpacing: '0.2px',
                                  minWidth: '80px'
                                }}
                              >
                                {selectedFinish === finishType && (
                                  <div className="flex-shrink-0 w-4 h-4 bg-white rounded-full flex items-center justify-center">
                                    <svg className="w-2.5 h-2.5 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                )}
                                <span>{finishType}</span>
                              </button>
                            ))}
                          </div>
                          {/* Описание выбранного типа покрытия */}
                          <div className="text-sm text-gray-600" style={{ fontFamily: 'Roboto, sans-serif', fontSize: '13px', lineHeight: '1.5' }}>
                            {getCoatingDescription()}
                          </div>
                        </div>
                      </div>

                      {/* Монохромная палитра (для ПЭТ, ПВХ и Эмаль) */}
                      {selectedFinish && ['ПЭТ', 'ПВХ', 'Эмаль'].includes(selectedFinish) && (
                        <div>
                          <h3 
                            className="mb-4 font-semibold"
                            style={{
                              fontFamily: 'Roboto, sans-serif',
                              fontSize: '16px',
                              fontWeight: 600,
                              color: '#3D3A3A'
                            }}
                          >
                            МОНОХРОМНАЯ ПАЛИТРА
                          </h3>
                          <div className="grid grid-cols-4 gap-2">
                            {monochromeColors.map((color) => (
                              <button
                                key={color.id}
                                onClick={() => {
                                  setSelectedCoatingId(color.id);
                                  setSelectedColor(color.name);
                                  setSelectedWood(null);
                                }}
                                className={`group relative overflow-hidden rounded border transition-all duration-300 ${
                                  selectedCoatingId === color.id
                                    ? 'border-gray-900 ring-1 ring-gray-100 shadow-md scale-105'
                                    : 'border-gray-200 shadow-sm hover:shadow-sm hover:border-gray-400 hover:scale-102'
                                }`}
                              >
                                {/* Миниатюра — бокс по контуру фото */}
                                <div className="relative w-full min-h-[60px]">
                                  {getImageSrc(color.photo_path) ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      loading="lazy"
                                      src={getImageSrc(color.photo_path)}
                                      alt={color.name}
                                      className="w-full h-auto block bg-white"
                                      onError={(e) => {
                                        const target = e.currentTarget;
                                        target.style.display = 'none';
                                        const fallback = target.nextElementSibling as HTMLElement | null;
                                        if (fallback) fallback.style.display = 'block';
                                      }}
                                    />
                                  ) : null}
                                  <div
                                    className="w-full min-h-[60px]"
                                    style={{
                                      display: getImageSrc(color.photo_path) ? 'none' : 'block',
                                      backgroundColor: color.color,
                                      border: color.color === '#FFFFFF' ? '1px solid #E5E5E5' : 'none',
                                    }}
                                  />
                                  {/* Галочка при выборе */}
                                  {selectedCoatingId === color.id && (
                                    <div className="absolute top-2 right-2 z-10 animate-in zoom-in duration-300">
                                      <div className="w-5 h-5 bg-gray-900 rounded-full flex items-center justify-center shadow-md">
                                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                {/* Название цвета */}
                                <div style={{ padding: '8px', background: 'white', textAlign: 'center' }}>
                                  <div 
                                    className="font-medium text-gray-900"
                                    style={{ fontSize: '12px' }}
                                    title={color.name}
                                  >
                                    {color.name}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Древесная палитра (для Шпон) */}
                      {selectedFinish === 'Шпон' && (
                        <div>
                          <h3 
                            className="mb-4 font-semibold"
                            style={{
                              fontFamily: 'Roboto, sans-serif',
                              fontSize: '16px',
                              fontWeight: 600,
                              color: '#3D3A3A'
                            }}
                          >
                            ДРЕВЕСНАЯ ПАЛИТРА
                          </h3>
                          <div className="grid grid-cols-4 gap-2">
                            {woodOptions.map((wood) => (
                              <button
                                key={wood.id}
                                onClick={() => {
                                  setSelectedCoatingId(wood.id);
                                  setSelectedWood(wood.name);
                                  setSelectedColor(null);
                                }}
                                className={`group relative overflow-hidden rounded border transition-all duration-300 ${
                                  selectedWood === wood.name
                                    ? 'border-gray-900 ring-1 ring-gray-100 shadow-md scale-105'
                                    : 'border-gray-200 shadow-sm hover:shadow-sm hover:border-gray-400 hover:scale-102'
                                }`}
                              >
                                {/* Миниатюра дерева — бокс по контуру фото */}
                                <div className="relative w-full min-h-[60px]">
                                  <img
                                    loading="lazy"
                                    src={getImageSrcWithPlaceholder(wood.photo_path, createPlaceholderSvgDataUrl(400, 400, '#8B7355', '#FFFFFF', wood.name))}
                                    alt={wood.name}
                                    className="w-full h-auto block bg-white"
                                  />
                                  {/* Галочка при выборе */}
                                  {selectedWood === wood.name && (
                                    <div className="absolute top-2 right-2 z-10 animate-in zoom-in duration-300">
                                      <div className="w-5 h-5 bg-gray-900 rounded-full flex items-center justify-center shadow-md">
                                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                  </div>
                                    </div>
                                  )}
                                </div>
                                {/* Название */}
                                <div style={{ padding: '8px', background: 'white', textAlign: 'center' }}>
                                  <div 
                                    className="font-medium text-gray-900"
                                    style={{ fontSize: '12px' }}
                                    title={wood.name}
                                  >
                                    {wood.name}
                                  </div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Алюминиевая кромка */}
                      <div>
                        <h3 
                          className="mb-4 font-semibold"
                          style={{
                            fontFamily: 'Roboto, sans-serif',
                            fontSize: '16px',
                            fontWeight: 600,
                            color: '#3D3A3A'
                          }}
                        >
                          АЛЮМИНИЕВАЯ КРОМКА
                        </h3>
                        {!edgeAvailableForModel ? (
                          <div className="py-3 px-4 rounded border border-gray-200 bg-gray-50 text-gray-600" style={{ fontSize: '14px' }}>
                            Кромка не доступна
                          </div>
                        ) : (
                        <div className="grid grid-cols-4 gap-2">
                          {edgeOptions.map((edge) => (
                            <button
                              key={edge.id}
                              onClick={() => setSelectedEdgeId(edge.id === 'none' ? null : edge.id)}
                              className={`group relative overflow-hidden rounded border transition-all duration-300 ${
                                selectedEdgeId === edge.id || (edge.id === 'none' && !selectedEdgeId)
                                  ? 'border-gray-900 ring-1 ring-gray-100 shadow-md scale-105'
                                  : 'border-gray-200 shadow-sm hover:shadow-sm hover:border-gray-400 hover:scale-102'
                              }`}
                            >
                              {/* Изображение кромки — бокс по контуру фото */}
                              <div className="bg-gray-100 relative overflow-hidden min-h-[48px]">
                                {getImageSrc(edge.photo_path) ? (
                                  <img
                                    loading="lazy"
                                    src={getImageSrc(edge.photo_path)}
                                    alt={edge.name}
                                    className="w-full h-auto block bg-white"
                                    onError={(e) => {
                                      // Fallback на цвет, если изображение не загрузилось
                                      const target = e.target as HTMLImageElement;
                                      target.style.display = 'none';
                                      const parent = target.parentElement;
                                      if (parent) {
                                        parent.style.backgroundColor = (edge as any).color || '#E5E5E5';
                                      }
                                    }}
                                  />
                                ) : (
                                  <div className="w-full min-h-[48px] flex items-center justify-center bg-gray-100">
                                    {edge.id === 'none' && (
                                      <div className="text-gray-400 text-xs">—</div>
                                    )}
                                  </div>
                                )}
                              </div>
                              {/* Название кромки и наценка */}
                              <div style={{ padding: '4px', background: 'white', textAlign: 'center' }}>
                                <div 
                                  className="font-medium text-gray-900"
                                  style={{ fontSize: '12px', lineHeight: '1.3' }}
                                >
                                  {edge.name}
                                </div>
                                {(edge.surcharge != null && edge.surcharge > 0) && (
                                  <div className="text-green-600 font-medium" style={{ fontSize: '11px' }}>
                                    +{(edge.surcharge as number).toLocaleString('ru-RU')} Р
                                  </div>
                                )}
                              </div>
                              {/* Галочка при выборе */}
                              {(selectedEdgeId === edge.id || (edge.id === 'none' && !selectedEdgeId)) && (
                                <div className="absolute top-0.5 right-0.5 z-10 animate-in zoom-in duration-300">
                                  <div className="w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center shadow-sm">
                                    <svg className="w-2 h-2 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </div>
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                        )}
                      </div>

                      {/* Цвет стекла (данные из Стекло_доступность; на цену не влияет) */}
                      {(selectedModelData?.glassColors?.length ?? 0) > 0 && (
                        <div>
                          <h3 className="mb-4 font-semibold" style={{ fontFamily: 'Roboto, sans-serif', fontSize: '16px', fontWeight: 600, color: '#3D3A3A' }}>
                            ЦВЕТ СТЕКЛА
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {(selectedModelData.glassColors || []).map((colorName) => (
                              <button
                                key={colorName}
                                onClick={() => setSelectedGlassColor(selectedGlassColor === colorName ? null : colorName)}
                                className={`rounded border px-3 py-2 text-sm font-medium transition ${
                                  selectedGlassColor === colorName ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white hover:border-gray-400'
                                }`}
                              >
                                {colorName}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Вкладка "ФУРНИТУРА" */}
                  {activeTab === 'фурнитура' && (
                    <div className="space-y-5">
                      {/* Комплект фурнитуры */}
                      <div>
                        <div className="flex items-center gap-2 mb-3">
                        <h3 
                            className="font-semibold"
                          style={{
                            fontFamily: 'Roboto, sans-serif',
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#3D3A3A',
                            letterSpacing: '0.3px'
                          }}
                        >
                          КОМПЛЕКТ ФУРНИТУРЫ
                        </h3>
                          <div className="relative group">
                            <Info 
                              className="w-4 h-4 text-gray-500 cursor-help" 
                              style={{ strokeWidth: 2 }}
                            />
                            {/* Tooltip с информацией */}
                            <div className="absolute left-0 top-6 w-64 p-3 bg-white border border-gray-200 shadow-lg rounded z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                              <div className="space-y-2" style={{ fontSize: '18px', lineHeight: '1.7', color: '#666666' }}>
                                <div>Цвет: в тон кромки полотна или выбранной ручки.</div>
                                <div>
                                  *При высоте двери 2300мм и выше могут быть добавлены дополнительные петли*
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          {(configKits || []).map((kit) => {
                            const selected = selectedHardwareKit === kit.id;
                            const desc = getKitDescription(kit.name);
                            return (
                              <button
                                key={kit.id}
                                type="button"
                                onClick={() => setSelectedHardwareKit(selected ? null : kit.id)}
                                className={`relative rounded-lg border-2 p-3 text-left transition ${
                                  selected
                                    ? 'border-gray-900 ring-1 ring-gray-100 shadow-md bg-gray-50'
                                    : 'border-gray-300 hover:border-gray-400 cursor-pointer bg-white'
                                }`}
                              >
                                {selected && (
                                  <div className="absolute top-1 right-1 w-3.5 h-3.5 bg-gray-900 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                                    <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                  </div>
                                )}
                                <div className="font-medium text-gray-900">{kit.name}</div>
                                {kit.price != null && Number(kit.price) > 0 && (
                                  <div className="text-green-600 font-medium mt-0.5" style={{ fontSize: '12px' }}>
                                    +{Number(kit.price).toLocaleString('ru-RU')} Р
                                  </div>
                                )}
                                {desc && (
                                  <div className="mt-2 text-gray-600 font-normal space-y-0.5 pl-0.5" style={{ fontSize: '13px', lineHeight: 1.4 }}>
                                    {desc.specs.map((line, i) => (
                                      <div key={i}>{line}</div>
                                    ))}
                                    {desc.note ? (
                                      <div className="mt-1 italic text-gray-600 text-sm">
                                        *{desc.note}*
                                      </div>
                                    ) : null}
                                  </div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Ручка */}
                      <div style={{ 
                        padding: designTokens.spacing[5],
                        backgroundColor: designTokens.colors.gray[50],
                        borderRadius: designTokens.borderRadius.lg,
                        border: `1px solid ${designTokens.colors.gray[200]}`
                      }}>
                        <div className="flex gap-6 items-start">
                          {/* Ручка */}
                          <div className="flex-1">
                            <h3 
                              className="mb-4 font-semibold"
                              style={{
                                fontFamily: designTokens.typography.fontFamily.sans.join(', '),
                                fontSize: designTokens.typography.fontSize.base,
                                fontWeight: designTokens.typography.fontWeight.semibold,
                                color: designTokens.colors.gray[900],
                                letterSpacing: '0.01em'
                              }}
                            >
                              РУЧКА
                            </h3>
                            <div className="flex flex-col gap-3">
                                <button
                                onClick={() => setShowHandleModal(true)}
                                className="border border-gray-300 text-gray-900 rounded overflow-hidden flex items-center justify-center hover:border-gray-400 bg-white"
                                    style={{ 
                                  width: '280px',
                                  height: '180px',
                                  fontFamily: designTokens.typography.fontFamily.sans.join(', '),
                                  fontSize: designTokens.typography.fontSize.sm,
                                }}
                              >
                                {selectedHandleIdObj && selectedHandleIdObj.name ? (
                                  <img
                                    src={getHandleImageSrc(selectedHandleIdObj.photos?.[0] || selectedHandleIdObj.photo_path, selectedHandleIdObj.name)}
                                    alt={selectedHandleIdObj.name}
                                    className="w-full h-full object-contain"
                                    onError={(e) => {
                                      const target = e.target as HTMLImageElement;
                                      
                                      // Пробуем альтернативные варианты имени файла
                                      if (!target.dataset.alternativeTried && selectedHandleIdObj) {
                                        target.dataset.alternativeTried = 'true';
                                        // Пробуем разные варианты нормализации
                                        const currentSrc = target.src.replace(window.location.origin, '');
                                        const handleObj = selectedHandleIdObj as any;
                                        const alternatives = [
                                          selectedHandleIdObj.name?.trim().replace(/\s+/g, '_'),  // С подчеркиваниями (PANTS_BL)
                                          selectedHandleIdObj.name?.trim().replace(/\s+BL$/, ' _BL'),  // С пробелом перед подчеркиванием для BL (PANTS _BL)
                                          selectedHandleIdObj.name?.trim().replace(/\s+/g, ''),    // Без пробелов
                                          handleObj.factoryName?.trim().replace(/\s+/g, '_'),
                                          handleObj.factoryName?.trim().replace(/\s+BL$/, ' _BL'),
                                          handleObj.factoryName?.trim(),
                                          handleObj.article?.trim()
                                        ].filter(Boolean);
                                        
                                        for (const alt of alternatives) {
                                          if (alt) {
                                            const mockupUrl = `/data/mockups/ruchki/${alt}.png`;
                                            if (currentSrc !== mockupUrl) {
                                              console.log('🔄 Пробуем альтернативный путь:', mockupUrl);
                                              target.src = mockupUrl;
                                              return;
                                            }
                                          }
                                        }
                                      }
                                      
                                      // Если и fallback не сработал, показываем placeholder
                                      const handleObj = selectedHandleIdObj as any;
                                      console.error('❌ Не удалось загрузить изображение ручки:', {
                                        name: selectedHandleIdObj?.name,
                                        factoryName: handleObj?.factoryName,
                                        article: handleObj?.article,
                                        attemptedSrc: target.src
                                      });
                                      target.style.display = 'none';
                                      const placeholder = target.nextElementSibling as HTMLElement;
                                      if (placeholder) {
                                        placeholder.style.display = 'flex';
                                      }
                                    }}
                                    onLoad={(e) => {
                                      // Успешная загрузка - скрываем placeholder
                                      const img = e.target as HTMLImageElement;
                                      const placeholder = img.nextElementSibling as HTMLElement;
                                      if (placeholder) {
                                        placeholder.style.display = 'none';
                                      }
                                    }}
                                  />
                                ) : null}
                                {!selectedHandleIdObj && (
                                  <span className="text-gray-400 text-xs text-center px-2">Выберите</span>
                                )}
                                <div 
                                  className="hidden w-full h-full items-center justify-center text-gray-400 text-xs"
                                  style={{ display: 'none' }}
                                >
                                  <span>?</span>
                                </div>
                              </button>
                              {selectedHandleIdObj && (
                                <div className="flex flex-col items-start gap-0.5 relative">
                                  <div className="flex items-center gap-1">
                                    <span className="text-sm font-medium text-gray-900">
                                      {selectedHandleIdObj.name}
                                    </span>
                                    {selectedHandleIdObj.description && (
                                      <span
                                        role="button"
                                        tabIndex={0}
                                        className="text-gray-500 hover:text-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-400 rounded p-0.5 flex-shrink-0"
                                        title="Описание"
                                        onClick={(e) => { e.stopPropagation(); setShowHandleDescription((v) => !v); }}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowHandleDescription((v) => !v); } }}
                                      >
                                        <Info className="w-4 h-4" />
                                      </span>
                                    )}
                                  </div>
                                  {showHandleDescription && selectedHandleIdObj.description && (
                                    <div
                                      className="mt-1 p-3 bg-white border border-gray-200 rounded-lg shadow-lg text-sm text-gray-700 max-w-[280px] max-h-32 overflow-y-auto"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {selectedHandleIdObj.description}
                                    </div>
                                  )}
                                  {((selectedHandleIdObj.price_rrc || selectedHandleIdObj.price_opt) ?? 0) > 0 && (
                                    <div className="text-green-600 font-medium" style={{ fontSize: '12px' }}>
                                      +{(selectedHandleIdObj.price_rrc || selectedHandleIdObj.price_opt || 0).toLocaleString('ru-RU')} Р
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Завертка — фото в привязке к выбранной ручке */}
                          <div className="flex-1">
                            <h3 
                              className="mb-4 font-semibold"
                              style={{
                                fontFamily: 'Roboto, sans-serif',
                                fontSize: '16px',
                                fontWeight: 600,
                                color: '#3D3A3A'
                              }}
                            >
                              ЗАВЕРТКА
                            </h3>
                            <div className="flex flex-col gap-3">
                              {selectedHandleIdObj?.photos?.[1] ? (
                                <div
                                  className="border border-gray-300 rounded overflow-hidden flex items-center justify-center bg-white"
                                  style={{ width: '280px', height: '180px' }}
                                >
                                  <img
                                    src={getImageSrc(selectedHandleIdObj.photos[1])}
                                    alt={`Завертка ${selectedHandleIdObj.name}`}
                                    className="w-full h-full object-contain"
                                  />
                                </div>
                              ) : selectedHandleIdObj ? (
                                <div
                                  className="border border-gray-200 rounded flex items-center justify-center bg-gray-50 text-gray-400 text-sm"
                                  style={{ width: '280px', height: '180px' }}
                                >
                                  Нет фото завертки
                                </div>
                              ) : (
                                <div
                                  className="border border-gray-200 rounded flex items-center justify-center bg-gray-50 text-gray-400 text-sm"
                                  style={{ width: '280px', height: '180px' }}
                                >
                                  Выберите ручку
                                </div>
                              )}
                            </div>
                            <div className="flex gap-3 mt-4 items-center flex-wrap">
                              <button
                                onClick={() => setHasLock(false)}
                                className={`group relative overflow-hidden rounded border transition-all duration-300 px-6 py-3 ${
                                  hasLock === false
                                    ? 'border-gray-900 ring-1 ring-gray-100 shadow-md bg-gray-900 text-white'
                                    : 'border-gray-200 shadow-sm hover:shadow-sm hover:border-gray-400 bg-white text-gray-900'
                                }`}
                              >
                                <div className="font-medium" style={{ fontSize: '14px' }}>
                                  Нет
                                </div>
                                {hasLock === false && (
                                  <div className="absolute top-1 right-1 animate-in zoom-in duration-300">
                                    <div className="w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center shadow-sm">
                                      <svg className="w-2 h-2 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    </div>
                                  </div>
                                )}
                              </button>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => setHasLock(true)}
                                  className={`group relative overflow-hidden rounded border transition-all duration-300 px-6 py-3 ${
                                    hasLock === true
                                      ? 'border-gray-900 ring-1 ring-gray-100 shadow-md bg-gray-900 text-white'
                                      : 'border-gray-200 shadow-sm hover:shadow-sm hover:border-gray-400 bg-white text-gray-900'
                                  }`}
                                >
                                  <div className="font-medium" style={{ fontSize: '14px' }}>
                                    Да
                                  </div>
                                  {hasLock === true && (
                                    <div className="absolute top-1 right-1 animate-in zoom-in duration-300">
                                      <div className="w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center shadow-sm">
                                        <svg className="w-2 h-2 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                      </div>
                                    </div>
                                  )}
                                </button>
                                {(selectedHandleIdObj?.backplate_price_rrc ?? 0) > 0 && (
                                  <span className="text-green-600 font-medium" style={{ fontSize: '12px' }}>
                                    +{selectedHandleIdObj!.backplate_price_rrc!.toLocaleString('ru-RU')} Р
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                    </div>
                  )}

                  {/* Вкладка "НАЛИЧНИКИ" */}
                  {activeTab === 'наличники' && (
                    <div>
                      <h3 
                        className="mb-4 font-semibold"
                        style={{
                          fontFamily: 'Roboto, sans-serif',
                          fontSize: '16px',
                          fontWeight: 600,
                          color: '#3D3A3A'
                        }}
                      >
                        НАЛИЧНИК
                      </h3>
                      <div className="grid grid-cols-3 gap-3">
                        {architraveOptions.map((architrave) => (
                          <button
                            key={architrave.id}
                            onClick={() => setSelectedArchitraveId(architrave.id)}
                            className={`group relative overflow-hidden rounded-lg border-2 transition-all duration-300 ${
                              selectedArchitraveId === architrave.id
                                ? 'border-gray-900 ring-2 ring-gray-100 shadow-lg scale-105'
                                : 'border-gray-200 shadow-sm hover:shadow-md hover:border-gray-400 hover:scale-102'
                            }`}
                          >
                            {/* Миниатюра наличника — бокс по контуру фото */}
                            <div className="bg-gray-100 relative overflow-hidden min-h-[48px]">
                              <img
                                loading="lazy"
                                src={getImageSrcWithPlaceholder((architrave as { photo_path?: string | null }).photo_path, createPlaceholderSvgDataUrl(300, 300, '#E2E8F0', '#1A202C', (architrave as { name: string }).name))}
                                alt={architrave.name}
                                className="w-full h-auto block bg-white"
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />
                              {!getImageSrc((architrave as { photo_path?: string | null }).photo_path) && (
                                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 pointer-events-none">
                                  <span className="text-gray-400 text-2xl">🚪</span>
                                </div>
                              )}
                            </div>
                            {/* Название наличника */}
                            <div style={{ padding: '8px', background: 'white', textAlign: 'center' }}>
                              <div 
                                className="font-medium text-gray-900"
                                style={{ fontSize: '12px' }}
                              >
                                {architrave.name}
                              </div>
                              {(architrave as { price_surcharge?: number }).price_surcharge != null && (architrave as { price_surcharge?: number }).price_surcharge > 0 && (
                                <div className="text-green-600 font-medium mt-0.5" style={{ fontSize: '11px' }}>
                                  +{Number((architrave as { price_surcharge?: number }).price_surcharge).toLocaleString('ru-RU')} Р
                                </div>
                              )}
                            </div>
                            {/* Галочка при выборе */}
                            {selectedArchitraveId === architrave.id && (
                              <div className="absolute top-2 right-2 z-10 animate-in zoom-in duration-300">
                                <div className="w-5 h-5 bg-gray-900 rounded-full flex items-center justify-center shadow-md">
                                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Вкладка "ДОП ОПЦИИ" */}
                  {activeTab === 'доп-опции' && (
                    <div className="space-y-5">
                      {/* Ограничители */}
                      <div>
                        <h3 
                          className="mb-4 font-semibold"
                          style={{
                            fontFamily: 'Roboto, sans-serif',
                            fontSize: '16px',
                            fontWeight: 600,
                            color: '#3D3A3A'
                          }}
                        >
                          ОГРАНИЧИТЕЛИ
                        </h3>
                        <div className="grid grid-cols-4 gap-2">
                          {/* Без ограничителя */}
                          <button
                            onClick={() => { setSelectedStopperId('none'); setSelectedStopperIdColor(null); }}
                            className={`group relative overflow-hidden rounded border transition-all duration-300 p-2 flex flex-col items-center justify-center min-h-[100px] h-full ${
                              selectedStopperId === 'none'
                                ? 'border-gray-900 ring-1 ring-gray-100 shadow-md bg-white scale-105'
                                : 'border-gray-200 shadow-sm hover:border-gray-400 bg-white'
                            }`}
                          >
                            <div className="font-medium text-gray-900 text-center" style={{ fontSize: '11px' }}>Без ограничителя</div>
                            {selectedStopperId === 'none' && (
                              <div className="absolute top-1 right-1 w-3.5 h-3.5 bg-gray-900 rounded-full flex items-center justify-center">
                                <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                              </div>
                            )}
                          </button>
                          {/* Один вид = одна карточка: изображение + кружочки цветов */}
                          {stopperGroups.map((group) => {
                            const selectedVariant = group.variants.find(v => v.id === selectedStopperId) ?? group.variants[0];
                            const isSelected = group.variants.some(v => v.id === selectedStopperId);
                            return (
                              <button
                                key={group.typeId}
                                onClick={() => setSelectedStopperId(selectedVariant.id)}
                                className={`group relative overflow-hidden rounded border transition-all duration-300 p-2 flex flex-col h-full ${
                                  isSelected ? 'border-gray-900 ring-1 ring-gray-100 shadow-md bg-white scale-105' : 'border-gray-200 shadow-sm hover:border-gray-400 hover:scale-102 bg-white'
                                }`}
                              >
                                <div className="flex flex-col items-center gap-1.5 w-full text-center">
                                  {/* Фиксированная высота блока фото — все карточки выровнены */}
                                  <div className="bg-gray-100 relative overflow-hidden rounded w-full flex-shrink-0 flex items-center justify-center aspect-square max-h-[128px] min-h-[96px]">
                                    <img
                                      loading="lazy"
                                      src={getImageSrcWithPlaceholder(selectedVariant.photo_path, createPlaceholderSvgDataUrl(200, 200, '#1A202C', '#FFFFFF', group.typeName))}
                                      alt={group.typeName}
                                      className="max-w-full max-h-full w-auto h-auto object-contain block"
                                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                    />
                                    <span
                                      role="button"
                                      tabIndex={0}
                                      onClick={(e) => { e.stopPropagation(); setLimiterGalleryIndex(0); setShowLimiterGalleryForType(group.typeId); }}
                                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setLimiterGalleryIndex(0); setShowLimiterGalleryForType(group.typeId); } }}
                                      className="absolute bottom-0 left-0 right-0 py-0.5 bg-black/60 text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                    >
                                      Галерея
                                    </span>
                                  </div>
                                  <div className="w-full">
                                    <div className="font-medium text-gray-900 mb-0.5" style={{ fontSize: '12px', lineHeight: '1.2' }}>{group.typeName}</div>
                                    {selectedVariant.price > 0 && (
                                      <div className="text-green-600 font-medium" style={{ fontSize: '11px' }}>+{selectedVariant.price.toLocaleString('ru-RU')} Р</div>
                                    )}
                                  </div>
                                  {/* Кружочки цветов: по центру, крупнее для удобства */}
                                  <div className="flex flex-wrap justify-center items-center gap-2 mt-1 min-h-[26px] w-full">
                                    {group.variants.map((v) => (
                                      <div
                                        key={v.id}
                                        onClick={(e) => { e.stopPropagation(); setSelectedStopperId(v.id); }}
                                        className={`rounded-full flex-shrink-0 transition-all duration-200 ring-1 ring-gray-300 hover:ring-gray-400 cursor-pointer ${
                                          selectedStopperId === v.id ? 'ring-2 ring-gray-900 scale-110' : ''
                                        }`}
                                        style={{ width: '20px', height: '20px', backgroundColor: v.colorHex, border: v.colorHex === '#ffffff' || v.colorHex === '#fff' ? '1px solid #E5E5E5' : 'none' }}
                                        title={v.colorName}
                                        role="button"
                                        tabIndex={0}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setSelectedStopperId(v.id); } }}
                                      />
                                    ))}
                                  </div>
                                  {isSelected && (
                                    <div className="absolute top-1 right-1 w-3.5 h-3.5 bg-gray-900 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                                      <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    </div>
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                      </div>

                      {/* Зеркало */}
                      <div>
                        <h3 
                          className="mb-4 font-semibold"
                          style={{
                            fontFamily: 'Roboto, sans-serif',
                            fontSize: '16px',
                            fontWeight: 600,
                            color: '#3D3A3A'
                          }}
                        >
                          ЗЕРКАЛО
                        </h3>
                        <div className="grid grid-cols-3 gap-2">
                          {mirrorOptions.map((mirror) => (
                            <button
                              key={mirror.id}
                              onClick={() => setSelectedMirrorId(mirror.id as 'none' | 'one' | 'both')}
                              className={`group relative overflow-hidden rounded border transition-all duration-300 p-2 ${
                                selectedMirrorId === mirror.id
                                  ? 'border-gray-900 ring-1 ring-gray-100 shadow-md bg-white scale-105'
                                  : 'border-gray-200 shadow-sm hover:shadow-sm hover:border-gray-400 hover:scale-102 bg-white'
                              }`}
                            >
                              <div className="text-center">
                                <div 
                                  className="font-medium text-gray-900 mb-1"
                                  style={{ fontSize: '12px', lineHeight: '1.3' }}
                                >
                                  {mirror.name}
                                </div>
                                {mirror.price != null && mirror.price > 0 && (
                                  <div className="text-green-600 font-medium mt-0.5" style={{ fontSize: '11px' }}>
                                    +{Number(mirror.price).toLocaleString('ru-RU')} Р
                                  </div>
                                )}
                                {selectedMirrorId === mirror.id && (
                                  <div className="absolute top-1 right-1 animate-in zoom-in duration-300">
                                    <div className="w-3.5 h-3.5 bg-gray-900 rounded-full flex items-center justify-center shadow-sm">
                                      <svg className="w-2 h-2 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Порог */}
                      <div>
                        <h3 
                          className="mb-4 font-semibold"
                          style={{
                            fontFamily: 'Roboto, sans-serif',
                            fontSize: '16px',
                            fontWeight: 600,
                            color: '#3D3A3A'
                          }}
                        >
                          ПОРОГ
                        </h3>
                        <div className="flex gap-3">
                          <button
                            onClick={() => setSelectedThresholdId(null)}
                            className={`group relative overflow-hidden rounded border transition-all duration-300 px-6 py-3 ${
                              !selectedThresholdId
                                ? 'border-gray-900 ring-1 ring-gray-100 shadow-md bg-gray-900 text-white'
                                : 'border-gray-200 shadow-sm hover:shadow-sm hover:border-gray-400 bg-white text-gray-900'
                            }`}
                          >
                            <div className="font-medium" style={{ fontSize: '14px' }}>
                              Нет
                            </div>
                            {!selectedThresholdId && (
                              <div className="absolute top-1 right-1 animate-in zoom-in duration-300">
                                <div className="w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center shadow-sm">
                                  <svg className="w-2 h-2 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              </div>
                            )}
                          </button>
                          <button
                            onClick={() => {
                              // Находим первую опцию порога
                              const thresholdOpt = thresholdOptions.find(o => o.option_type === 'порог');
                              setSelectedThresholdId(thresholdOpt?.id || null);
                            }}
                            className={`group relative overflow-hidden rounded border transition-all duration-300 px-6 py-3 ${
                              selectedThresholdId
                                ? 'border-gray-900 ring-1 ring-gray-100 shadow-md bg-gray-900 text-white'
                                : 'border-gray-200 shadow-sm hover:shadow-sm hover:border-gray-400 bg-white text-gray-900'
                            }`}
                          >
                            <div className="font-medium" style={{ fontSize: '14px' }}>
                              Да
                            </div>
                            {(() => {
                              const thresholdOpt = thresholdOptions.find(o => o.option_type === 'порог');
                              const price = thresholdOpt?.price_surcharge ?? 0;
                              return price > 0 ? (
                                <div className={`font-medium mt-0.5 ${selectedThresholdId ? 'text-white/90' : 'text-green-600'}`} style={{ fontSize: '11px' }}>
                                  +{Number(price).toLocaleString('ru-RU')} Р
                                </div>
                              ) : null;
                            })()}
                            {selectedThresholdId && (
                              <div className="absolute top-1 right-1 animate-in zoom-in duration-300">
                                <div className="w-3.5 h-3.5 bg-white rounded-full flex items-center justify-center shadow-sm">
                                  <svg className="w-2 h-2 text-gray-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                </div>
                              </div>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Правая колонка - превью и параметры */}
            <div style={{ flex: '1', display: 'flex', gap: '24px' }}>
              {/* Большое превью — бокс по контуру фото */}
              <div style={{ flex: '0 0 338px' }}>
                <div className="sticky" style={{ top: '32px' }}>
                  <div 
                    className="overflow-hidden border-2 border-gray-200 shadow-2xl bg-white transition-all duration-300 hover:shadow-3xl relative min-h-[200px]"
                    style={{ width: '338px' }}
                  >
                    {(() => {
                      const coatingPhoto = selectedCoatingId ? coatings.find(c => c.id === selectedCoatingId)?.photo_path : null;
                      const previewSrc = getImageSrc(coatingPhoto) || getImageSrc(selectedModelData?.photo);
                      const previewPlaceholder = createPlaceholderSvgDataUrl(338, 676, '#E2E8F0', '#4A5568', selectedModel || 'Выберите модель');
                      return (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={previewSrc || previewPlaceholder}
                          alt={selectedModel || 'Модель двери'}
                          className="w-full h-auto block bg-white cursor-zoom-in"
                          onClick={() => {
                            if (previewSrc) {
                              setZoomPreviewSrc(previewSrc);
                              setZoomPreviewAlt(selectedModel || 'Модель двери');
                            }
                          }}
                          onError={(e) => {
                            if (e.currentTarget.src !== previewPlaceholder) e.currentTarget.src = previewPlaceholder;
                          }}
                        />
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Параметры и цена - справа от превью */}
              <div style={{ flex: '1', maxWidth: '400px' }}>
                <div className="sticky" style={{ top: '32px' }}>
                  {/* Заголовок "Спецификация" */}
                  <h3 
                    className="mb-4 font-semibold"
                    style={{
                      fontFamily: designTokens.typography.fontFamily.sans.join(', '),
                      fontSize: designTokens.typography.fontSize.xl,
                      fontWeight: designTokens.typography.fontWeight.semibold,
                      color: designTokens.colors.gray[800],
                      letterSpacing: '-0.01em'
                    }}
                  >
                    Спецификация
                  </h3>

                  {/* Список спецификации */}
                  <div 
                    className="space-y-1 mb-5 rounded-lg p-4"
                    style={{
                      backgroundColor: designTokens.colors.gray[50],
                      border: `1px solid ${designTokens.colors.gray[200]}`,
                      borderRadius: designTokens.borderRadius.lg,
                      boxShadow: designTokens.boxShadow.sm
                    }}
                  >
                    <div 
                      className="pb-2"
                      style={{
                        borderBottom: `1px solid ${designTokens.colors.gray[200]}`,
                        paddingBottom: designTokens.spacing[2]
                      }}
                    >
                      <span 
                        className="font-medium"
                        style={{ 
                          fontSize: designTokens.typography.fontSize.xs,
                          color: designTokens.colors.gray[600],
                          letterSpacing: '0.01em'
                        }}
                      >
                        Стиль:{' '}
                      </span>
                      <span 
                        className="font-semibold"
                        style={{ 
                          fontSize: designTokens.typography.fontSize.sm,
                          color: designTokens.colors.gray[900]
                        }}
                      >
                        {selectedStyle}
                      </span>
                    </div>
                    {[
                      { label: 'Полотно', value: selectedModel },
                      { label: 'Размеры', value: `${width} × ${height} мм` },
                      { label: 'Реверсные двери', value: reversible ? 'Да' : 'Нет' },
                      { label: 'Наполнение (каталог)', value: selectedFilling || '—' },
                      { label: 'Звукоизоляция', value: getFillingText() },
                      { label: 'Покрытие и цвет', value: getCoatingText() },
                      { label: 'Алюминиевая кромка', value: getEdgeText() },
                      { label: 'Цвет стекла', value: selectedGlassColor ?? ((selectedModelData?.glassColors?.length ?? 0) > 0 ? 'Не выбран' : '—') },
                      { label: 'Комплект фурнитуры', value: getHardwareKitText() },
                      { label: 'Ручка', value: getHandleText() },
                      { label: 'Наличник', value: (selectedArchitraveId ? architraveOptions.find(a => a.id === selectedArchitraveId)?.name : null) || 'Не выбран' },
                      { label: 'Ограничитель', value: getStopperText() },
                      { label: 'Зеркало', value: getMirrorText() },
                      { label: 'Порог', value: getThresholdText() },
                    ]
                      .filter((item) => {
                        const v = String(item.value ?? '').trim();
                        return v !== '' && v !== '—' && v !== 'Не выбрано' && v !== 'Не выбран';
                      })
                      .map((item, index, array) => (
                      <div 
                        key={item.label}
                        className={index < array.length - 1 ? 'pb-2' : ''}
                        style={{
                          borderBottom: index < array.length - 1 ? `1px solid ${designTokens.colors.gray[200]}` : 'none',
                          paddingBottom: index < array.length - 1 ? designTokens.spacing[2] : 0
                        }}
                      >
                        <span 
                          className="font-medium"
                          style={{ 
                            fontSize: designTokens.typography.fontSize.xs,
                            color: designTokens.colors.gray[600],
                            letterSpacing: '0.01em'
                          }}
                        >
                          {item.label}:{' '}
                        </span>
                        <span 
                          className="font-semibold"
                          style={{ 
                            fontSize: designTokens.typography.fontSize.sm,
                            color: designTokens.colors.gray[900]
                          }}
                        >
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Цена */}
                  <div 
                    className="mb-3 rounded-lg p-5"
                    style={{
                      background: `linear-gradient(135deg, ${designTokens.colors.gray[50]} 0%, #FFFFFF 100%)`,
                      border: `2px solid ${designTokens.colors.gray[200]}`,
                      borderRadius: designTokens.borderRadius.lg,
                      boxShadow: designTokens.boxShadow.md
                    }}
                  >
                    <h4 
                      className="mb-3 font-semibold"
                      style={{
                        fontFamily: designTokens.typography.fontFamily.sans.join(', '),
                        fontSize: designTokens.typography.fontSize.xs,
                        fontWeight: designTokens.typography.fontWeight.semibold,
                        color: designTokens.colors.gray[600],
                        letterSpacing: '0.02em',
                        textTransform: 'uppercase'
                      }}
                    >
                      Цена комплекта
                    </h4>
                    <div 
                      className="font-bold whitespace-pre-line"
                      style={{
                        fontFamily: designTokens.typography.fontFamily.sans.join(', '),
                        fontSize: priceData ? '32px' : '14px',
                        fontWeight: designTokens.typography.fontWeight.bold,
                        color: designTokens.colors.gray[900],
                        letterSpacing: '-0.03em',
                        lineHeight: designTokens.typography.lineHeight.tight
                      }}
                    >
                      {price}
                    </div>
                    {priceData && (
                      <div 
                        className="text-xs text-gray-500 mt-1"
                        style={{ fontFamily: designTokens.typography.fontFamily.sans.join(', ') }}
                      >
                        Дверь + ручка + завертка + ограничитель и опции
                      </div>
                    )}
                  </div>

                  {/* Кнопка "Что входит в комплект" */}
                  <div className="mb-4">
                    <a 
                      href="#"
                      className="block text-blue-600 hover:text-blue-700 underline text-center"
                      style={{ 
                        fontFamily: 'Roboto, sans-serif',
                        fontSize: '12px'
                      }}
                    >
                      Что входит в комплект?
                    </a>
                  </div>

                  {/* Кнопка "В корзину" */}
                  <div className="mb-4">
                    <button 
                      onClick={addToCart}
                      disabled={!canCalculatePrice || !priceData}
                      className="w-full font-semibold transition-all duration-200 flex items-center justify-center gap-2"
                      style={{ 
                        fontFamily: designTokens.typography.fontFamily.sans.join(', '),
                        fontSize: designTokens.typography.fontSize.sm,
                        fontWeight: designTokens.typography.fontWeight.semibold,
                        letterSpacing: '0.01em',
                        padding: `${designTokens.spacing[3]} ${designTokens.spacing[4]}`,
                        backgroundColor: (!canCalculatePrice || !priceData) ? designTokens.colors.gray[400] : designTokens.colors.black[950],
                        color: '#FFFFFF',
                        borderRadius: designTokens.borderRadius.lg,
                        boxShadow: designTokens.boxShadow.md,
                        border: 'none',
                        cursor: (!canCalculatePrice || !priceData) ? 'not-allowed' : 'pointer'
                      }}
onMouseEnter={(e) => {
                          if (canCalculatePrice && priceData) {
                          e.currentTarget.style.backgroundColor = designTokens.colors.gray[800];
                          e.currentTarget.style.boxShadow = designTokens.boxShadow.lg;
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (canCalculatePrice && priceData) {
                          e.currentTarget.style.backgroundColor = designTokens.colors.black[950];
                          e.currentTarget.style.boxShadow = designTokens.boxShadow.md;
                          e.currentTarget.style.transform = 'translateY(0)';
                        }
                      }}
                    >
                      В корзину {cart.length > 0 && `(${cart.length})`}
                    </button>
                    {cart.length > 0 && (
                      <button
                        onClick={() => setShowCartManager(true)}
                        className="w-full mt-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                      >
                        Открыть корзину
                      </button>
                    )}
                  </div>

                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Модальное окно выбора ручки */}
      {showHandleModal && (
        <HandleSelectionModal
          handles={(() => {
            // Преобразуем DoorHandle[] в Record<string, Handle[]>
            // Группируем по сериям или используем "default"
            const grouped: Record<string, any[]> = {};
            allHandles.forEach(handle => {
              const group = handle.series || 'default';
              if (!grouped[group]) {
                grouped[group] = [];
              }
              grouped[group].push({
                id: handle.id,
                name: handle.name,
                group: group,
                price: handle.price_rrc || handle.price_opt || 0,
                isBasic: false,
                showroom: true,
                supplier: (handle as any).supplier,
                article: (handle as any).article,
                factoryName: (handle as any).factoryName,
                photos: (handle.photos?.length ? handle.photos : (handle.photo_path ? [handle.photo_path] : [])),
                color: handle.color ?? undefined,
                description: handle.description ?? undefined,
              });
            });
            return grouped;
          })()}
          selectedHandleId={selectedHandleId || undefined}
          onSelect={(handleId) => {
            console.log('Выбрана ручка:', handleId);
            setSelectedHandleId(handleId || null);
            setShowHandleModal(false);
          }}
          onClose={() => {
            console.log('Закрытие модального окна');
            setShowHandleModal(false);
          }}
        />
      )}

      {/* Галерея ограничителей по виду: пролистать фото цветов и выбрать */}
      {showLimiterGalleryForType && (() => {
        const group = stopperGroups.find(g => g.typeId === showLimiterGalleryForType);
        if (!group) return null;
        const idx = Math.min(limiterGalleryIndex, group.variants.length - 1);
        const current = group.variants[idx] ?? group.variants[0];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowLimiterGalleryForType(null)}>
            <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="p-3 border-b flex items-center justify-between">
                <h4 className="font-semibold text-gray-900">{group.typeName}</h4>
                <button type="button" onClick={() => setShowLimiterGalleryForType(null)} className="text-gray-500 hover:text-gray-700 p-1">✕</button>
              </div>
              <div className="flex-1 overflow-auto p-4">
                <div className="relative flex items-center justify-center min-h-[200px] bg-gray-100 rounded-lg">
                  {current?.photo_path && (
                    <img src={getImageSrc(current.photo_path)} alt={current.colorName} className="max-h-[280px] w-auto object-contain" />
                  )}
                  {group.variants.length > 1 && (
                    <>
                      <button type="button" onClick={() => setLimiterGalleryIndex(i => (i - 1 + group.variants.length) % group.variants.length)} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 shadow flex items-center justify-center text-gray-800">‹</button>
                      <button type="button" onClick={() => setLimiterGalleryIndex(i => (i + 1) % group.variants.length)} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 shadow flex items-center justify-center text-gray-800">›</button>
                    </>
                  )}
                </div>
                <p className="text-sm text-gray-600 mt-2 text-center">{current?.colorName} {current?.price ? ` · ${current.price} Р` : ''}</p>
                <div className="flex gap-2 justify-center mt-3 flex-wrap">
                  {group.variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => { setSelectedStopperId(v.id); setShowLimiterGalleryForType(null); }}
                      className={`px-3 py-1.5 rounded border text-sm ${selectedStopperId === v.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 hover:border-gray-500'}`}
                    >
                      {v.colorName}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Менеджер корзины */}
      {showCartManager && (
        <CartManager
          cart={cart}
          setCart={setCart}
          originalPrices={originalPrices}
          setOriginalPrices={setOriginalPrices}
          cartHistory={cartHistory}
          setCartHistory={setCartHistory}
          hardwareKits={hardwareKits}
          handles={(() => {
            const grouped: Record<string, any[]> = {};
            allHandles.forEach(handle => {
              const group = handle.series || 'default';
              if (!grouped[group]) {
                grouped[group] = [];
              }
              grouped[group].push({
                id: handle.id,
                name: handle.name,
                group: group,
                price: handle.price_rrc || handle.price_opt || 0,
                isBasic: false,
                showroom: true,
                photos: (handle.photos?.length ? handle.photos : (handle.photo_path ? [handle.photo_path] : [])),
                color: handle.color ?? undefined,
                description: handle.description ?? undefined,
              });
            });
            return grouped;
          })()}
          cartManagerBasePrices={cartManagerBasePrices}
          setCartManagerBasePrices={setCartManagerBasePrices}
          showClientManager={showClientManager}
          setShowClientManager={setShowClientManager}
          generateDocument={generateDocument}
          selectedClient={selectedClient}
          selectedClientName={selectedClientName}
          setSelectedClient={setSelectedClient}
          setSelectedClientName={setSelectedClientName}
          userRole={userRole}
          onClose={() => setShowCartManager(false)}
        />
      )}

      {/* Модальное окно клиентов */}
      {showClientManager && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg w-full max-w-5xl max-h-[96vh] overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-black">Заказчики</h2>
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setShowCreateClientForm(true)}
                  className="px-3 py-2 text-sm border border-black text-black hover:bg-black hover:text-white rounded transition-all duration-200"
                >
                  Новый заказчик
                </button>
                <button
                  onClick={() => setShowClientManager(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Поиск по ФИО, телефону, адресу..."
                  value={clientSearchInput}
                  onChange={(e) => setClientSearchInput(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="max-h-60 overflow-y-auto border border-gray-200 rounded-lg">
                  {clientsLoading ? (
                    <div className="p-4 text-center text-gray-500">Загрузка клиентов...</div>
                  ) : clients.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">Клиенты не найдены</div>
                  ) : (
                    clients
                      .filter((c) => {
                        if (!clientSearch) return true;
                        const hay = `${c.lastName} ${c.firstName} ${c.middleName ?? ''} ${c.phone ?? ''} ${c.address ?? ''}`.toLowerCase();
                        return hay.includes(clientSearch.toLowerCase());
                      })
                      .map((client) => (
                        <div 
                          key={client.id}
                          className={`p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 ${selectedClient === client.id ? 'bg-blue-50 border-blue-200' : ''}`}
                          onClick={() => {
                            setSelectedClient(client.id);
                            setSelectedClientName(`${client.firstName} ${client.lastName}`);
                            setShowClientManager(false);
                          }}
                        >
                          <div className="grid items-center gap-3" style={{gridTemplateColumns: '5fr 3fr 7fr'}}>
                            <div className="font-medium truncate">
                              {client.lastName} {client.firstName}{client.middleName ? ` ${client.middleName}` : ''}
                            </div>
                            <div className="text-sm text-gray-600 truncate">{formatPhone(client.phone as any)}</div>
                            <div className="text-sm text-gray-600 overflow-hidden" style={{display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical'}}>
                              {client.address || '—'}
                            </div>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
              <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
                <button
                  onClick={() => setShowClientManager(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all duration-200"
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно создания клиента */}
      {showCreateClientForm && (
        <CreateClientModal
          onClose={() => setShowCreateClientForm(false)}
          onSuccess={(client) => {
            setSelectedClient(client.id);
            setSelectedClientName(`${client.firstName} ${client.lastName}`);
            setShowCreateClientForm(false);
            setShowClientManager(false);
          }}
        />
      )}

      {zoomPreviewSrc && (
        <div
          className="fixed inset-0 z-[10000] bg-black/90 p-4 flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setZoomPreviewSrc(null);
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomPreviewSrc}
            alt={zoomPreviewAlt}
            className="max-w-full max-h-full object-contain"
          />
          <button
            type="button"
            className="absolute top-4 right-4 text-white bg-white/20 hover:bg-white/30 rounded-full w-10 h-10 text-xl"
            onClick={() => setZoomPreviewSrc(null)}
            aria-label="Закрыть увеличенное фото"
          >
            ×
          </button>
        </div>
      )}

      </div>
    </>
  );
}

