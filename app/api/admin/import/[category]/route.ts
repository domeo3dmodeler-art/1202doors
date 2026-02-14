export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';
import { parseAnyTable } from '@/lib/import/parse';
import { autoMap } from '@/lib/import/automap';
import { doorsAdapter } from '@/lib/import/adapters/doors';

type Field =
  | { dest: string; required?: boolean; type: 'string' | 'number' | 'date' | 'boolean' }
  | { dest: string; required?: boolean; type: 'enum'; enumValues: string[] };

function isBlank(v: any) { return v==null || (typeof v==='string' && v.trim()===''); }
function coerceType(v: any, t: Field['type']) {
  if (v == null) return v;
  switch (t) {
    case 'string': return String(v);
    case 'number': return typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    case 'date':   return v instanceof Date ? v : new Date(v);
    case 'boolean': return typeof v === 'boolean' ? v : /^(1|true|yes)$/i.test(String(v));
    case 'enum':   return v;
  }
}
function validateLocal(rows: any[], schema: Field[]) {
  const ok: any[] = []; const errors: { index: number; sku?: string; reason: string }[] = [];
  for (let i=0;i<rows.length;i++) {
    const r = { ...rows[i] }; let bad = false;
    for (const f of schema) {
      const key = (f as any).dest; const t = (f as any).type; const v = r[key];
      if ((f.required ?? false) && isBlank(v)) { errors.push({ index: i, sku: r.sku, reason: `Поле ${key} обязательно` }); bad = true; continue; }
      if (!isBlank(v)) {
        if (t === 'enum') {
          const allowed = (f as any).enumValues as string[];
          if (!allowed.includes(String(v).toUpperCase())) { errors.push({ index: i, sku: r.sku, reason: `Поле ${key} не входит в ${allowed.join(',')}` }); bad = true; continue; }
          r[key] = String(v).toUpperCase();
        } else {
          r[key] = coerceType(v, t);
          if (t === 'number' && Number.isNaN(r[key])) { errors.push({ index: i, sku: r.sku, reason: `Поле ${key} должно быть числом` }); bad = true; }
          if (t === 'date' && isNaN((r[key] as Date).getTime())) { errors.push({ index: i, sku: r.sku, reason: `Поле ${key} должно быть датой` }); bad = true; }
        }
      }
    }
    if (!bad) ok.push(r);
  }
  return { ok, errors };
}
function dedupeBy<T>(arr: T[], keyFn: (x:T)=>string) {
  const seen = new Set<string>(); const out: T[] = [];
  for (const it of arr) { const k = keyFn(it); if (!seen.has(k)) { seen.add(k); out.push(it); } }
  return out;
}

export async function POST(req: Request, { params }: { params: { category: string } }) {
  logger.debug('[CATEGORY] ROUTE CALLED', 'admin/import/[category]', { category: params.category, requestUrl: req.url });
  
  const form = await req.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'Нет файла' }, { status: 400 });

  const mode = (form.get('mode') as string) || 'preview';
  const defaults = {
    currency: (form.get('currency') as string) || 'RUB',
    valid_from: (form.get('valid_from') as string) || new Date().toISOString().slice(0,10),
  };

  const code = params.category.toLowerCase();
  const isDoors = code === 'doors';
  const cat = !isDoors ? await (prisma as unknown as { category: { findFirst: (args: { where: { code: string }; include: { attributes: true } }) => Promise<{ id: string; code: string; attributes: Array<{ key: string; type: string; required: boolean; enumValues?: unknown[] }> } | null> } }).category.findFirst({ where: { code }, include: { attributes: true } }) : null;
  if (!isDoors && !cat) return NextResponse.json({ error: 'Неизвестная категория' }, { status: 400 });

  const raw = await parseAnyTable(file);

  const schema: Field[] = isDoors ? (doorsAdapter.getSchema() as any) : ([
    { dest: 'sku', type: 'string', required: true },
    { dest: 'series', type: 'string', required: false },
    { dest: 'base_price', type: 'number', required: true },
    { dest: 'currency', type: 'enum', required: true, enumValues: ['RUB','EUR'] },
    { dest: 'valid_from', type: 'date', required: false },
    ...(cat!.attributes.map((a: { key: string; type: string; required: boolean; enumValues?: unknown[] }) => ({ dest: a.key, type: a.type as 'string' | 'number' | 'date' | 'enum', required: a.required, enumValues: a.enumValues })))
  ] as any);

  const mapped = raw.map(r => autoMap(r, schema as any, defaults));
  if (isDoors) {
    for (let i=0;i<mapped.length;i++) mapped[i] = { ...mapped[i], ...doorsAdapter.buildKeys(raw[i], mapped[i]) };
  } else {
    for (let i=0;i<mapped.length;i++) {
      if (!mapped[i].sku || !String(mapped[i].sku).trim()) {
        const parts = [mapped[i].series, mapped[i].width_mm, mapped[i].height_mm].filter(Boolean);
        if (parts.length) mapped[i].sku = parts.join('-').toLowerCase().replace(/\s+/g,'-');
      }
    }
  }

  const total = mapped.length;
  const { ok, errors } = validateLocal(mapped, schema);
  const unique = dedupeBy(ok, (r: any) => String(r.sku).toLowerCase());

  if (mode !== 'publish') {
    return NextResponse.json({ total, accepted: unique.length, rejected: total - unique.length, sample: unique.slice(0,5), errors: errors.slice(0,50), schema });
  }

  if (isDoors) {
    const imported = await doorsAdapter.upsertMany(unique as any[]);
    return NextResponse.json({ total, imported, rejected: total - imported });
  }

  const imported = await prisma.$transaction(async (tx) => {
    let c = 0; const catId = cat!.id;
    for (const r of unique as any[]) {
      const upper = {
        sku: String(r.sku), series: r.series ?? null,
        base_price: Number(r.base_price), currency: String(r.currency).toUpperCase(),
        valid_from: new Date(r.valid_from || defaults.valid_from),
      };
      const reserved = new Set(['sku','series','base_price','currency','valid_from']);
      const data: Record<string, any> = {};
      Object.keys(r).forEach(k => { if (!reserved.has(k)) data[k] = (r as any)[k]; });

      const productPayload = {
        catalog_category_id: catId,
        sku: upper.sku,
        name: String(upper.series || upper.sku),
        base_price: upper.base_price,
        currency: upper.currency,
        series: upper.series,
        properties_data: JSON.stringify({ ...data, valid_from: upper.valid_from })
      };
      const existing = await tx.product.findFirst({ where: { catalog_category_id: catId, sku: upper.sku }, select: { id: true }});
      if (existing) await tx.product.update({ where: { id: existing.id }, data: productPayload });
      else await tx.product.create({ data: productPayload });
      c++;
    }
    return c;
  });

  return NextResponse.json({ total, imported, rejected: total - imported });
}
