import { NextRequest, NextResponse } from 'next/server';
import { prisma, Prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';

interface DocumentWithCartData {
  id: string;
  number?: string | null;
  cart_data?: string | null;
  client_id?: string | null;
  parent_document_id?: string | null;
}

interface CartData {
  items?: unknown[];
  total?: number;
  [key: string]: unknown;
}

// GET /api/documents/[id]/cart-data - Получить данные корзины из документа
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let id: string | undefined;
  let documentType: string | null = null;
  try {
    const resolved = await params;
    id = resolved.id;
    const { searchParams } = new URL(request.url);
    documentType = searchParams.get('type'); // 'quote', 'invoice', 'order', 'supplier_order'

    if (!documentType) {
      return NextResponse.json({ error: 'Document type is required' }, { status: 400 });
    }

    logger.debug('Fetching cart data for document', 'documents/[id]/cart-data', { id, documentType });

    let document: DocumentWithCartData | null = null;
    let cartData: CartData | null = null;

    switch (documentType) {
      case 'quote':
        document = await prisma.quote.findUnique({
          where: { id },
          select: { id: true, number: true, cart_data: true, client_id: true }
        });
        break;
      
      case 'invoice':
        document = await prisma.invoice.findUnique({
          where: { id },
          select: { id: true, number: true, cart_data: true, client_id: true }
        });
        break;
      
      case 'order':
        document = await prisma.order.findUnique({
          where: { id },
          select: { id: true, number: true, cart_data: true, client_id: true }
        });
        break;
      
      case 'supplier_order':
        document = await prisma.supplierOrder.findUnique({
          where: { id },
          select: { id: true, cart_data: true, parent_document_id: true }
        });
        break;
      
      default:
        return NextResponse.json({ error: 'Invalid document type' }, { status: 400 });
    }

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Парсим JSON данные корзины
    if (document.cart_data) {
      try {
        cartData = JSON.parse(document.cart_data);
      } catch (error) {
        logger.error('Error parsing cart_data', 'documents/[id]/cart-data', { id, documentType, error: error instanceof Error ? error.message : String(error) });
        return NextResponse.json({ error: 'Invalid cart data format' }, { status: 400 });
      }
    }

    logger.debug('Cart data retrieved', 'documents/[id]/cart-data', { documentId: id, hasCartData: !!cartData, documentType });

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        number: document.number || `DOC-${document.id.slice(-6)}`,
        type: documentType,
        clientId: document.client_id || document.parent_document_id,
        cartData: cartData
      }
    });

  } catch (error: unknown) {
    logger.error('Error fetching cart data', 'documents/[id]/cart-data', error instanceof Error ? { error: error.message, stack: error.stack, id: id ?? undefined } : { error: String(error), id: id ?? undefined });
    return NextResponse.json(
      { error: 'Failed to fetch cart data' },
      { status: 500 }
    );
  }
}

// POST /api/documents/[id]/cart-data - Сохранить данные корзины в документ
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let id: string | undefined;
  let documentType: string | undefined;
  try {
    const resolved = await params;
    id = resolved.id;
    const body = await request.json();
    documentType = body.documentType;
    const { cartData } = body;

    if (!documentType || !cartData) {
      return NextResponse.json({ error: 'Document type and cart data are required' }, { status: 400 });
    }

    logger.debug('Saving cart data for document', 'documents/[id]/cart-data', { id, documentType });

    const cartDataString = JSON.stringify(cartData);

    switch (documentType) {
      case 'quote':
        await prisma.quote.update({
          where: { id },
          data: { cart_data: cartDataString }
        });
        break;
      
      case 'invoice':
        await prisma.invoice.update({
          where: { id },
          data: { cart_data: cartDataString }
        });
        break;
      
      case 'order':
        await prisma.order.update({
          where: { id },
          data: { cart_data: cartDataString }
        });
        break;
      
      case 'supplier_order':
        await prisma.supplierOrder.update({
          where: { id },
          data: { cart_data: cartDataString }
        });
        break;
      
      default:
        return NextResponse.json({ error: 'Invalid document type' }, { status: 400 });
    }

    logger.debug('Cart data saved successfully', 'documents/[id]/cart-data', { id, documentType });

    return NextResponse.json({
      success: true,
      message: 'Cart data saved successfully'
    });

  } catch (error: unknown) {
    logger.error('Error saving cart data', 'documents/[id]/cart-data', error instanceof Error ? { error: error.message, stack: error.stack, id: id ?? undefined, documentType: documentType ?? undefined } : { error: String(error), id: id ?? undefined, documentType: documentType ?? undefined });
    return NextResponse.json(
      { error: 'Failed to save cart data' },
      { status: 500 }
    );
  }
}
