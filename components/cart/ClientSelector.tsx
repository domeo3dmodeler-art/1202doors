'use client';

import React, { useState, useEffect } from 'react';
import { Button, Input, Alert, LoadingSpinner } from '@/components/ui';
import { CreateClientModal } from '@/components/clients/CreateClientModal';
import { parseApiResponse } from '@/lib/utils/parse-api-response';

interface Client {
  id: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  phone: string;
  address: string;
}

interface ClientSelectorProps {
  onClientSelect: (client: Client) => void;
  onClose: () => void;
}

export default function ClientSelector({ onClientSelect, onClose }: ClientSelectorProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [showCreateClientForm, setShowCreateClientForm] = useState(false);

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: '50',
        ...(search && { search })
      });

      const response = await fetch(`/api/clients?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      const parsedData = parseApiResponse<{ clients: Client[]; pagination?: any }>(data);

      if (parsedData && Array.isArray(parsedData.clients)) {
        setClients(parsedData.clients);
      } else {
        setClients([]);
        setAlert({ type: 'error', message: 'Ошибка загрузки заказчиков: неверный формат данных' });
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
      setClients([]);
      setAlert({ type: 'error', message: 'Ошибка загрузки заказчиков' });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchClients();
  };

  const handleClientSelect = (client: Client) => {
    setSelectedClient(client);
  };

  const handleConfirm = () => {
    if (selectedClient) {
      onClientSelect(selectedClient);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-5xl max-h-[96vh] overflow-hidden">
        {/* Header */}
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
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6">
      <div className="space-y-4">
        {/* Alert */}
        {alert && (
          <Alert
            variant={alert.type === 'error' ? 'error' : 'success'}
            onClose={() => setAlert(null)}
          >
            {alert.message}
          </Alert>
        )}

        {/* Search */}
        <div className="flex space-x-3">
          <Input
            type="text"
            placeholder="Поиск по ФИО, телефону, адресу..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1"
          />
          <Button variant="primary" onClick={handleSearch}>
            Поиск
          </Button>
        </div>

        {/* Clients List */}
        {loading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner size="md" color="black" text="Загрузка заказчиков..." />
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto space-y-2">
            {clients.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-4xl mb-4">👥</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Заказчики не найдены
                </h3>
                <p className="text-gray-600 mb-4">
                  {search ? 'Попробуйте изменить поисковый запрос' : 'Создайте первого заказчика'}
                </p>
                <Button variant="primary" onClick={() => setShowCreateClientForm(true)}>
                  Создать заказчика
                </Button>
              </div>
            ) : (
              clients.map((client) => (
                <div
                  key={client.id}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    selectedClient?.id === client.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                  onClick={() => handleClientSelect(client)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-gray-900">
                        {client.lastName} {client.firstName} {client.middleName}
                      </h4>
                      <p className="text-sm text-gray-600">{client.phone}</p>
                      <p className="text-sm text-gray-600">{client.address}</p>
                    </div>
                    {selectedClient?.id === client.id && (
                      <div className="text-blue-500">
                        ✓
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        </div>

        {/* Actions */}
          <div className="flex justify-end space-x-3 mt-6 pt-6 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all duration-200"
            >
              Отмена
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedClient}
              className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Выбрать клиента
            </button>
          </div>
        </div>

        {/* Модалка создания клиента */}
        <CreateClientModal
          isOpen={showCreateClientForm}
          onClose={() => setShowCreateClientForm(false)}
          onClientCreated={(client) => {
            setSelectedClient(client);
            fetchClients();
          }}
        />
      </div>
    </div>
  );
}

