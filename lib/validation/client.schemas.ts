// lib/validation/client.schemas.ts
// Схемы валидации для клиентов с использованием Zod

import { z } from 'zod';

// Схема для создания клиента
export const createClientSchema = z.object({
  firstName: z.string().min(1, 'Имя обязательно').max(100, 'Имя слишком длинное'),
  lastName: z.string().min(1, 'Фамилия обязательна').max(100, 'Фамилия слишком длинная'),
  middleName: z.string().max(100, 'Отчество слишком длинное').nullable().optional(),
  phone: z.string().min(1, 'Телефон обязателен').max(20, 'Телефон слишком длинный'),
  address: z.string().min(1, 'Адрес обязателен').max(500, 'Адрес слишком длинный'),
  objectId: z.string().max(100, 'ID объекта слишком длинный').nullable().optional(),
  compilationLeadNumber: z.string().nullable().optional(),
  customFields: z.string().optional().default('{}'),
  isActive: z.boolean().optional().default(true)
});

// Схема для обновления клиента
export const updateClientSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  middleName: z.string().max(100).nullable().optional(),
  phone: z.string().min(1).max(20).optional(),
  address: z.string().min(1).max(500).optional(),
  objectId: z.string().max(100).nullable().optional(),
  compilationLeadNumber: z.string().nullable().optional(),
  customFields: z.string().optional(),
  isActive: z.boolean().optional()
});

// Схема для поиска клиентов
export const findClientsSchema = z.object({
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().max(500).optional().default(20),
  search: z.string().optional(),
  isActive: z.boolean().optional()
});

// Типы на основе схем
export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type FindClientsInput = z.infer<typeof findClientsSchema>;

