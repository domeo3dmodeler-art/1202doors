import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logging/logger';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const setting = await prisma.exportSetting.findUnique({
      where: { id: params.id }
    });

    if (!setting) {
      return NextResponse.json(
        { error: 'Export setting not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      setting: {
        ...setting,
        template_config: setting.display_config ? JSON.parse(setting.display_config) : {}
      }
    });

  } catch (error) {
    logger.error('Error fetching export setting', 'configurator/export-settings/[id]', error instanceof Error ? { error: error.message, stack: error.stack, id: params.id } : { error: String(error), id: params.id });
    return NextResponse.json(
      { error: 'Failed to fetch export setting' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const data = await request.json();
    
    const { document_type, template_config } = data;

    const setting = await prisma.exportSetting.update({
      where: { id: params.id },
      data: {
        ...(document_type && { export_type: document_type }),
        ...(template_config !== undefined && { display_config: JSON.stringify(template_config) })
      }
    });

    return NextResponse.json({
      success: true,
      setting: {
        ...setting,
        template_config: setting.display_config ? JSON.parse(setting.display_config) : {}
      }
    });

  } catch (error) {
    logger.error('Error updating export setting', 'configurator/export-settings/[id]', error instanceof Error ? { error: error.message, stack: error.stack, id: params.id } : { error: String(error), id: params.id });
    return NextResponse.json(
      { error: 'Failed to update export setting' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.exportSetting.delete({
      where: { id: params.id }
    });

    return NextResponse.json({
      success: true,
      message: 'Export setting deleted successfully'
    });

  } catch (error) {
    logger.error('Error deleting export setting', 'configurator/export-settings/[id]', error instanceof Error ? { error: error.message, stack: error.stack, id: params.id } : { error: String(error), id: params.id });
    return NextResponse.json(
      { error: 'Failed to delete export setting' },
      { status: 500 }
    );
  }
}