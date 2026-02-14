export const runtime = 'nodejs';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// TODO: модель categoryAttribute отсутствует в Prisma schema; используется CategoryPropertyAssignment
type PrismaWithCategoryAttribute = typeof prisma & {
  categoryAttribute: { findMany: (args: { where: { categoryId: string } }) => Promise<unknown[]>; create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
};
const db = prisma as PrismaWithCategoryAttribute;

export async function GET(_req: Request, { params }: { params: { id: string }}) {
  const attrs = await db.categoryAttribute.findMany({ where: { categoryId: params.id } });
  return NextResponse.json(attrs);
}
export async function POST(req: Request, { params }: { params: { id: string }}) {
  const b = await req.json();
  const created = await db.categoryAttribute.create({
    data: {
      categoryId: params.id, key: b.key, label: b.label, type: b.type,
      required: !!b.required, enumValues: b.enumValues ?? [],
      minNumber: b.minNumber ?? null, maxNumber: b.maxNumber ?? null,
      regex: b.regex ?? null, unit: b.unit ?? null, order: b.order ?? 0,
    }
  });
  return NextResponse.json(created);
}
