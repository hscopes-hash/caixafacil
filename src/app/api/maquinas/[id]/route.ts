import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Buscar máquina por ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const maquina = await db.maquina.findUnique({
      where: { id },
      include: {
        cliente: true,
        tipo: true,
        faturamentos: {
          orderBy: { dataReferencia: 'desc' },
          take: 12,
        },
      },
    });

    if (!maquina) {
      return NextResponse.json(
        { error: 'Máquina não encontrada' },
        { status: 404 }
      );
    }

    return NextResponse.json(maquina);
  } catch (error) {
    console.error('Erro ao buscar máquina:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar máquina' },
      { status: 500 }
    );
  }
}

// Atualizar máquina
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const maquina = await db.maquina.update({
      where: { id },
      data: body,
      include: {
        cliente: {
          select: {
            id: true,
            nome: true,
          },
        },
        tipo: true,
      },
    });

    return NextResponse.json(maquina);
  } catch (error) {
    console.error('Erro ao atualizar máquina:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar máquina' },
      { status: 500 }
    );
  }
}

// Excluir máquina
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.maquina.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Máquina excluída com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir máquina:', error);
    return NextResponse.json(
      { error: 'Erro ao excluir máquina' },
      { status: 500 }
    );
  }
}
