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
        description: true,
        base_price: true,
        properties_data: true,
        images: {
          select: { url: true, original_name: true, sort_order: true, is_primary: true },
          orderBy: [{ is_primary: 'desc' }, { sort_order: 'asc' }],
        },
      },
    });

    // По листу «04 Ручки Завертки»: первое фото — ручка (Фото (ссылка)), второе — завертка (Фото завертки (ссылка)).
    // В БД: handle.jpg / is_primary+sort_order 0 = ручка, zaverтка.jpg / sort_order 1 = завертка.
    // Приоритет локальных путей /uploads/: на фронте внешние ссылки (360.yandex и т.п.) отбрасываются — иначе плейсхолдер.
    const isLocalUrl = (url: string) => typeof url === 'string' && url.trim().startsWith('/uploads/');
    const pickHandleAndBackplateUrls = (images: Array<{ url: string; original_name: string; sort_order: number; is_primary: boolean }>): [string, string | null] => {
      const withUrl = (images ?? []).filter((i) => i?.url);
      if (withUrl.length === 0) return ['', null];
      const backplateImg = withUrl.find((i) => String(i.original_name || '').toLowerCase().includes('zaverтка') || i.sort_order === 1);
      const handleCandidates = withUrl.filter((i) => i.is_primary || i.sort_order === 0 || !String(i.original_name || '').toLowerCase().includes('zaverтка'));
      const handleImg = handleCandidates.find((i) => isLocalUrl(i.url)) ?? handleCandidates[0] ?? withUrl[0];
      const handleUrl = handleImg?.url ?? withUrl[0]?.url ?? '';
      const backplateCandidates = withUrl.filter((i) => String(i.original_name || '').toLowerCase().includes('zaverтка') || i.sort_order === 1);
      const backplateLocal = backplateCandidates.find((i) => isLocalUrl(i.url));
      const backplateUrlRaw = backplateLocal?.url ?? backplateImg?.url ?? (withUrl.length > 1 && withUrl[1].url !== handleUrl ? withUrl[1].url : null);
      const backplateUrl = backplateUrlRaw && backplateUrlRaw !== handleUrl ? backplateUrlRaw : null;
      return [handleUrl, backplateUrl];
    };

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

      const images = handle.images ?? [];
      const [handleUrl, backplateUrl] = pickHandleAndBackplateUrls(images as Array<{ url: string; original_name: string; sort_order: number; is_primary: boolean }>);
      // Локальные пути отдаём как /api/uploads/... — фронт подставляет в src (на ВМ статика /uploads/ даёт 503).
      const toPhotoUrl = (u: string) => {
        if (!u || u.startsWith('http://') || u.startsWith('https://')) return u;
        if (u.startsWith('/api/')) return u;
        const norm = u.startsWith('/') ? u : `/${u}`;
        if (norm.startsWith('/uploads/') || norm.includes('final-filled') || norm.includes('handle_')) return `/api${norm}`;
        return u;
      };
      let photos: string[] = [handleUrl].filter(Boolean).map(toPhotoUrl);
      if (backplateUrl) photos.push(toPhotoUrl(backplateUrl));
      // Фото: при отсутствии в ProductImage — из properties_data
      if (photos.length === 0 && props.photos) {
        if (typeof props.photos === 'object' && props.photos !== null && 'cover' in props.photos) {
          const photosObj = props.photos as { cover?: string; gallery?: string[] };
          const normalizePhoto = (photo: string | null | undefined): string | null => {
            if (!photo) return null;
            if (photo.startsWith('http://') || photo.startsWith('https://')) return photo;
            if (photo.startsWith('products/')) return `/api/uploads/${photo}`;
            if (photo.startsWith('/uploads/')) return `/api${photo}`;
            if (!photo.startsWith('/')) return `/api/uploads/products/${photo}`;
            return photo.startsWith('/api/') ? photo : `/api${photo}`;
          };
          photos = [normalizePhoto(photosObj.cover), ...(photosObj.gallery || []).map(normalizePhoto)].filter((p): p is string => p !== null);
        } else if (Array.isArray(props.photos)) {
          photos = (props.photos as string[]).map((p: string) => {
            if (!p) return null;
            if (p.startsWith('http://') || p.startsWith('https://')) return p;
            if (p.startsWith('products/')) return `/api/uploads/${p}`;
            if (p.startsWith('/uploads/')) return `/api${p}`;
            return p.startsWith('/api/') ? p : (p.startsWith('/') ? `/api${p}` : `/api/uploads/products/${p}`);
          }).filter((p): p is string => p !== null);
        }
      }
      
      return {
        id: handle.id,
        name: (props['Domeo_наименование для Web'] as string) || 
          (props['Domeo_наименование ручки_1С'] as string) || 
          handle.name,
        group: (props['Группа'] as string) || 'Без группы',
        price: parseFloat((props['Domeo_цена группы Web'] as string) || '0') || parseFloat((props['Цена продажи (руб)'] as string) || '0') || Number(handle.base_price) || 0,
        isBasic: (props['Группа'] as string) === 'Базовый',
        showroom: (props['Наличие в шоуруме'] as string) === 'да' || 
          (props['Наличие в шоуруме'] as string) === 'Да',
        supplier: (props['Поставщик'] as string) || '',
        article: (props['Фабрика_артикул'] as string) || '',
        factoryName: (props['Фабрика_наименование'] as string) || '',
        photos: photos,
        color: (props['Цвет'] as string) || undefined,
        description: handle.description || undefined,
        backplate_price_rrc: parseFloat(String(props['Завертка, цена РРЦ'] ?? '')) || 0,
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
      const supplier = String(props['Поставщик'] ?? props['Наличник: Поставщик'] ?? '').trim();
      return {
        id: p.id,
        option_type: 'наличники',
        option_name: (props['Наличник: Название'] as string) || p.name,
        price_surcharge: price,
        photo_path: photo,
        supplier: supplier || undefined,
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
