import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { NotFoundError } from '@/lib/api/errors';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser, type AuthenticatedUser } from '@/lib/auth/request-helpers';

// Импортируем функции напрямую для совместимости
function structurePhotos(photos: string[]) {
  const coverPhotos: string[] = [];
  const galleryPhotos: Array<{ photo: string; number: number }> = [];
  
  photos.forEach(photo => {
    const photoInfo = parsePhotoFileName(photo);
    
    if (photoInfo.isCover) {
      coverPhotos.push(photo);
    } else if (photoInfo.number !== null) {
      galleryPhotos.push({ photo, number: photoInfo.number });
    }
  });
  
  // Сортируем галерею по номерам
  galleryPhotos.sort((a, b) => a.number - b.number);
  
  return {
    cover: coverPhotos.length > 0 ? coverPhotos[0] : null,
    gallery: galleryPhotos.map(item => item.photo)
  };
}

function parsePhotoFileName(fileName: string) {
  const nameWithoutExt = fileName.replace(/\.[^/.]+$/, "");
  
  // Проверяем, есть ли номер в конце (_1, _2, etc.)
  const match = nameWithoutExt.match(/^(.+)_(\d+)$/);
  
  if (match) {
    return {
      fileName,
      isCover: false,
      number: parseInt(match[2]),
      baseName: match[1]
    };
  } else {
    return {
      fileName,
      isCover: true,
      number: null,
      baseName: nameWithoutExt
    };
  }
}

function getCoverPhoto(photoStructure: { cover: string | null; gallery: string[] }) {
  return photoStructure.cover;
}

function getAllPhotos(photoStructure: { cover: string | null; gallery: string[] }) {
  const allPhotos: string[] = [];
  
  if (photoStructure.cover) {
    allPhotos.push(photoStructure.cover);
  }
  
  allPhotos.push(...photoStructure.gallery);
  
  return allPhotos;
}

function hasPhotos(photoStructure: { cover: string | null; gallery: string[] }) {
  return photoStructure.cover !== null || photoStructure.gallery.length > 0;
}

function getPhotoCount(photoStructure: { cover: string | null; gallery: string[] }) {
  let count = 0;
  if (photoStructure.cover) count++;
  count += photoStructure.gallery.length;
  return count;
}

// GET /api/catalog/products/by-sku/[sku] - Получить товар по SKU с структурированными фото
async function getHandler(
  request: NextRequest,
  user: AuthenticatedUser,
  { params }: { params: Promise<{ sku: string }> }
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(request);
  const { sku } = await params;
  const decodedSku = decodeURIComponent(sku);

  logger.debug('Получение товара по SKU', 'catalog/products/by-sku/[sku]/GET', { sku: decodedSku }, loggingContext);

  const product = await prisma.product.findUnique({
    where: { sku: decodedSku },
    include: {
      catalog_category: {
        select: {
          id: true,
          name: true,
          level: true,
          path: true
        }
      }
    }
  });

  if (!product) {
    throw new NotFoundError('Товар', decodedSku);
  }

  // Парсим свойства товара
  const properties = product.properties_data ? 
    (typeof product.properties_data === 'string' ? JSON.parse(product.properties_data) : product.properties_data) : {};

  // Структурируем фото
  const photos = (properties.photos || []) as string[];
  const photoStructure = structurePhotos(photos);

  // Формируем ответ
  const response = {
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      description: product.description,
      brand: product.brand,
      model: product.model,
      series: product.series,
      price: product.base_price,
      base_price: product.base_price,
      properties: properties,
      photos: {
        structure: photoStructure,
        cover: getCoverPhoto(photoStructure),
        all: getAllPhotos(photoStructure),
        hasPhotos: hasPhotos(photoStructure),
        count: getPhotoCount(photoStructure)
      },
      category: product.catalog_category
    }
  };

  logger.debug('Товар найден', 'catalog/products/by-sku/[sku]/GET', {
    productName: product.name,
    hasCover: !!photoStructure.cover,
    galleryCount: photoStructure.gallery.length
  }, loggingContext);

  return apiSuccess(response);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sku: string }> }
): Promise<NextResponse> {
  return withErrorHandling(
    requireAuth((req, user) => getHandler(req, user, { params })),
    'catalog/products/by-sku/[sku]/GET'
  )(request);
}
