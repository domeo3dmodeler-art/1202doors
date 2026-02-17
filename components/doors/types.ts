// Типы для компонентов дверей

export type BasicState = {
  // Уровень 1: Основные характеристики
  style?: string;        // Стиль двери (влияет на модели)
  model?: string;        // Модель двери (влияет на покрытия)
  
  // Уровень 2: Материалы и отделка
  finish?: string;       // Покрытие (влияет на цвета)
  color?: string;        // Цвет (влияет на размеры)
  
  // Уровень 3: Размеры
  width?: number;        // Ширина (влияет на кромку)
  height?: number;       // Высота (влияет на кромку)
  
  // Уровень 4: Дополнительные элементы
  // edge?: string;         // Кромка (временно отключена)
  // edge_note?: string;    // Примечание к кромке
  // edge_cost?: string;    // Стоимость надбавки за кромку
  
  // Уровень 5: Фурнитура
  hardware_kit?: { id: string };  // Комплект фурнитуры
  handle?: { id: string };        // Ручка
  
  // Технические параметры (не влияют на другие)
  type?: string;         // Тип конструкции (обычно всегда "Распашная")
};

export type ProductLike = {
  sku_1c?: string | number | null;
  model?: string | null;
};

/** Один подходящий по фильтру вариант двери из БД — для экспорта без повторного поиска (Название модели, Поставщик, Цена опт, РРЦ, артикул и т.д.) */
export interface DoorVariant {
  modelName: string;
  supplier: string;
  priceOpt: string | number;
  priceRrc: string | number;
  material: string;
  width: number | string;
  height: number | string;
  color: string;
  skuInternal: string;
  productId?: string;
  productSku?: string | null;
}

/** Тип строки в корзине: дверь (полная конфигурация), ручка или завертка отдельной строкой */
export type CartItemType = 'door' | 'handle' | 'backplate' | 'limiter';

export type CartItem = {
  id: string;
  /** Тип позиции: дверь, ручка или завертка (отдельные строки с редактируемым количеством) */
  itemType?: CartItemType;
  style?: string;
  model?: string;
  /** Название модели из БД (подмодель по фильтрам) — в заказ и в экспорт Excel */
  model_name?: string | null;
  /** Все подходящие по фильтру варианты (подмодели) из БД — в заказ и экспорт Excel без повторного поиска */
  matchingVariants?: DoorVariant[];
  finish?: string;
  type?: string;
  width?: number;
  height?: number;
  color?: string;
  qty: number;
  unitPrice: number;
  handleId?: string;
  handleName?: string;
  sku_1c?: string | number | null;
  hardwareKitId?: string;
  hardwareKitName?: string;
  baseAtAdd?: number;
  /** Кромка (да/нет) */
  edge?: string;
  /** Название цвета кромки для экспорта на фабрику */
  edgeColorName?: string;
  /** Цвет стекла для экспорта на фабрику */
  glassColor?: string;
  limiterId?: string;
  limiterName?: string;
  coatingId?: string;
  edgeId?: string;
  /** ID опций-товаров (только наличники); зеркало/порог не отдельные строки */
  optionIds?: string[];
  /** Названия наличников для экспорта в Excel */
  architraveNames?: string[];
  optionNames?: string[];
  /** Реверс двери — учтён в цене */
  reversible?: boolean;
  /** Зеркало: 'one' | 'both' и т.д. — учтено в цене, не отдельная строка */
  mirror?: string;
  /** Порог — учтён в цене, не отдельная строка */
  threshold?: boolean;
  /** Снимок спецификации из калькулятора (как в блоке «Спецификация») — для точного отображения в корзине */
  specRows?: Array<{ label: string; value: string }>;
  /** Разбивка цены по опциям (из калькулятора) — для экспорта в Excel колонок «опция, цена» */
  breakdown?: Array<{ label: string; amount: number }>;
  /** Наполнение (название) — для экспорта в Excel колонку «Наполнение» */
  filling?: string;
  fillingName?: string;
};

export type DomainKits = { id: string; name: string; group?: number; price_rrc?: number }[];

export type DomainHandles = {
  id: string;
  name: string;
  supplier_name?: string;
  supplier_sku?: string;
  price_opt?: number;
  price_rrc?: number;
  price_group_multiplier?: number;
}[];

export type HardwareKit = {
  id: string;
  name: string;
  description: string;
  price: number;
  priceGroup: string;
  isBasic: boolean;
};

export type Handle = {
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
};

export type Domain =
  | {
      style?: string[];
      model?: string[];
      finish?: string[];
      color?: string[];
      type?: string[];
      width?: number[];
      height?: number[];
      // edge?: string[];
      kits?: DomainKits;
      handles?: DomainHandles;
    }
  | null;

export type ModelItem = {
  model: string;
  modelKey?: string;
  style: string;
  photo?: string | null;
  photos?: { cover: string | null; gallery: string[] };
  hasGallery?: boolean;
};

