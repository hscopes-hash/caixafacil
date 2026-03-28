import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET - Relatório de extrato por período
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const empresaId = searchParams.get('empresaId');
    const clienteId = searchParams.get('clienteId');
    const dataInicio = searchParams.get('dataInicio');
    const dataFim = searchParams.get('dataFim');

    if (!empresaId) {
      return NextResponse.json(
        { error: 'empresaId é obrigatório' },
        { status: 400 }
      );
    }

    if (!dataInicio || !dataFim) {
      return NextResponse.json(
        { error: 'dataInicio e dataFim são obrigatórios' },
        { status: 400 }
      );
    }

    // Construir filtro
    const where: Record<string, unknown> = {
      cliente: {
        empresaId,
      },
      dataLeitura: {
        gte: new Date(dataInicio + 'T00:00:00.000Z'),
        lte: new Date(dataFim + 'T23:59:59.999Z'),
      },
    };

    // Se clienteId for especificado (não for 'todos')
    if (clienteId && clienteId !== 'todos') {
      where.clienteId = clienteId;
    }

    // Buscar leituras com informações relacionadas
    const leituras = await db.leitura.findMany({
      where,
      include: {
        cliente: {
          select: {
            id: true,
            nome: true,
          },
        },
        maquina: {
          select: {
            id: true,
            codigo: true,
            tipo: {
              select: {
                id: true,
                descricao: true,
              },
            },
          },
        },
        usuario: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
      orderBy: {
        dataLeitura: 'desc',
      },
    });

    return NextResponse.json(leituras);
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    return NextResponse.json(
      { error: 'Erro ao gerar relatório' },
      { status: 500 }
    );
  }
}
