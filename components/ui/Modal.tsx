'use client';

// components/ui/Modal.tsx
// Унифицированные модальные окна в стиле Domeo

import React, { useEffect, useRef } from 'react';
import { createComponentStyles } from '../../lib/design/tokens';
import { clientLogger } from '@/lib/logging/client-logger';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
  className?: string;
  /** Закрывать ли окно по клику на затемнённый фон (по умолчанию true) */
  closeOnBackdropClick?: boolean;
}

export function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  footer,
  size = 'md',
  className = '',
  closeOnBackdropClick = true
}: ModalProps) {
  const styles = createComponentStyles();
  const modalRef = useRef<HTMLDivElement>(null);
  
  // Логирование для отладки
  clientLogger.debug('🔍 Modal component render:', { isOpen, size, className });
  
  // Закрытие по Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Установка стилей ширины для размера xl и full напрямую в DOM
  useEffect(() => {
    if (!isOpen || (size !== 'xl' && size !== 'full') || !modalRef.current) return;
    
    const element = modalRef.current;
    
    // Функция для установки ширины
    const setWidth = () => {
      // Для full используем ширину в 2 раза больше xl (2400px), для xl - 1208px
      const baseWidth = size === 'full' ? 2400 : 1208;
      // Устанавливаем стили с !important для гарантированного применения
      // Используем calc для адаптивности на маленьких экранах
      const maxWidth = Math.min(baseWidth, window.innerWidth - 32); // baseWidth или ширина экрана минус отступы
      element.style.setProperty('max-width', `${maxWidth}px`, 'important');
      element.style.setProperty('width', `${maxWidth}px`, 'important');
      element.style.setProperty('min-width', `min(${baseWidth}px, calc(100vw - 32px))`, 'important');
      element.style.setProperty('flex-shrink', '0', 'important');
      // Убираем все классы ширины из Tailwind, которые могут конфликтовать
      element.className = element.className
        .replace(/max-w-\S+/g, '')
        .replace(/w-\S+/g, '')
        .replace(/min-w-\S+/g, '')
        .trim();
      clientLogger.debug(`🔍 Modal ${size} - стили установлены через setProperty с !important, ширина:`, maxWidth);
    };
    
    // Устанавливаем ширину сразу
    setWidth();
    
    // Добавляем обработчик изменения размера окна для адаптивности
    window.addEventListener('resize', setWidth);
    
    return () => {
      window.removeEventListener('resize', setWidth);
    };
  }, [isOpen, size]);

  if (!isOpen) {
    clientLogger.debug('🔍 Modal: isOpen=false, не рендерим');
    return null;
  }

  clientLogger.debug('🔍 Modal: isOpen=true, рендерим с size=', size);

  // Определяем размеры для разных типов модальных окон
  const getSizeStyles = (): React.CSSProperties => {
    switch (size) {
      case 'sm':
        return { maxWidth: '384px', width: '100%' };
      case 'md':
        return { maxWidth: '448px', width: '100%' };
      case 'lg':
        return { maxWidth: '512px', width: '100%' };
      case 'xl':
        // Для xl используем фиксированную ширину с адаптивностью
        // Ширина будет переопределена в useEffect через setProperty
        // На сервере используем дефолтное значение
        return { 
          maxWidth: '1208px', 
          width: '1208px', 
          minWidth: 'min(1208px, calc(100vw - 32px))',
          boxSizing: 'border-box',
          flexShrink: 0
        };
      case 'full':
        // Для full используем ширину в 2 раза больше xl (2400px)
        // Ширина будет переопределена в useEffect через setProperty
        return { 
          maxWidth: '2400px', 
          width: '2400px', 
          minWidth: 'min(2400px, calc(100vw - 32px))',
          boxSizing: 'border-box',
          flexShrink: 0
        };
      case '2xl':
        return { maxWidth: '672px', width: '100%' };
      case '3xl':
        return { maxWidth: '576px', width: '100%' };
      default:
        return { maxWidth: '448px', width: '100%' };
    }
  };

  // Базовые классы без ограничений ширины для xl и full
  // Для xl и full используем overflow-y-auto вместо overflow-hidden для прокрутки контента
  const baseClasses = (size === 'xl' || size === 'full')
    ? 'bg-white rounded-lg shadow-xl max-h-[90vh] overflow-y-auto relative'
    : 'bg-white rounded-lg shadow-xl max-h-[90vh] overflow-hidden relative';
  
  // Для xl и full полностью убираем классы ширины из Tailwind и styles.modal.content
  // чтобы избежать конфликтов с фиксированной шириной
  const modalClasses = (size === 'xl' || size === 'full')
    ? `${baseClasses} ${className}`.replace(/w-\S+/g, '').replace(/max-w-\S+/g, '').trim()
    : `${baseClasses} ${styles.modal.content.replace('w-full', '')} ${className}`;

  return (
    <div 
      className={styles.modal.overlay} 
      onClick={closeOnBackdropClick ? onClose : undefined}
      style={(size === 'xl' || size === 'full') ? { 
        padding: '0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      } : undefined}
    >
      <div 
        ref={modalRef}
        className={modalClasses}
        style={{
          ...getSizeStyles(),
          margin: (size === 'xl' || size === 'full') ? '0' : '0 auto',
          boxSizing: 'border-box',
          flexShrink: 0
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Кнопка закрытия - всегда показываем */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 p-2 hover:bg-gray-100 rounded-full transition-colors bg-white shadow-sm"
          aria-label="Закрыть"
        >
          <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        {title && (
          <div className={styles.modal.header}>
            <h3 className="text-lg font-semibold text-black">{title}</h3>
          </div>
        )}

        {/* Content */}
        <div className={styles.modal.body}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className={styles.modal.footer}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Экспорт для удобства
export default Modal;
