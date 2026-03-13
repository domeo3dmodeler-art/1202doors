// lib/repositories/client.repository.ts
// Репозиторий для работы с клиентами

import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { simpleCache } from './cache';

export interface ClientRecord {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  phone: string;
  address: string;
  objectId: string;
  compilationLeadNumber?: string | null;
  customFields: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateClientInput {
  firstName: string;
  lastName: string;
  middleName?: string | null;
  phone: string;
  address: string;
  objectId?: string | null;
  compilationLeadNumber?: string | null;
  customFields?: string;
  isActive?: boolean;
}

export interface UpdateClientInput {
  firstName?: string;
  lastName?: string;
  middleName?: string | null;
  phone?: string;
  address?: string;
  objectId?: string | null;
  compilationLeadNumber?: string | null;
  customFields?: string;
  isActive?: boolean;
}

export class ClientRepository {
  /**
   * Находит клиента по ID
   */
  async findById(id: string): Promise<ClientRecord | null> {
    const cacheKey = `client:${id}`;
    const cached = simpleCache.get<ClientRecord>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const client = await prisma.client.findUnique({
        where: { id }
      });
      
      if (client) {
        simpleCache.set(cacheKey, client, 300); // Кеш на 5 минут
      }

      return client as ClientRecord | null;
    } catch (error) {
      logger.error('Error finding client by ID', 'CLIENT_REPOSITORY', { error, clientId: id });
      throw error;
    }
  }

  /**
   * Находит клиента по телефону
   */
  async findByPhone(phone: string): Promise<ClientRecord | null> {
    try {
      const client = await prisma.client.findFirst({
        where: { phone }
      });
      
      return client as ClientRecord | null;
    } catch (error) {
      logger.error('Error finding client by phone', 'CLIENT_REPOSITORY', { error, phone });
      throw error;
    }
  }

  /**
   * Создает нового клиента
   */
  async create(data: CreateClientInput): Promise<ClientRecord> {
    try {
      const client = await prisma.client.create({
        data: {
          firstName: data.firstName,
          lastName: data.lastName,
          middleName: data.middleName,
          phone: data.phone,
          address: data.address,
          objectId: data.objectId || `object-${Date.now()}`, // Используем переданный или генерируем автоматически
          compilationLeadNumber: data.compilationLeadNumber,
          customFields: data.customFields || '{}',
          isActive: data.isActive ?? true
        }
      });

      logger.info('Client created', 'CLIENT_REPOSITORY', {
        clientId: client.id,
        phone: client.phone
      });

      // Инвалидируем кеш
      simpleCache.deleteByPrefix('client:');

      return client as ClientRecord;
    } catch (error) {
      logger.error('Error creating client', 'CLIENT_REPOSITORY', { error, data });
      throw error;
    }
  }

  /**
   * Обновляет клиента
   */
  async update(id: string, data: UpdateClientInput): Promise<ClientRecord> {
    try {
      const client = await prisma.client.update({
        where: { id },
        data: {
          ...(data.firstName !== undefined && { firstName: data.firstName }),
          ...(data.lastName !== undefined && { lastName: data.lastName }),
          ...(data.middleName !== undefined && { middleName: data.middleName }),
          ...(data.phone !== undefined && { phone: data.phone }),
          ...(data.address !== undefined && { address: data.address }),
          ...(data.objectId !== undefined && { objectId: data.objectId }),
          ...(data.compilationLeadNumber !== undefined && { compilationLeadNumber: data.compilationLeadNumber }),
          ...(data.customFields !== undefined && { customFields: data.customFields }),
          ...(data.isActive !== undefined && { isActive: data.isActive })
        }
      });

      logger.info('Client updated', 'CLIENT_REPOSITORY', {
        clientId: client.id
      });

      // Инвалидируем кеш
      simpleCache.delete(`client:${id}`);
      simpleCache.deleteByPrefix('client:list:');

      return client as ClientRecord;
    } catch (error) {
      logger.error('Error updating client', 'CLIENT_REPOSITORY', { error, clientId: id });
      throw error;
    }
  }

  /**
   * Находит клиентов с пагинацией
   */
  async findMany(params: {
    page?: number;
    limit?: number;
    search?: string;
    isActive?: boolean;
    /** Для комплектатора: только клиенты, у которых есть заказы с этим complectator_id */
    clientIds?: string[];
  } = {}): Promise<{
    clients: ClientRecord[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { page = 1, limit = 20, search, isActive, clientIds } = params;
    const skip = (page - 1) * limit;

    try {
      const where: any = {};
      
      if (clientIds !== undefined && clientIds.length > 0) {
        where.id = { in: clientIds };
      }
      if (isActive !== undefined) {
        where.isActive = isActive;
      }

      if (search) {
        // SQLite не поддерживает mode: 'insensitive', используем обычный contains
        // Для case-insensitive поиска в SQLite можно использовать toLowerCase в приложении
        const searchLower = search.toLowerCase();
        where.OR = [
          { firstName: { contains: search } },
          { lastName: { contains: search } },
          { phone: { contains: search } }
        ];
      }

      const [clients, total] = await Promise.all([
        prisma.client.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' }
        }),
        prisma.client.count({ where })
      ]);

      return {
        clients: clients as ClientRecord[],
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      logger.error('Error finding clients', 'CLIENT_REPOSITORY', { error, params });
      throw error;
    }
  }

  /**
   * Получает документы клиента
   */
  async getClientDocuments(clientId: string): Promise<{
    orders: any[];
    invoices: any[];
    quotes: any[];
  }> {
    try {
      const [orders, invoices, quotes] = await Promise.all([
        prisma.order.findMany({
          where: { client_id: clientId },
          orderBy: { created_at: 'desc' }
        }),
        prisma.invoice.findMany({
          where: { client_id: clientId },
          orderBy: { created_at: 'desc' }
        }),
        prisma.quote.findMany({
          where: { client_id: clientId },
          orderBy: { created_at: 'desc' }
        })
      ]);

      return { orders, invoices, quotes };
    } catch (error) {
      logger.error('Error getting client documents', 'CLIENT_REPOSITORY', { error, clientId });
      throw error;
    }
  }
}

// Экспортируем singleton instance
export const clientRepository = new ClientRepository();

