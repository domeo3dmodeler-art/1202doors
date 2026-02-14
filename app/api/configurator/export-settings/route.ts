import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';

export async function GET(request: NextRequest) {
  let configuratorCategoryId: string | null = null;
  try {
    const { searchParams } = new URL(request.url);
    configuratorCategoryId = searchParams.get('configuratorCategoryId');

    if (!configuratorCategoryId) {
      return NextResponse.json(
        { error: 'configuratorCategoryId is required' },
        { status: 400 }
      );
    }

    const settings = await prisma.exportSetting.findMany({
      where: { catalog_category_id: configuratorCategoryId },
      orderBy: { created_at: 'desc' }
    });

    return NextResponse.json({
      success: true,
      settings
    });

  } catch (error) {
    logger.error('Error fetching export settings', 'configurator/export-settings', error instanceof Error ? { error: error.message, stack: error.stack, configuratorCategoryId: configuratorCategoryId ?? undefined } : { error: String(error), configuratorCategoryId: configuratorCategoryId ?? undefined });
    return NextResponse.json(
      { error: 'Failed to fetch export settings' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  let configurator_category_id: string | undefined;
  try {
    const data = await request.json();
    
    const {
      configurator_category_id: catId,
      document_type,
      template_config
    } = data;
    configurator_category_id = catId;

    if (!catId || !document_type) {
      return NextResponse.json(
        { error: 'Missing required fields: configurator_category_id (catalog_category_id), document_type' },
        { status: 400 }
      );
    }

    const setting = await prisma.exportSetting.create({
      data: {
        catalog_category_id: catId,
        export_type: document_type,
        fields_config: '[]',
        display_config: JSON.stringify(template_config || {})
      }
    });

    return NextResponse.json({
      success: true,
      setting
    });

  } catch (error) {
    logger.error('Error creating export setting', 'configurator/export-settings', error instanceof Error ? { error: error.message, stack: error.stack, configurator_category_id: configurator_category_id ?? undefined } : { error: String(error), configurator_category_id: configurator_category_id ?? undefined });
    return NextResponse.json(
      { error: 'Failed to create export setting' },
      { status: 500 }
    );
  }
}