import { NextRequest, NextResponse } from "next/server";
import { getItemDisplayNameForExport, normalizeItemForDisplay } from "@/lib/export/display-names";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cart } = body;

    if (!cart || !cart.items || cart.items.length === 0) {
      return NextResponse.json(
        { error: "Корзина пуста" },
        { status: 400 }
      );
    }

    // Генерируем HTML для счета (единые названия: дверь, ручка, завертка, ограничитель)
    const rows = cart.items.map((item: any, index: number) => {
      const norm = normalizeItemForDisplay(item) as any;
      const name = getItemDisplayNameForExport(norm);
      const qty = item.qty ?? item.quantity ?? 1;
      const sum = (item.unitPrice || 0) * qty;
      return `
        <tr>
          <td class="num">${index + 1}</td>
          <td>${escapeHtml(String(item.sku_1c || "—"))}</td>
          <td>${escapeHtml(name)}</td>
          <td class="num">${Math.round(item.unitPrice || 0).toLocaleString()}</td>
          <td class="num">${qty}</td>
          <td class="num">${Math.round(sum).toLocaleString()}</td>
        </tr>
      `;
    }).join("");

    const total = cart.items.reduce((sum: number, item: any) => sum + (item.unitPrice || 0) * (item.qty ?? item.quantity ?? 1), 0);

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    body { font-family: ui-sans-serif, system-ui; margin: 20px; }
    .row { display: flex; justify-content: space-between; margin-bottom: 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ddd; padding: 8px; }
    th { background: #f6f6f6; text-align: left; }
    td.num { text-align: right; }
    .total { font-weight: bold; font-size: 1.2em; margin-top: 20px; }
  </style>
</head>
<body>
  <h1>Счет на оплату</h1>
  <div class="row">
    <div>Покупатель: —</div>
    <div>ИНН: —</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>№</th>
        <th>Артикул</th>
        <th>Наименование</th>
        <th>Цена, руб</th>
        <th>Кол-во</th>
        <th>Сумма, руб</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  <div class="total">Итого: ${Math.round(total).toLocaleString()} ₽</div>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Ошибка генерации счета" },
      { status: 500 }
    );
  }
}
