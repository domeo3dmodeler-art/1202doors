import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { getHardwareKitsCategoryId, getHandlesCategoryId, getLimitersCategoryId, getCategoryIdByName } from '@/lib/catalog-categories';

async function getHandler(
  request: NextRequest
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const url = new URL(request.url);
  const type = url.searchParams.get('type'); // 'kits' | 'handles' | 'limiters' | 'architraves'

  logger.debug('Загрузка данных фурнитуры', 'catalog/hardware/GET', { type }, loggingContext);

  if (type === 'kits') {
    const categoryId = await getHardwareKitsCategoryId();
    if (!categoryId) {
      return apiSuccess([]);
    }
    const kits = await prisma.product.findMany({
      where: {
        catalog_category_id: categoryId,
      },
      select: {
        id: true,
        name: true,
        base_price: true,
        properties_data: true,
      },
    });

    const formattedKits = kits.map(kit => {
      let props: Record<string, unknown>;
      try {
        props = typeof kit.properties_data === 'string' 
          ? JSON.parse(kit.properties_data) 
          : kit.properties_data || {};
      } catch (parseError) {
        logger.warn('Ошибка парсинга свойств комплекта', 'catalog/hardware/GET', { kitId: kit.id, error: parseError }, loggingContext);
        props = {};
      }
      return {
        id: kit.id,
        name: (props['Наименование для Web'] as string) || kit.name,
        description: (props['Описание комплекта для Web'] as string) || '',
        price: parseFloat((props['Группа_цена'] as string) || '0') || Number(kit.base_price) || 0,
        priceGroup: (props['Ценовая группа'] as string) || '',
        isBasic: (props['Ценовая группа'] as string) === 'Базовый',
      };
    });

    return apiSuccess(formattedKits);
  }

  if (type === 'handles') {
    const categoryId = await getHandlesCategoryId();
    if (!categoryId) {
      return apiSuccess({});
    }
    const handles = await prisma.product.findMany({
      where: {
        catalog_category_id: categoryId,
      },
      select: {
        id: true,
        name: true,
        base_price: true,
        properties_data: true,
        images: {
          select: { url: true },
          orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }],
        },
      },
    });

    const formattedHandles = handles.map(handle => {
      let props: Record<string, unknown>;
      try {
        props = typeof handle.properties_data === 'string' 
          ? JSON.parse(handle.properties_data) 
          : handle.properties_data || {};
      } catch (parseError) {
        logger.warn('Ошибка парсинга свойств ручки', 'catalog/hardware/GET', { handleId: handle.id, error: parseError }, loggingContext);
        props = {};
      }
      
      let photos: string[] = (handle.images?.map((i) => i.url) ?? []).filter(Boolean);
      // Фото: сначала из ProductImage, при отсутствии — из properties_data
      if (photos.length === 0 && props.photos) {
        if (typeof props.photos === 'object' && props.photos !== null && 'cover' in props.photos) {
          const photosObj = props.photos as { cover?: string; gallery?: string[] };
          const normalizePhoto = (photo: string | null | undefined): string | null => {
            if (!photo) return null;
            if (photo.startsWith('http://') || photo.startsWith('https://')) return photo;
            if (photo.startsWith('products/')) return `/uploads/${photo}`;
            if (photo.startsWith('/uploads/')) return photo;
            if (!photo.startsWith('/')) return `/uploads/products/${photo}`;
            return photo;
          };
          photos = [normalizePhoto(photosObj.cover), ...(photosObj.gallery || []).map(normalizePhoto)].filter((p): p is string => p !== null);
        } else if (Array.isArray(props.photos)) {
          photos = (props.photos as string[]).map((p: string) => {
            if (!p) return null;
            if (p.startsWith('http://') || p.startsWith('https://')) return p;
            if (p.startsWith('products/')) return `/uploads/${p}`;
            if (p.startsWith('/uploads/')) return p;
            return p.startsWith('/') ? p : `/uploads/products/${p}`;
          }).filter((p): p is string => p !== null);
        }
      }
      
      return {
        id: handle.id,
        name: (props['Domeo_наименование для Web'] as string) || 
          (props['Domeo_наименование ручки_1С'] as string) || 
          handle.name,
        group: (props['Группа'] as string) || 'Без группы',
        price: parseFloat((props['Domeo_цена группы Web'] as string) || '0') || Number(handle.base_price) || 0,
        isBasic: (props['Группа'] as string) === 'Базовый',
        showroom: (props['Наличие в шоуруме'] as string) === 'да' || 
          (props['Наличие в шоуруме'] as string) === 'Да',
        supplier: (props['Поставщик'] as string) || '',
        article: (props['Фабрика_артикул'] as string) || '',
        factoryName: (props['Фабрика_наименование'] as string) || '',
        photos: photos,
      };
    });

    // Группируем ручки по группам
    const groupedHandles = formattedHandles.reduce((acc, handle) => {
      const group = handle.group || 'Без группы';
      if (!acc[group]) {
        acc[group] = [];
      }
      acc[group].push(handle);
      return acc;
    }, {} as Record<string, typeof formattedHandles>);

    return apiSuccess(groupedHandles);
  }

  if (type === 'limiters') {
    const categoryId = await getLimitersCategoryId();
    if (!categoryId) {
      return apiSuccess([]);
    }
    const limiters = await prisma.product.findMany({
      where: { catalog_category_id: categoryId },
      select: {
        id: true,
        name: true,
        base_price: true,
        properties_data: true,
        images: { select: { url: true }, orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }] },
      },
    });
    const normalizePhoto = (url: string | null | undefined): string | null => {
      if (!url || typeof url !== 'string') return null;
      const t = url.trim();
      if (t.startsWith('http://') || t.startsWith('https://')) return t;
      if (t.startsWith('/uploads/')) return t;
      if (t.startsWith('uploads/')) return `/${t}`;
      return `/${t.replace(/^\//, '')}`;
    };
    const formatted = limiters.map((p) => {
      let props: Record<string, unknown> = {};
      try {
        props = typeof p.properties_data === 'string' ? JSON.parse(p.properties_data) : p.properties_data || {};
      } catch {
        // ignore
      }
      const photoFromImage = (p.images?.[0]?.url) ?? null;
      const photoFromProps = (props['Фото (путь)'] ?? props['Фото'] ?? props['photo']) as string | undefined;
      const photo = photoFromImage ?? (photoFromProps ? normalizePhoto(photoFromProps) : null);
      const price = parseFloat((props['Цена РРЦ'] as string) || '') || Number(p.base_price) || 0;
      return {
        id: p.id,
        name: (props['Наименование для Web'] as string) || p.name,
        photo_path: photo,
        price_rrc: price,
        price_opt: price,
      };
    });
    return apiSuccess(formatted);
  }

  if (type === 'architraves') {
    const categoryId = await getCategoryIdByName('Наличники');
    if (!categoryId) {
      return apiSuccess([]);
    }
    const products = await prisma.product.findMany({
      where: { catalog_category_id: categoryId },
      select: {
        id: true,
        name: true,
        base_price: true,
        properties_data: true,
        images: { select: { url: true }, orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }] },
      },
    });
    const normalizePhoto = (url: string | null | undefined): string | null => {
      if (!url || typeof url !== 'string') return null;
      const t = url.trim();
      if (t.startsWith('http://') || t.startsWith('https://')) return t;
      if (t.startsWith('/uploads/')) return t;
      if (t.startsWith('uploads/')) return `/${t}`;
      return `/${t.replace(/^\//, '')}`;
    };
    const formatted = products.map((p) => {
      let props: Record<string, unknown> = {};
      try {
        props = typeof p.properties_data === 'string' ? JSON.parse(p.properties_data) : p.properties_data || {};
      } catch {
        // ignore
      }
      const photoFromImage = (p.images?.[0]?.url) ?? null;
      const photoFromProps = (props['Наличник: Фото (ссылка)'] ?? props['Фото (ссылка)'] ?? props['Фото'] ?? props['photo']) as string | undefined;
      const photo = photoFromImage ?? (photoFromProps ? normalizePhoto(photoFromProps) : null);
      const price = parseFloat((props['Цена РРЦ'] as string) || '') || Number(p.base_price) || 0;
      return {
        id: p.id,
        option_type: 'наличники',
        option_name: (props['Наличник: Название'] as string) || p.name,
        price_surcharge: price,
        photo_path: photo,
      };
    });
    return apiSuccess(formatted);
  }

  return apiError(
    ApiErrorCode.VALIDATION_ERROR,
    'Неверный параметр type. Используйте "kits", "handles", "limiters" или "architraves"',
    400
  );
}

// Публичный API - каталог фурнитуры доступен всем
export const GET = withErrorHandling(
  getHandler,
  'catalog/hardware/GET'
);
