export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getDoorsCategoryId } from '@/lib/catalog-categories';

export async function GET(req: Request) {
  const doorsCategoryId = await getDoorsCategoryId();
  if (!doorsCategoryId) {
    return NextResponse.json({ page: 1, pageSize: 20, total: 0, items: [] });
  }
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '20');
  const q = (searchParams.get('q') ?? '').trim();

  const where = {
    catalog_category_id: doorsCategoryId,
    ...(q ? { OR: [{ sku: { contains: q } }, { series: { contains: q } }] } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { id: 'desc' },
    }),
    prisma.product.count({ where }),
  ]);

  return NextResponse.json({ page, pageSize, total, items });
}
