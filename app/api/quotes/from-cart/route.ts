// api/quotes/from-cart/route.ts
// API роут для создания КП из корзины

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { applyPricing } from '@/lib/doors/pricing';
import { logger } from '@/lib/logging/logger';
import { getLoggingContextFromRequest } from '@/lib/auth/logging-context';
import { apiSuccess, apiError, ApiErrorCode, withErrorHandling } from '@/lib/api/response';
import { requireAuth } from '@/lib/auth/middleware';
import { getAuthenticatedUser } from '@/lib/auth/request-helpers';

type CartItem = {
  sku: string;
  model: string;
  width?: number;
  height?: number;
  color?: string;
  finish?: string;
  series?: string;
  material?: string;
  rrc_price: number;
  qty: number;
  hardware_kit?: {
    name: string;
    price_rrc: number;
    group?: string;
  };
  handle?: {
    name: string;
    price_opt: number;
    price_group_multiplier: number;
  };
  price_opt?: number;
  currency?: string;
};

type CartToQuoteRequest = {
  cart: {
    items: CartItem[];
  };
  quoteData: {
    title?: string;
    clientInfo?: {
      company?: string;
      contact?: string;
      email?: string;
      phone?: string;
      address?: string;
    };
    notes?: string;
  };
};

// POST /api/quotes/from-cart - Создать КП из корзины
// ⚠️ DEPRECATED: Используйте POST /api/documents/create с parent_document_id = orderId
// Этот endpoint создает Quote напрямую без Order, что не соответствует текущей логике Order-first
// Для правильной работы создайте Order через POST /api/orders, затем Quote через POST /api/documents/create
async function postHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const body: CartToQuoteRequest = await req.json();
  
  // Валидация входных данных
  if (!body.cart || !Array.isArray(body.cart.items) || body.cart.items.length === 0) {
    return apiError(
      ApiErrorCode.VALIDATION_ERROR,
      'Корзина должна содержать хотя бы одну позицию',
      400
    );
  }

  // Получаем данные дверей из каталога для валидации и дополнения
  const cartItems = body.cart.items;
  const skus = cartItems.map(item => item.sku);
  
  const catalogItems = await prisma.doors_catalog.findMany({
    where: { sku: { in: skus } },
    select: {
      sku: true,
      series: true,
      model: true,
      finish: true,
      color: true,
      widthMm: true,
      heightMm: true,
      base_price: true,
      price_opt: true,
      currency: true
    }
  });

  // Создаем мапу для быстрого поиска
  const catalogMap = new Map(catalogItems.map(item => [item.sku, item]));

  // Обрабатываем позиции корзины
  const processedItems = cartItems.map(cartItem => {
    const catalogItem = catalogMap.get(cartItem.sku);
    
    // Используем данные из каталога, если они есть, иначе из корзины
    return {
      sku: cartItem.sku,
      model: catalogItem?.model || cartItem.model,
      width: catalogItem?.widthMm || cartItem.width,
      height: catalogItem?.heightMm || cartItem.height,
      color: catalogItem?.color || cartItem.color,
      finish: catalogItem?.finish || cartItem.finish,
      series: catalogItem?.series || cartItem.series,
      material: cartItem.material,
      rrc_price: catalogItem?.base_price || cartItem.rrc_price,
      qty: cartItem.qty,
      hardware_kit: cartItem.hardware_kit,
      handle: cartItem.handle,
      price_opt: catalogItem?.price_opt || cartItem.price_opt,
      currency: catalogItem?.currency || cartItem.currency || 'RUB'
    };
  });

  // Применяем ценообразование для расчета итоговой суммы
  const pricedItems = applyPricing(processedItems);
  const total = pricedItems.reduce((sum, item) => sum + item.sum_rrc, 0);

  // Создаем КП
  const quote = await prisma.quote.create({
    data: {
      number: `KP-${Date.now()}`,
      title: body.quoteData?.title || `КП от ${new Date().toLocaleDateString()}`,
      status: 'DRAFT',
      items: processedItems,
      total_amount: total,
      currency: processedItems[0]?.currency || 'RUB',
      clientInfo: body.quoteData?.clientInfo || undefined,
      notes: body.quoteData?.notes || undefined,
      created_by: user.userId || 'system'
    },
    select: {
      id: true,
      number: true,
      title: true,
      status: true,
      items: true,
      total_amount: true,
      currency: true,
      clientInfo: true,
      notes: true,
      created_at: true
    }
  });

  return apiSuccess({
    quote: {
      ...quote,
      total: Number(quote.total_amount),
      items: JSON.parse(JSON.stringify(quote.items)),
      clientInfo: quote.clientInfo ? JSON.parse(JSON.stringify(quote.clientInfo)) : null
    },
    pricing: {
      itemsCount: processedItems.length,
      totalAmount: total,
      currency: processedItems[0]?.currency || 'RUB'
    }
  }, 'КП успешно создан из корзины', 201);
}

export const POST = withErrorHandling(
  requireAuth(postHandler),
  'quotes/from-cart/POST'
);

// GET /api/quotes/from-cart - Получить информацию о возможности создания КП
async function getHandler(
  req: NextRequest,
  user: AuthenticatedUser
): Promise<NextResponse> {
  const loggingContext = getLoggingContextFromRequest(req);
  const { searchParams } = new URL(req.url);
  const cartData = searchParams.get('cart');
  
  if (!cartData) {
    return apiSuccess({
      canCreateQuote: false,
      message: 'Необходимо передать данные корзины'
    });
  }

  let cart;
  try {
    cart = JSON.parse(cartData);
  } catch (e) {
    return apiSuccess({
      canCreateQuote: false,
      message: 'Некорректные данные корзины'
    });
  }

  if (!cart.items || !Array.isArray(cart.items) || cart.items.length === 0) {
    return apiSuccess({
      canCreateQuote: false,
      message: 'Корзина пуста'
    });
  }

  // Проверяем доступность товаров в каталоге
  const skus = cart.items.map((item: any) => item.sku);
  const catalogItems = await prisma.doors_catalog.findMany({
    where: { sku: { in: skus } },
    select: { sku: true, base_price: true, currency: true }
  });

  const availableSkus = new Set(catalogItems.map(item => item.sku));
  const missingItems = cart.items.filter((item: any) => !availableSkus.has(item.sku));

  return apiSuccess({
    canCreateQuote: true,
    cartInfo: {
      itemsCount: cart.items.length,
      availableItems: cart.items.length - missingItems.length,
      missingItems: missingItems.map((item: any) => item.sku),
      estimatedTotal: cart.items.reduce((sum: number, item: any) => sum + (item.rrc_price * item.qty), 0)
    },
    message: missingItems.length > 0 
      ? `Некоторые товары (${missingItems.length}) не найдены в каталоге`
      : 'Все товары доступны для создания КП'
  });
}

export const GET = withErrorHandling(
  requireAuth(getHandler),
  'quotes/from-cart/GET'
);
