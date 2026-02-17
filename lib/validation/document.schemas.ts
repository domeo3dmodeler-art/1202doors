// lib/validation/document.schemas.ts
// Схемы валидации для документов с использованием Zod

import { z } from 'zod';

// Схема для элемента документа (type может приходить как itemType из корзины конфигуратора)
export const documentItemSchema = z.object({
  id: z.string().optional(),
  productId: z.string().optional(),
  product_id: z.string().optional(),
  type: z.string().min(1).optional(),
  itemType: z.string().optional(),
  name: z.string().optional(),
  model: z.string().optional(),
  /** Название модели из БД (подмодель) — для экспорта в Excel */
  model_name: z.string().nullable().optional(),
  qty: z.number().int().positive().optional(),
  quantity: z.number().int().positive().optional(),
  unitPrice: z.number().nonnegative().optional(),
  price: z.number().nonnegative().optional(),
  unit_price: z.number().nonnegative().optional(),
  width: z.number().nonnegative().optional(),
  height: z.number().nonnegative().optional(),
  color: z.string().optional(),
  finish: z.string().optional(),
  style: z.string().optional(),
  sku_1c: z.union([z.string(), z.number()]).nullable().optional(),
  handleId: z.string().optional(),
  handleName: z.string().optional(),
  hardwareKitId: z.string().optional(),
  hardwareKitName: z.string().optional(),
  hardware: z.string().optional(),
  limiterId: z.string().optional(),
  limiterName: z.string().optional(),
  // Опции двери для экспорта на фабрику (сохраняем в cart_data)
  edge: z.string().optional(),
  edgeId: z.string().optional(),
  edgeColorName: z.string().optional(),
  edge_color_name: z.string().optional(),
  glassColor: z.string().optional(),
  glass_color: z.string().optional(),
  reversible: z.boolean().optional(),
  mirror: z.string().optional(),
  /** Порог: из конфигуратора приходит boolean, из других источников может 1 или "да" */
  threshold: z
    .union([z.boolean(), z.literal(1), z.literal(0), z.string()])
    .optional()
    .transform((v) => v === true || v === 1 || (typeof v === 'string' && v.toLowerCase().trim() === 'да')),
  optionIds: z.array(z.string()).optional(),
  option_ids: z.array(z.string()).optional(),
  /** Названия наличников для экспорта (вместо только «да») */
  architraveNames: z.array(z.string()).optional(),
  architrave_names: z.array(z.string()).optional(),
  optionNames: z.array(z.string()).optional(),
  price_opt: z.number().nonnegative().optional(),
  specRows: z.array(z.object({ label: z.string(), value: z.string() })).optional(),
  /** Разбивка цены по опциям (из калькулятора) — для экспорта в Excel колонок «опция, цена» */
  breakdown: z.array(z.object({ label: z.string(), amount: z.number() })).optional(),
  /** Подходящие по фильтру варианты двери из БД (для экспорта без повторного поиска) */
  matchingVariants: z.array(z.object({
    modelName: z.string(),
    supplier: z.string(),
    priceOpt: z.union([z.string(), z.number()]),
    priceRrc: z.union([z.string(), z.number()]),
    material: z.string(),
    width: z.union([z.number(), z.string()]),
    height: z.union([z.number(), z.string()]),
    color: z.string(),
    skuInternal: z.string(),
    productId: z.string().optional(),
    productSku: z.string().nullable().optional()
  })).optional()
}).transform((data) => ({
  ...data,
  type: (data.type ?? data.itemType ?? undefined) as string | undefined,
  // Единый вид для экспорта: дублируем snake_case → camelCase
  optionIds: data.optionIds ?? data.option_ids,
  architraveNames: data.architraveNames ?? data.architrave_names
}));

// Схема для создания документа
export const createDocumentRequestSchema = z.object({
  type: z.enum(['quote', 'invoice', 'order', 'supplier_order']),
  parent_document_id: z.string().nullable().optional(),
  cart_session_id: z.string().nullable().optional(),
  client_id: z.string().min(1, 'ID клиента обязателен'),
  items: z.array(documentItemSchema).min(1, 'Должен быть хотя бы один товар'),
  total_amount: z.number().nonnegative('Общая сумма должна быть неотрицательной'),
  subtotal: z.number().nonnegative().optional().default(0),
  tax_amount: z.number().nonnegative().optional().default(0),
  notes: z.string().optional(),
  prevent_duplicates: z.boolean().optional().default(true),
  created_by: z.string().optional()
});

