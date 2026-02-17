'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';

export interface FilterStepInfo {
  step: string;
  filterCondition: string;
  inputCount: number;
  outputCount: number;
  outputPreview: string[];
  selected?: string | null;
}

export interface FilterDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  steps: FilterStepInfo[];
  /** Доп. сведения (поставщики модели, код модели и т.д.) */
  extra?: Record<string, string | number | string[] | null | undefined>;
}

function StepRow({ step }: { step: FilterStepInfo }) {
  const diff = step.outputCount - step.inputCount;
  const isEmpty = step.outputCount === 0;
  return (
    <div
      className="border-b border-gray-200 last:border-0 py-3"
      style={{ fontFamily: 'ui-monospace, monospace', fontSize: '13px' }}
    >
      <div className="font-semibold text-gray-900 mb-1">{step.step}</div>
      <div className="text-gray-600 mb-1">{step.filterCondition}</div>
      <div className="flex items-center gap-2 flex-wrap text-gray-700">
        <span>
          было: <strong>{step.inputCount}</strong>
        </span>
        <span>→</span>
        <span className={isEmpty ? 'text-red-600 font-medium' : ''}>
          осталось: <strong>{step.outputCount}</strong>
        </span>
        {diff !== 0 && (
          <span className={diff < 0 ? 'text-amber-600' : 'text-green-600'}>
            ({diff > 0 ? '+' : ''}{diff})
          </span>
        )}
      </div>
      {step.selected != null && step.selected !== '' && (
        <div className="text-gray-500 mt-0.5">выбрано: «{step.selected}»</div>
      )}
      {step.outputPreview.length > 0 && (
        <div className="mt-1.5 text-gray-500 truncate max-w-full" title={step.outputPreview.join(', ')}>
          {step.outputPreview.slice(0, 5).join(', ')}
          {step.outputPreview.length > 5 ? ` … +${step.outputPreview.length - 5}` : ''}
        </div>
      )}
    </div>
  );
}

export function FilterDebugModal({ isOpen, onClose, steps, extra = {} }: FilterDebugModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Фильтрация конфигуратора (по шагам)" size="lg">
      <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
        {steps.length === 0 ? (
          <p className="text-gray-500">Нет данных о шагах фильтрации.</p>
        ) : (
          steps.map((s, i) => <StepRow key={`${i}-${s.step}`} step={s} />)
        )}
      </div>
      {Object.keys(extra).length > 0 && (
        <div className="mt-4 pt-3 border-t border-gray-200">
          <div className="font-semibold text-gray-700 mb-2">Доп. данные</div>
          <pre className="text-xs text-gray-600 bg-gray-50 p-2 rounded overflow-x-auto">
            {JSON.stringify(extra, null, 2)}
          </pre>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700"
        >
          Закрыть
        </button>
      </div>
    </Modal>
  );
}
