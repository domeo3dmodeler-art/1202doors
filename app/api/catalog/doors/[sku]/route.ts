export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDoorsCategoryId } from '@/lib/catalog-categories';

export async function GET(_req: Request, { params }: { params: { sku: string }}) {
  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) return NextResponse.json({ error: 'Doors category not found' }, { status: 404 });
  const row = await prisma.product.findFirst({
    where: { catalog_category_id: doorsCategoryId, sku: params.sku },
  });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(row);
}
