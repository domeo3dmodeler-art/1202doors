import { NextRequest, NextResponse } from "next/server";
import { getItemDisplayNameForExport, normalizeItemForDisplay } from "@/lib/export/display-names";

function csvEscape(val: string): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
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

    // Генерируем CSV для заказа на фабрику (единые названия в SupplierItemName)
    const header = [
      "N",
      "Supplier",
      "Collection",
      "SupplierItemName",
      "SupplierColorFinish",
      "Width",
      "Height",
      "HardwareKit",
      "OptPrice",
      "RetailPrice",
      "Qty",
      "SumOpt",
      "SumRetail"
    ];

    const lines = [header.join(",")];

    cart.items.forEach((item: any, index: number) => {
      const norm = normalizeItemForDisplay(item) as any;
      const itemName = getItemDisplayNameForExport(norm);
      const qty = item.qty ?? item.quantity ?? 1;
      const optPrice = Math.round((item.unitPrice || 0) * 0.65);
      const retailPrice = item.unitPrice || 0;
      const sumOpt = optPrice * qty;
      const sumRetail = retailPrice * qty;

      const line = [
        String(index + 1),
        "Supplier1",
        "Collection A",
        csvEscape(itemName),
        `${item.color || ""}/${item.finish || ""}`.replace(/^\/|\/$/g, ""),
        String(item.width ?? ""),
        String(item.height ?? ""),
        item.hardwareKitId || "",
        optPrice.toFixed(2),
        retailPrice.toFixed(2),
        String(qty),
        sumOpt.toFixed(2),
        sumRetail.toFixed(2)
      ].join(",");

      lines.push(line);
    });

    const csv = lines.join("\n");

    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="factory_order.csv"',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Ошибка генерации заказа на фабрику" },
      { status: 500 }
    );
  }
}
