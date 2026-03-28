import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Listar leituras
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clienteId = searchParams.get('clienteId');
    const maquinaId = searchParams.get('maquinaId');
    const dataInicio = searchParams.get('dataInicio');
    const dataFim = searchParams.get('dataFim');

    const where: Record<string, unknown> = {};

    if (clienteId) {
      where.clienteId = clienteId;
    }

    if (maquinaId) {
      where.maquinaId = maquinaId;
    }

    if (dataInicio || dataFim) {
      where.dataLeitura = {};
      if (dataInicio) {
        where.dataLeitura = { ...where.dataLeitura, gte: new Date(dataInicio) };
      }
      if (dataFim) {
        where.dataLeitura = { ...where.dataLeitura, lte: new Date(dataFim) };
      }
    }

    const leituras = await db.leitura.findMany({
      where,
      include: {
        maquina: {
          select: {
            id: true,
            codigo: true,
            descricao: true,
            moeda: true,
            tipo: {
              select: {
                id: true,
                descricao: true,
              },
            },
          },
        },
        cliente: {
          select: {
            id: true,
            nome: true,
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
    console.error('Erro ao listar leituras:', error);
    return NextResponse.json(
      { error: 'Erro ao listar leituras' },
      { status: 500 }
    );
  }
}

// Criar nova leitura (batch - múltiplas máquinas)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leituras, clienteId, usuarioId, despesa, valorDespesa } = body;

    // Verificar se há leituras ou despesa
    const temLeituras = leituras && Array.isArray(leituras) && leituras.length > 0;
    const temDespesa = valorDespesa && valorDespesa > 0;

    if (!temLeituras && !temDespesa) {
      return NextResponse.json(
        { error: 'Nenhuma leitura ou despesa fornecida' },
        { status: 400 }
      );
    }

    if (!clienteId || !usuarioId) {
      return NextResponse.json(
        { error: 'clienteId e usuarioId são obrigatórios' },
        { status: 400 }
      );
    }

    const leiturasCriadas = [];

    // Usar transação para garantir consistência
    await db.$transaction(async (tx) => {
      // Salvar leituras se houver
      if (temLeituras) {
        for (const leitura of leituras) {
          const {
            maquinaId,
            entradaAnterior,
            entradaNova,
            saidaAnterior,
            saidaNova,
            diferencaEntrada,
            diferencaSaida,
            saldo,
            moeda,
            observacoes,
          } = leitura;

          // Criar registro de leitura
          const novaLeitura = await tx.leitura.create({
            data: {
              maquinaId,
              clienteId,
              usuarioId,
              entradaAnterior: entradaAnterior || 0,
              entradaNova: entradaNova || 0,
              saidaAnterior: saidaAnterior || 0,
              saidaNova: saidaNova || 0,
              diferencaEntrada: diferencaEntrada || 0,
              diferencaSaida: diferencaSaida || 0,
              saldo: saldo || 0,
              moeda: moeda || 'M001',
              observacoes,
              // Campos de despesa
              despesa: despesa || null,
              valorDespesa: valorDespesa || null,
            },
          });

          // Atualizar máquina com os novos valores
          await tx.maquina.update({
            where: { id: maquinaId },
            data: {
              entradaAtual: entradaNova || 0,
              saidaAtual: saidaNova || 0,
            },
          });

          leiturasCriadas.push(novaLeitura);
        }
      } else if (temDespesa) {
        // Se não há leituras mas há despesa, criar um registro de despesa
        // Buscar a primeira máquina do cliente para associar a despesa
        const primeiraMaquina = await tx.maquina.findFirst({
          where: { clienteId },
        });

        if (primeiraMaquina) {
          const novaLeitura = await tx.leitura.create({
            data: {
              maquinaId: primeiraMaquina.id,
              clienteId,
              usuarioId,
              entradaAnterior: 0,
              entradaNova: 0,
              saidaAnterior: 0,
              saidaNova: 0,
              diferencaEntrada: 0,
              diferencaSaida: 0,
              saldo: 0,
              moeda: 'M001',
              despesa: despesa || null,
              valorDespesa: valorDespesa || null,
            },
          });
          leiturasCriadas.push(novaLeitura);
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: `${leiturasCriadas.length} leitura(s) salva(s) com sucesso`,
      leituras: leiturasCriadas,
    });
  } catch (error) {
    console.error('Erro ao salvar leituras:', error);
    return NextResponse.json(
      { error: 'Erro ao salvar leituras' },
      { status: 500 }
    );
  }
}
