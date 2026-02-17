'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { toast } from 'sonner';
import { clientLogger } from '@/lib/logging/client-logger';
import { fetchWithAuth } from '@/lib/utils/fetch-with-auth';
import { parseApiResponse } from '@/lib/utils/parse-api-response';
import type { CreateClientInput } from '@/lib/validation/client.schemas';

interface CreateClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClientCreated?: (client: { id: string; firstName: string; lastName: string; middleName?: string; phone: string; address: string; compilationLeadNumber?: string }) => void;
}

export function CreateClientModal({ isOpen, onClose, onClientCreated }: CreateClientModalProps) {
  const [newClientData, setNewClientData] = useState<{
    firstName: string;
    lastName: string;
    middleName: string;
    phone: string;
    address: string;
    compilationLeadNumber: string;
  }>({
    firstName: '',
    lastName: '',
    middleName: '',
    phone: '',
    address: '',
    compilationLeadNumber: ''
  });
  const [isCreating, setIsCreating] = useState(false);

  const createClient = async (clientData: CreateClientInput) => {
    try {
      const response = await fetchWithAuth('/api/clients', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(clientData)
      });

      if (response.ok) {
        let data: unknown;
        try {
          data = await response.json();
        } catch (jsonError) {
          throw new Error('Failed to parse create client response');
        }
        
        // Парсим ответ в формате apiSuccess
        const parsedData = parseApiResponse<{ id: string; firstName: string; lastName: string; middleName?: string; phone: string; address: string; compilationLeadNumber?: string; createdAt: string }>(data);
        
        // Извлекаем данные клиента
        const client = parsedData && typeof parsedData === 'object' && 'id' in parsedData
          ? parsedData
          : (parsedData as any)?.client || (parsedData as any)?.data?.client || parsedData;

        if (!client || !client.id) {
          throw new Error('Invalid client data in response');
        }

        return client;
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Ошибка создания клиента' }));
        throw new Error(errorData.error || 'Ошибка создания клиента');
      }
    } catch (error) {
      clientLogger.error('Error creating client:', error);
      throw error;
    }
  };

  const handleCreate = async () => {
    if (!newClientData.firstName || !newClientData.lastName || !newClientData.phone) {
      toast.error('Заполните ФИО и телефон');
      return;
    }

    setIsCreating(true);
    try {
      const clientData: CreateClientInput = {
        firstName: newClientData.firstName,
        lastName: newClientData.lastName,
        middleName: newClientData.middleName || null,
        phone: newClientData.phone,
        address: newClientData.address || '',
        compilationLeadNumber: newClientData.compilationLeadNumber || null,
        customFields: '{}',
        isActive: true
      };

      const client = await createClient(clientData);
      toast.success(`Клиент ${client.firstName} ${client.lastName} создан успешно`);
      
      // Вызываем callback с данными созданного клиента
      if (onClientCreated) {
        onClientCreated(client);
      }

      // Очищаем форму
      setNewClientData({
        firstName: '',
        lastName: '',
        middleName: '',
        phone: '',
        address: '',
        compilationLeadNumber: ''
      });

      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка при создании клиента');
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    // Очищаем форму при закрытии
    setNewClientData({
      firstName: '',
      lastName: '',
      middleName: '',
      phone: '',
      address: '',
      compilationLeadNumber: ''
    });
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Новый заказчик"
      className="!max-w-[1000px]"
      closeOnBackdropClick={false}
    >
      <div className="space-y-4">
        {/* Одна строка с полями разной ширины */}
        <div className="grid grid-cols-12 gap-3">
          <input
            type="text"
            placeholder="Фамилия"
            value={newClientData.lastName}
            onChange={(e) => setNewClientData(prev => ({ ...prev, lastName: e.target.value }))}
            className="col-span-3 px-3 py-2 border border-gray-300 rounded"
          />
          <input
            type="text"
            placeholder="Имя"
            value={newClientData.firstName}
            onChange={(e) => setNewClientData(prev => ({ ...prev, firstName: e.target.value }))}
            className="col-span-2 px-3 py-2 border border-gray-300 rounded"
          />
          <input
            type="text"
            placeholder="Отчество"
            value={newClientData.middleName}
            onChange={(e) => setNewClientData(prev => ({ ...prev, middleName: e.target.value }))}
            className="col-span-2 px-3 py-2 border border-gray-300 rounded"
          />
          <div className="col-span-2">
            <PhoneInput
              label=""
              value={newClientData.phone}
              onChange={(value) => setNewClientData(prev => ({ ...prev, phone: value }))}
              placeholder="+7 (999) 123-45-67"
            />
          </div>
          <input
            type="text"
            placeholder="Номер лида комплектации"
            value={newClientData.compilationLeadNumber}
            onChange={(e) => setNewClientData(prev => ({ ...prev, compilationLeadNumber: e.target.value }))}
            className="col-span-3 px-3 py-2 border border-gray-300 rounded"
          />
          <input
            type="text"
            placeholder="Адрес"
            value={newClientData.address}
            onChange={(e) => setNewClientData(prev => ({ ...prev, address: e.target.value }))}
            className="col-span-12 px-3 py-2 border border-gray-300 rounded"
          />
        </div>

        <div className="flex justify-end gap-3 mt-4">
          <button
            onClick={handleClose}
            className="px-3 py-2 border border-gray-300 rounded hover:bg-gray-100"
            disabled={isCreating}
          >
            Отмена
          </button>
          <button
            onClick={handleCreate}
            className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={isCreating || !newClientData.firstName || !newClientData.lastName || !newClientData.phone}
          >
            {isCreating ? 'Создание...' : 'Создать клиента'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

