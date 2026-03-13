'use client';

import React from 'react';

/** Цвет и стиль штриха «карандашного» скетча */
const SKETCH_STROKE = '#6b7280';
const SKETCH_STROKE_LIGHT = '#9ca3af';
const SKETCH_STROKE_WIDTH = 1.2;
const SKETCH_ROUND = 'round';

type SketchProps = {
  className?: string;
  width?: number;
  height?: number;
  stroke?: string;
};

/**
 * Угол рамы двери — две линии под 90°, скетч-стиль (карандашный штрих).
 * Для декора рядом с заголовками.
 */
export function SketchDoorFrameCorner({ className, width = 32, height = 32, stroke = SKETCH_STROKE }: SketchProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M4 28V10M4 10h18"
        stroke={stroke}
        strokeWidth={SKETCH_STROKE_WIDTH}
        strokeLinecap={SKETCH_ROUND}
        strokeLinejoin={SKETCH_ROUND}
        strokeDasharray="2.5 1.8"
      />
    </svg>
  );
}

/**
 * Контур двери с панелями — прямоугольник и внутренние линии панели.
 * Миниатюра «дверь» в скетч-стиле (лёгкая ручная неровность).
 */
export function SketchDoorSilhouette({ className, width = 40, height = 80, stroke = SKETCH_STROKE }: SketchProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 40 80"
      fill="none"
      className={className}
      aria-hidden
    >
      {/* Рамка двери — контур с лёгким «карандашным» штрихом */}
      <path
        d="M5 5h30v70H5V5z"
        stroke={stroke}
        strokeWidth={SKETCH_STROKE_WIDTH}
        strokeLinecap={SKETCH_ROUND}
        strokeLinejoin={SKETCH_ROUND}
        strokeDasharray="4 2"
      />
      {/* Верхняя панель */}
      <path
        d="M9 9h22v26H9V9z"
        stroke={SKETCH_STROKE_LIGHT}
        strokeWidth={SKETCH_STROKE_WIDTH * 0.9}
        strokeLinecap={SKETCH_ROUND}
        strokeLinejoin={SKETCH_ROUND}
        strokeDasharray="2 1.5"
      />
      {/* Нижняя панель */}
      <path
        d="M9 45h22v26H9V45z"
        stroke={SKETCH_STROKE_LIGHT}
        strokeWidth={SKETCH_STROKE_WIDTH * 0.9}
        strokeLinecap={SKETCH_ROUND}
        strokeLinejoin={SKETCH_ROUND}
        strokeDasharray="2 1.5"
      />
    </svg>
  );
}

/**
 * Петля в скетч-стиле — два «крыла» и ось.
 */
export function SketchHinge({ className, width = 24, height = 24, stroke = SKETCH_STROKE }: SketchProps) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M6 4v16M18 4v16M6 4h4M6 20h4M18 4h-4M18 20h-4M10 4v4M14 4v4M10 20v-4M14 20v-4"
        stroke={stroke}
        strokeWidth={SKETCH_STROKE_WIDTH}
        strokeLinecap={SKETCH_ROUND}
        strokeLinejoin={SKETCH_ROUND}
        strokeDasharray="1.5 1"
      />
    </svg>
  );
}

/**
 * Горизонтальный разделитель — «карандашная» линия с лёгкой неровностью.
 */
export function SketchDivider({ className, width = 120, stroke = SKETCH_STROKE_LIGHT }: Omit<SketchProps, 'height'>) {
  return (
    <svg
      width={width}
      height={8}
      viewBox={`0 0 ${width} 8`}
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d={`M0 4 Q${width * 0.25} 3 ${width * 0.5} 4 T${width} 4`}
        stroke={stroke}
        strokeWidth={1}
        strokeLinecap={SKETCH_ROUND}
        strokeDasharray="4 3"
      />
    </svg>
  );
}

/**
 * Декоративный блок: угол рамы + мини-дверь. Для секции «Модели».
 */
export function SketchDoorAccent({ className }: { className?: string }) {
  return (
    <div className={`flex items-end gap-1 opacity-70 ${className ?? ''}`}>
      <SketchDoorFrameCorner width={28} height={28} stroke={SKETCH_STROKE_LIGHT} />
      <SketchDoorSilhouette width={28} height={56} stroke={SKETCH_STROKE_LIGHT} />
    </div>
  );
}

/**
 * Уголок для заголовка «Стили» — только рама.
 */
export function SketchCornerForTitle({ className }: { className?: string }) {
  return (
    <span className={`inline-flex shrink-0 ${className ?? ''}`} aria-hidden>
      <SketchDoorFrameCorner width={24} height={24} stroke={SKETCH_STROKE_LIGHT} />
    </span>
  );
}

/**
 * Небольшая скетч-рамка вокруг угла (для обводки превью или блока).
 * Рисует только два края угла с лёгким отступом.
 */
export function SketchCornerFrame({
  className,
  size = 48,
  corner = 'top-left',
  stroke = SKETCH_STROKE_LIGHT,
}: {
  className?: string;
  size?: number;
  corner?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  stroke?: string;
}) {
  const d =
    corner === 'top-left'
      ? `M ${size} 0 L 0 0 L 0 ${size}`
      : corner === 'top-right'
        ? `M 0 0 L ${size} 0 L ${size} ${size}`
        : corner === 'bottom-left'
          ? `M 0 0 L 0 ${size} L ${size} ${size}`
          : `M 0 ${size} L ${size} ${size} L ${size} 0`;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d={d}
        stroke={stroke}
        strokeWidth={SKETCH_STROKE_WIDTH}
        strokeLinecap={SKETCH_ROUND}
        strokeLinejoin={SKETCH_ROUND}
        strokeDasharray="3 2"
      />
    </svg>
  );
}
