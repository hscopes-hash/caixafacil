import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Listar pagamentos
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const empresaId = searchParams.get('empresaId');
    const clienteId = searchParams.get('clienteId');
    const status = searchParams.get('status');

    if (!empresaId) {
      return NextResponse.json(
        { error: 'ID da empresa é obrigatório' },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = {};

    if (clienteId) {
      where.clienteId = clienteId;
    } else {
      where.cliente = { empresaId };
    }

    if (status) where.status = status;

    const pagamentos = await db.pagamento.findMany({
      where,
      include: {
        cliente: {
          select: {
            id: true,
            nome: true,
          },
        },
        assinatura: {
          select: {
            id: true,
            plano: true,
          },
        },
      },
      orderBy: { dataVencimento: 'desc' },
    });

    return NextResponse.json(pagamentos);
  } catch (error) {
    console.error('Erro ao listar pagamentos:', error);
    return NextResponse.json(
      { error: 'Erro ao listar pagamentos' },
      { status: 500 }
    );
  }
}

// Criar novo pagamento
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      valor,
      dataVencimento,
      dataPagamento,
      status,
      formaPagamento,
      observacoes,
      clienteId,
      assinaturaId,
    } = body;

    if (!valor || !dataVencimento || !clienteId) {
      return NextResponse.json(
        { error: 'Valor, data de vencimento e cliente são obrigatórios' },
        { status: 400 }
      );
    }

    const pagamento = await db.pagamento.create({
      data: {
        valor,
        dataVencimento: new Date(dataVencimento),
        dataPagamento: dataPagamento ? new Date(dataPagamento) : undefined,
        status: status || 'PENDENTE',
        formaPagamento,
        observacoes,
        clienteId,
        assinaturaId,
      },
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
    console.error('Erro ao criar pagamento:', error);
    return NextResponse.json(
      { error: 'Erro ao criar pagamento' },
      { status: 500 }
    );
  }
}
