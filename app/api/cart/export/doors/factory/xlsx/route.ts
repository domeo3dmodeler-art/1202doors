import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { getItemDisplayNameForExport, normalizeItemForDisplay } from '@/lib/export/display-names';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { cart } = body;

    if (!cart || !cart.items || cart.items.length === 0) {
      return NextResponse.json(
        { error: 'Корзина пуста' },
        { status: 400 }
      );
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Заказ', { views: [{ state: 'frozen', ySplit: 1 }] });

    const headers = [
      'N',
      'Supplier',
      'Collection',
      'SupplierItemName',
      'SupplierColorFinish',
      'Width',
      'Height',
      'HardwareKit',
      'OptPrice',
      'RetailPrice',
      'Qty',
      'SumOpt',
      'SumRetail',
    ];
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };

    cart.items.forEach((item: any, index: number) => {
      const norm = normalizeItemForDisplay(item) as any;
      const itemName = getItemDisplayNameForExport(norm);
      const optPrice = Math.round((item.unitPrice || 0) * 0.65);
      const retailPrice = item.unitPrice || 0;
      const qty = item.qty ?? item.quantity ?? 1;
      const sumOpt = optPrice * qty;
      const sumRetail = retailPrice * qty;
      sheet.addRow([
        index + 1,
        'Supplier1',
        'Collection A',
        itemName,
        `${item.color ?? ''}/${item.finish ?? ''}`.replace(/^\/|\/$/g, ''),
        item.width ?? '',
        item.height ?? '',
        item.hardwareKitId ?? '',
        optPrice,
        retailPrice,
        qty,
        sumOpt.toFixed(2),
        sumRetail.toFixed(2),
      ]);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = `factory_order_${Date.now()}.xlsx`;

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Ошибка генерации XLSX заказа на фабрику' },
      { status: 500 }
    );
  }
}