// Схема для экспорта документа
export const exportDocumentRequestSchema = z.object({
  type: z.enum(['quote', 'invoice', 'order']),
  format: z.enum(['pdf', 'excel', 'csv']),
  clientId: z.string().min(1, 'ID клиента обязателен'),
  items: z.array(documentItemSchema).min(1, 'Должен быть хотя бы один товар'),
  totalAmount: z.number().nonnegative('Общая сумма должна быть неотрицательной'),
  parentDocumentId: z.string().nullable().optional(),
  cartSessionId: z.string().nullable().optional()
});

// Элемент корзины из конфигуратора дверей (для POST /api/documents/generate)
export const generateDocumentItemSchema = z.object({
  id: z.string().optional(),
  type: z.enum(['door', 'handle', 'backplate', 'limiter']).optional(),
  model: z.string().optional(),
  model_name: z.string().nullable().optional(),
  style: z.string().optional(),
  finish: z.string().optional(),
  color: z.string().optional(),
  width: z.number().nonnegative().optional(),
  height: z.number().nonnegative().optional(),
  qty: z.number().int().min(0),
  unitPrice: z.number().nonnegative(),
  sku_1c: z.union([z.string(), z.number()]).nullable().optional(),
  handleId: z.string().optional(),
  limiterId: z.string().optional(),
  limiterName: z.string().optional(),
  coatingId: z.string().optional(),
  edgeId: z.string().optional(),
  edge: z.string().optional(),
  /** Название цвета кромки (для экспорта на фабрику) */
  edgeColorName: z.string().optional(),
  edge_color_name: z.string().optional(),
  /** Цвет стекла (для экспорта на фабрику) */
  glassColor: z.string().optional(),
  glass_color: z.string().optional(),
  optionIds: z.array(z.string()).optional(),
  architraveNames: z.array(z.string()).optional(),
  optionNames: z.array(z.string()).optional(),
  hardwareKitId: z.string().optional(),
  hardwareKitName: z.string().optional(),
  reversible: z.boolean().optional(),
  mirror: z.string().optional(),
  threshold: z.boolean().optional(),
  /** Разбивка цены по опциям (из калькулятора) — для экспорта в Excel колонок «опция, цена» */
  breakdown: z.array(z.object({ label: z.string(), amount: z.number() })).optional(),
  /** Варианты из БД (для экспорта без повторного поиска); РРЦ/опт в экспорте берутся из БД */
  matchingVariants: z.array(z.object({
    modelName: z.string(),
    supplier: z.string(),
    priceOpt: z.union([z.string(), z.number()]),
    priceRrc: z.union([z.string(), z.number()]),
    material: z.string(),
    width: z.union([z.number(), z.string()]),
    height: z.union([z.number(), z.string()]),
    color: z.string(),
    skuInternal: z.string(),
    productId: z.string().optional(),
    productSku: z.string().nullable().optional()
  })).optional(),
  price_opt: z.number().nonnegative().optional(),
  /** Наполнение (название) — для экспорта в Excel */
  filling: z.string().optional(),
  fillingName: z.string().optional()
});

// Тело запроса генерации документа из страницы дверей
export const generateDocumentFromDoorsSchema = z.object({
  type: z.enum(['quote', 'invoice', 'order'], { required_error: 'Тип документа обязателен' }),
  clientId: z.string().min(1, 'ID клиента обязателен'),
  items: z.array(generateDocumentItemSchema).min(1, 'В корзине должен быть хотя бы один товар'),
  totalAmount: z.number().nonnegative('Общая сумма должна быть неотрицательной')
});

// Типы на основе схем
export type DocumentItemInput = z.infer<typeof documentItemSchema>;
export type CreateDocumentRequestInput = z.infer<typeof createDocumentRequestSchema>;
export type ExportDocumentRequestInput = z.infer<typeof exportDocumentRequestSchema>;
export type GenerateDocumentItemInput = z.infer<typeof generateDocumentItemSchema>;
export type GenerateDocumentFromDoorsInput = z.infer<typeof generateDocumentFromDoorsSchema>;

