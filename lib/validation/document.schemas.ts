// lib/validation/document.schemas.ts
// Схемы валидации для документов с использованием Zod

import { z } from 'zod';

// Схема для элемента документа
export const documentItemSchema = z.object({
  id: z.string().optional(),
  productId: z.string().optional(),
  product_id: z.string().optional(),
  type: z.string().min(1),
  name: z.string().optional(),
  model: z.string().optional(),
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
  sku_1c: z.string().nullable().optional(),
  handleId: z.string().optional(),
  handleName: z.string().optional(),
  hardwareKitId: z.string().optional(),
  hardwareKitName: z.string().optional(),
  hardware: z.string().optional()
});

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
  style: z.string().optional(),
  color: z.string().optional(),
  width: z.number().nonnegative().optional(),
  height: z.number().nonnegative().optional(),
  qty: z.number().int().min(0),
  unitPrice: z.number().nonnegative(),
  sku_1c: z.union([z.string(), z.number()]).nullable().optional(),
  handleId: z.string().optional(),
  limiterId: z.string().optional(),
  coatingId: z.string().optional(),
  edgeId: z.string().optional(),
  optionIds: z.array(z.string()).optional(),
  hardwareKitId: z.string().optional(),
  reversible: z.boolean().optional(),
  mirror: z.string().optional(),
  threshold: z.boolean().optional()
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

