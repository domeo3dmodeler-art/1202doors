import { NextRequest, NextResponse } from 'next/server';
import { catalogImportService } from '@/lib/services/catalog-import.service';
import { logger } from '@/lib/logging/logger';

// POST /api/catalog/import - Импорт каталога из Excel
export async function POST(request: NextRequest) {
  let fileName: string | undefined;
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json(
        { error: 'Файл не предоставлен' },
        { status: 400 }
      );
    }

    // Проверяем тип файла
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json(
        { error: 'Поддерживаются только файлы Excel (.xlsx, .xls)' },
        { status: 400 }
      );
    }

    // Проверяем размер файла (максимум 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Размер файла не должен превышать 10MB' },
        { status: 400 }
      );
    }

    // Конвертируем файл в Buffer
    fileName = file.name;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Импортируем каталог
    const result = await catalogImportService.importFromExcel(buffer, file.name);

    return NextResponse.json(result);

  } catch (error) {
    logger.error('Error importing catalog', 'catalog/import', error instanceof Error ? { error: error.message, stack: error.stack, fileName: fileName ?? undefined } : { error: String(error), fileName: fileName ?? undefined });
    return NextResponse.json(
      { 
        error: 'Ошибка при импорте каталога',
        details: error instanceof Error ? error.message : 'Неизвестная ошибка'
      },
      { status: 500 }
    );
  }
}

// GET /api/catalog/import - Получить историю импортов
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'history') {
      const history = await catalogImportService.getImportHistory();
      return NextResponse.json(history);
    }

    return NextResponse.json(
      { error: 'Неверный параметр action' },
      { status: 400 }
    );

  } catch (error) {
    logger.error('Error getting history', 'catalog/import', error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) });
    return NextResponse.json(
      { error: 'Ошибка при получении истории' },
      { status: 500 }
    );
  }
}
