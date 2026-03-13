// lib/pdf/quote-pdf.ts
// Сервис для экспорта КП в PDF формат

type Quote = {
  id: string;
  title?: string;
  status: 'draft' | 'sent' | 'accepted' | 'rejected';
  items: any[];
  total: number;
  currency: string;
  clientInfo?: any;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
};

export async function generateQuotePDF(quote: Quote): Promise<Buffer> {
  const html = generateQuoteHTML(quote);

  const { htmlToPdfBuffer } = await import('@/lib/pdf/htmlToPdf');
  const { runInPdfQueue } = await import('@/lib/export/pdf-export-queue');
  return await runInPdfQueue(() => htmlToPdfBuffer(html));
}

function generateQuoteHTML(quote: Quote): string {
  const formatCurrency = (amount: number, currency: string = 'RUB') => {
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency',
      currency: currency === 'RUB' ? 'RUB' : 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const statusLabels = {
    draft: 'Черновик',
    sent: 'Отправлен',
    accepted: 'Принят',
    rejected: 'Отклонен'
  };

  return `
    <!DOCTYPE html>
    <html lang="ru">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>КП ${quote.title}</title>
        <style>
            body {
                font-family: 'Arial', sans-serif;
                margin: 0;
                padding: 20px;
                color: #333;
                line-height: 1.6;
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
                border-bottom: 2px solid #2563eb;
                padding-bottom: 20px;
            }
            .header h1 {
                color: #2563eb;
                margin: 0;
                font-size: 28px;
            }
            .header .subtitle {
                color: #6b7280;
                margin: 5px 0 0 0;
                font-size: 16px;
            }
            .quote-info {
                display: flex;
                justify-content: space-between;
                margin-bottom: 30px;
                background: #f8fafc;
                padding: 20px;
                border-radius: 8px;
            }
            .quote-info .left, .quote-info .right {
                flex: 1;
            }
            .quote-info h3 {
                margin: 0 0 10px 0;
                color: #1f2937;
                font-size: 18px;
            }
            .quote-info p {
                margin: 5px 0;
                color: #6b7280;
            }
            .client-info {
                background: #f0f9ff;
                padding: 20px;
                border-radius: 8px;
                margin-bottom: 30px;
            }
            .client-info h3 {
                margin: 0 0 15px 0;
                color: #1e40af;
                font-size: 18px;
            }
            .client-info .grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 15px;
            }
            .client-info .field {
                margin-bottom: 10px;
            }
            .client-info .label {
                font-weight: bold;
                color: #374151;
                font-size: 14px;
            }
            .client-info .value {
                color: #6b7280;
                margin-top: 2px;
            }
            .items-table {
                width: 100%;
                border-collapse: collapse;
                margin-bottom: 30px;
                background: white;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
            }
            .items-table th {
                background: #2563eb;
                color: white;
                padding: 15px 10px;
                text-align: left;
                font-weight: bold;
                font-size: 14px;
            }
            .items-table td {
                padding: 12px 10px;
                border-bottom: 1px solid #e5e7eb;
                font-size: 14px;
            }
            .items-table tr:last-child td {
                border-bottom: none;
            }
            .items-table tr:nth-child(even) {
                background: #f9fafb;
            }
            .item-name {
                font-weight: bold;
                color: #1f2937;
            }
            .item-sku {
                color: #6b7280;
                font-size: 12px;
                margin-top: 2px;
            }
            .item-options {
                font-size: 12px;
                color: #6b7280;
            }
            .item-price, .item-total {
                text-align: right;
                font-weight: bold;
            }
            .total-section {
                background: #f0f9ff;
                padding: 20px;
                border-radius: 8px;
                text-align: right;
            }
            .total-section .total-amount {
                font-size: 24px;
                font-weight: bold;
                color: #1e40af;
                margin-bottom: 10px;
            }
            .total-section .total-label {
                color: #6b7280;
                font-size: 16px;
            }
            .notes {
                margin-top: 30px;
                padding: 20px;
                background: #fef3c7;
                border-radius: 8px;
                border-left: 4px solid #f59e0b;
            }
            .notes h3 {
                margin: 0 0 10px 0;
                color: #92400e;
                font-size: 16px;
            }
            .notes p {
                margin: 0;
                color: #78350f;
            }
            .footer {
                margin-top: 40px;
                text-align: center;
                color: #6b7280;
                font-size: 12px;
                border-top: 1px solid #e5e7eb;
                padding-top: 20px;
            }
            .status-badge {
                display: inline-block;
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: bold;
                text-transform: uppercase;
            }
            .status-draft { background: #f3f4f6; color: #374151; }
            .status-sent { background: #dbeafe; color: #1e40af; }
            .status-accepted { background: #d1fae5; color: #065f46; }
            .status-rejected { background: #fee2e2; color: #991b1b; }
        </style>
    </head>
    <body>
        <div class="header">
            <h1>Коммерческое предложение</h1>
            <div class="subtitle">${quote.title}</div>
        </div>

        <div class="quote-info">
            <div class="left">
                <h3>Информация о КП</h3>
                <p><strong>ID:</strong> ${quote.id}</p>
                <p><strong>Статус:</strong> <span class="status-badge status-${quote.status}">${statusLabels[quote.status]}</span></p>
                <p><strong>Дата создания:</strong> ${formatDate(quote.createdAt)}</p>
                ${quote.acceptedAt ? `<p><strong>Дата принятия:</strong> ${formatDate(quote.acceptedAt)}</p>` : ''}
            </div>
            <div class="right">
                <h3>Контактная информация</h3>
                ${quote.clientInfo?.company ? `<p><strong>Компания:</strong> ${quote.clientInfo.company}</p>` : ''}
                ${quote.clientInfo?.contact ? `<p><strong>Контактное лицо:</strong> ${quote.clientInfo.contact}</p>` : ''}
                ${quote.clientInfo?.email ? `<p><strong>Email:</strong> ${quote.clientInfo.email}</p>` : ''}
                ${quote.clientInfo?.phone ? `<p><strong>Телефон:</strong> ${quote.clientInfo.phone}</p>` : ''}
                ${quote.clientInfo?.address ? `<p><strong>Адрес:</strong> ${quote.clientInfo.address}</p>` : ''}
            </div>
        </div>

        <table class="items-table">
            <thead>
                <tr>
                    <th>Товар</th>
                    <th>Размер</th>
                    <th>Опции</th>
                    <th>Кол-во</th>
                    <th>Цена за ед.</th>
                    <th>Сумма</th>
                </tr>
            </thead>
            <tbody>
                ${quote.items.map((item: any) => `
                    <tr>
                        <td>
                            <div class="item-name">${item.model}</div>
                            <div class="item-sku">${item.sku}</div>
                        </td>
                        <td>${item.width}×${item.height}мм</td>
                        <td>
                            <div class="item-options">
                                ${item.hardware_kit ? `<div>Комплект: ${item.hardware_kit.name}</div>` : ''}
                                ${item.handle ? `<div>Ручка: ${item.handle.name}</div>` : ''}
                            </div>
                        </td>
                        <td>${item.qty}</td>
                        <td class="item-price">${formatCurrency(item.rrc_price, item.currency)}</td>
                        <td class="item-total">${formatCurrency(item.rrc_price * item.qty, item.currency)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>

        <div class="total-section">
            <div class="total-label">Итого:</div>
            <div class="total-amount">${formatCurrency(quote.total, quote.currency)}</div>
        </div>

        ${quote.notes ? `
            <div class="notes">
                <h3>Примечания</h3>
                <p>${quote.notes}</p>
            </div>
        ` : ''}

        <div class="footer">
            <p>Данное коммерческое предложение сгенерировано автоматически</p>
            <p>Дата генерации: ${new Date().toLocaleDateString('ru-RU')}</p>
        </div>
    </body>
    </html>
  `;
}

export function getQuotePDFFilename(quote: Quote): string {
  const date = new Date().toISOString().slice(0, 10);
  const safeTitle = (quote.title || 'quote').replace(/[^a-zA-Z0-9а-яА-Я\s]/g, '').replace(/\s+/g, '_');
  return `quote_${quote.id}_${safeTitle}_${date}.pdf`;
}
