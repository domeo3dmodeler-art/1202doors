// Next.js автоматически загружает переменные окружения
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = { 
  reactStrictMode: true,
  // output: 'standalone' для production/staging и для безопасного артефакта (см. scripts/build-artifact.sh)
  ...((process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging' || process.env.NEXT_BUILD_ARTIFACT === '1') && { output: 'standalone' }),
  outputFileTracingRoot: path.join(__dirname),
  
  // Оптимизация производительности
  compress: true,
  
  // Оптимизация изображений
  images: {
    formats: ['image/webp', 'image/avif'],
    minimumCacheTTL: 60,
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    domains: [
      'storage.yandexcloud.net',
      'disk.360.yandex.ru',
      'downloader.disk.yandex.ru',
      'get.disk.yandex.ru',
    ],
  },
  
  // Явно разрешаем webpack при наличии webpack()-конфига (Next 16 по умолчанию Turbopack)
  turbopack: {},
  // Оптимизация сборки
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ['lucide-react'],
  },
  
  // Настройки для исключения страниц из статической генерации
  // output: 'standalone' только для production (см. строку 6)
  
  // ВНИМАНИЕ: Отключаем TypeScript ошибки при сборке
  // Перед отключением ignoreBuildErrors необходимо исправить все ошибки
  // См. docs/TYPESCRIPT_ERRORS_FIX_PLAN.md для плана исправления
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // /uploads/* → /api/uploads/* для раздачи с декодированием URL (кириллица в путях)
  async rewrites() {
    return [
      { source: '/uploads/:path*', destination: '/api/uploads/:path*' },
    ];
  },

  // Кэширование
  // Порядок важен: более специфичные правила должны быть первыми
  async headers() {
    return [
      // Статические файлы Next.js - кэшируем навсегда
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // API routes - не кэшируем
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
      // Загруженные файлы - не кэшируем
      {
        source: '/uploads/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
        ],
      },
      // Все остальные страницы - не кэшируем
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate, max-age=0',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
      // Заголовки безопасности (приложение может работать без nginx)
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self';",
          },
        ],
      },
    ];
  },
  
  // Генерация уникального BUILD_ID для инвалидации кэша браузера
  generateBuildId: async () => {
    // Генерируем уникальный ID на основе текущего времени и случайной строки
    // Это заставляет браузер загружать новый код при каждом деплое
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    const buildId = `build-${timestamp}-${random}`;
    console.log('🔧 Generated BUILD_ID:', buildId);
    return buildId;
  },
  
  // Оптимизация webpack
  webpack: (config, { dev, isServer }) => {
    // Явный alias @ на корень проекта (исправляет "Module not found" для @/lib, @/components на части сборки)
    const root = path.resolve(__dirname);
    const prismaClientPath = path.resolve(__dirname, 'node_modules/@prisma/client');
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': root,
      '@prisma/client': prismaClientPath,
      '.prisma/client': path.resolve(__dirname, 'node_modules/.prisma/client'),
    };
    
    // Добавляем node_modules в resolve.modules для правильного разрешения
    if (!config.resolve.modules) {
      config.resolve.modules = [];
    }
    config.resolve.modules.push(path.resolve(__dirname, 'node_modules'));
    
    // Исключаем Prisma из обработки на клиенте (только для сервера)
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    
    if (!dev && !isServer) {
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            chunks: 'all',
          },
        },
      };
    }
    return config;
  },
};
export default nextConfig;
