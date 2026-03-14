'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';
import NotificationBell from '../ui/NotificationBell';

interface GlobalHeaderProps {
  showBackButton?: boolean;
  customTitle?: string;
  customSubtitle?: string;
}

export default function GlobalHeader({ 
  showBackButton = true, 
  customTitle = "Domeo",
  customSubtitle = "Личный кабинет"
}: GlobalHeaderProps) {
  const router = useRouter();
  const { user } = useAuth();

  const getRoleText = (role: string) => {
    const roleNames: Record<string, string> = {
      'admin': 'Администратор',
      'complectator': 'Комплектатор',
      'executor': 'Исполнитель'
    };
    return roleNames[role] || role || 'Пользователь';
  };

  if (!user) {
    return null;
  }

  return (
    <header className="bg-white border-b border-black/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-3">
            <div 
              onClick={() => router.push('/doors')}
              className="cursor-pointer hover:opacity-70 transition-opacity duration-200"
            >
              <h1 className="text-2xl font-bold text-black">{customTitle}</h1>
              <p className="text-xs text-gray-500 font-medium">{customSubtitle}</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <NotificationBell userRole={user.role} />
            <div className="text-sm text-gray-700">
              {user.lastName} {user.firstName.charAt(0)}.{(user.middleName && user.middleName.trim()) ? user.middleName.charAt(0) + '.' : ''} ({getRoleText(user.role)})
            </div>
            {showBackButton && (
              <button
                onClick={() => router.back()}
                className="px-3 py-1 border border-black text-black hover:bg-black hover:text-white transition-all duration-200 text-sm"
              >
                Назад
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
