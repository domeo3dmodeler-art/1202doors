'use client';

import React from 'react';
import type { BasicState, CartItem, Domain, HardwareKit, Handle } from './types';
import { formatModelName, formatModelNameForCard, fmtInt, findHandleById, findHardwareKitById } from './utils';

interface ModelItem {
  model: string;
  modelKey?: string;
  style: string;
  photo?: string | null;
  photos?: { cover: string | null; gallery: string[] };
  hasGallery?: boolean;
}

interface DoorSidebarProps {
  sel: Partial<BasicState>;
  selectedModelCard: ModelItem | null;
  hardwareKits: HardwareKit[];
  handles: Record<string, Handle[]>;
  cart: CartItem[];
  selectedClientName: string;
  hideSidePanels: boolean;
}

export function DoorSidebar({
  sel,
  selectedModelCard,
  hardwareKits,
  handles,
  cart,
  selectedClientName,
  hideSidePanels,
}: DoorSidebarProps) {
  return (
    <aside className={`lg:col-span-1 transition-all duration-300 ${hideSidePanels ? 'opacity-0 pointer-events-none' : 'opacity-100'}`} style={{ width: '110%' }}>
      <div className="sticky top-6 space-y-6">
        {/* Блок параметров - показывает выбранные параметры */}
        {(sel.style || sel.model || sel.finish || sel.color || sel.width || sel.height) && (
          <div className="bg-white border border-black/10 p-6 border-b-2 border-b-gray-300">
            <h2 className="text-xl font-semibold text-black mb-4">Параметры</h2>
            <div className="text-sm space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Стиль:</span>
                <span className="text-black font-medium">{sel.style || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Модель:</span>
                <span className="text-black font-medium">{selectedModelCard ? formatModelNameForCard(selectedModelCard.model) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Покрытие и цвет:</span>
                <span className="text-black font-medium">
                  {sel.finish && sel.color
                    ? `${sel.finish}, ${sel.color}`
                    : sel.finish
                      ? sel.finish
                      : sel.color
                        ? sel.color
                        : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Размеры:</span>
                <span className="text-black font-medium">
                  {sel.width && sel.height
                    ? `${sel.width} × ${sel.height} мм`
                    : sel.width
                      ? `${sel.width} мм`
                      : sel.height
                        ? `${sel.height} мм`
                        : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Комплект фурнитуры:</span>
                <span className="text-black font-medium">
                  {sel.hardware_kit?.id
                    ? (() => {
                        if (!Array.isArray(hardwareKits) || hardwareKits.length === 0) {
                          return "—";
                        }
                        const kit = findHardwareKitById(hardwareKits, sel.hardware_kit!.id);
                        return kit?.name ? kit.name.replace('Комплект фурнитуры — ', '') : "—";
                      })()
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Ручка:</span>
                <span className="text-black font-medium">
                  {sel.handle?.id
                    ? findHandleById(handles, sel.handle!.id)?.name || "—"
                    : "—"}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Корзина - показывается всегда */}
        <div className="bg-white border border-black/10 p-5 transition-all duration-700 ease-in-out">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
              <h2 className="text-lg font-semibold text-black">Корзина ({cart.length})</h2>
              {selectedClientName && (
                <div className="flex items-center space-x-1 px-2 py-1 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
                  <span>👤</span>
                  <span>{selectedClientName}</span>
                </div>
              )}
            </div>
            <div className="text-sm text-gray-600">
              Итого:{" "}
              <span className="font-semibold text-black text-base">
                {fmtInt(cart.reduce((s, i) => s + i.unitPrice * i.qty, 0))} ₽
              </span>
            </div>
          </div>
          
          {cart.length ? (
            <div className="space-y-2">
              {cart.map((i) => {
                // Если это ручка, отображаем отдельно
                if (i.handleId) {
                  // ИСПРАВЛЕНИЕ: Всегда используем актуальное имя из каталога, а не item.handleName
                  const handle = findHandleById(handles, i.handleId);
                  const currentHandleName = handle?.name || i.handleName || "Ручка";
                  return (
                    <div key={i.id} className="border border-black/10 p-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-black text-sm">
                          {currentHandleName ? `Ручка ${currentHandleName}` : "Ручка"}
                        </div>
                        <div className="text-sm">
                          <span className="text-gray-600">{i.qty}×{fmtInt(i.unitPrice)}</span>
                          <span className="font-semibold text-black ml-3">{fmtInt(i.unitPrice * i.qty)} ₽</span>
                        </div>
                      </div>
                    </div>
                  );
                }
                
                // Иначе отображаем дверь с комплектом
                return (
                  <div key={i.id} className="border border-black/10 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <div className="font-medium text-black">
                          {i.type === 'handle' 
                            ? (() => {
                                const displayHandle = i.handleId ? findHandleById(handles, i.handleId) : null;
                                return `Ручка ${displayHandle?.name || i.handleName || 'Неизвестная ручка'}`;
                              })()
                            : `Дверь ${formatModelName(i.model) || 'Неизвестная модель'}`}
                        </div>
                        <div className="text-gray-600 text-xs font-normal">
                          {i.type === 'handle' 
                            ? `(Ручка для двери)`
                            : `(${i.finish}, ${i.color}, ${i.width} × ${i.height} мм, Фурнитура - ${(() => {
                                if (!Array.isArray(hardwareKits) || hardwareKits.length === 0 || !i.hardwareKitId) {
                                  return i.hardwareKitName?.replace('Комплект фурнитуры — ', '') || 'Базовый';
                                }
                                const kit = findHardwareKitById(hardwareKits, i.hardwareKitId);
                                return kit?.name ? kit.name.replace('Комплект фурнитуры — ', '') : (i.hardwareKitName?.replace('Комплект фурнитуры — ', '') || 'Базовый');
                              })()})`}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm">
                      <span className="text-gray-600">{i.qty}×{fmtInt(i.unitPrice)}</span>
                      <span className="font-semibold text-black ml-3">{fmtInt(i.unitPrice * i.qty)} ₽</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-gray-500 text-center py-4">
              Корзина пуста
            </div>
          )}

          {/* Блок кнопок экспорта временно удален по запросу */}
        </div>
      </div>
    </aside>
  );
}

