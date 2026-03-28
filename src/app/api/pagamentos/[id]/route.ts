import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Atualizar pagamento
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { status, dataPagamento, formaPagamento, observacoes } = body;

    const data: Record<string, unknown> = {};

    if (status) data.status = status;
    if (dataPagamento) data.dataPagamento = new Date(dataPagamento);
    if (formaPagamento) data.formaPagamento = formaPagamento;
    if (observacoes !== undefined) data.observacoes = observacoes;

    const pagamento = await db.pagamento.update({
      where: { id },
      data,
      include: {
        cliente: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
    });

    return NextResponse.json(pagamento);
  } catch (error) {
    console.error('Erro ao atualizar pagamento:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar pagamento' },
      { status: 500 }
    );
  }
}
