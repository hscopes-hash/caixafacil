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
            email: true,
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
    const { leituras, clienteId, usuarioId, despesa, valorDespesa, receita, valorReceita, caixa, valorCaixa, fotoGcsPath } = body;

    console.log('[LEITURAS POST] Recebido:', {
      qtdLeituras: leituras?.length || 0,
      clienteId,
      usuarioId,
      fotoGcsPath: fotoGcsPath || 'NULL',
      temDespesa: !!despesa,
      temReceita: !!receita,
    });

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

    // ⚠️ Sem transação interativa — Vercel serverless + Google Cloud SQL
    // pode falhar com 'Transaction not found' em transações longas.
    // Queries sequenciais com db direto são mais robustas em serverless.
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
        const novaLeitura = await db.leitura.create({
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
            observacoes: observacoes || null,
            // Campos de despesa
            despesa: despesa || null,
            valorDespesa: valorDespesa || null,
            // Campos de caixa (receitas detalhadas como JSON)
            caixa: receita || null,
            valorCaixa: valorReceita || null,
            // Fotos criptografadas no GCS (compartilhado por batch)
            fotoGcsPath: fotoGcsPath || null,
          },
        });

        // Atualizar máquina com os novos valores
        await db.maquina.update({
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
      const primeiraMaquina = await db.maquina.findFirst({
        where: { clienteId },
      });

      if (primeiraMaquina) {
        const novaLeitura = await db.leitura.create({
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
            caixa: receita || null,
            valorCaixa: valorReceita || null,
          },
        });
        leiturasCriadas.push(novaLeitura);
      }
    }

    return NextResponse.json({
      success: true,
      message: `${leiturasCriadas.length} leitura(s) salva(s) com sucesso`,
      leituras: leiturasCriadas,
    });
  } catch (error) {
    console.error('Erro ao salvar leituras:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Erro ao salvar leituras', details: errorMsg },
      { status: 500 }
    );
  }
}

// ============================================
// DELETE — Excluir leituras de um fechamento e restaurar valores anteriores
// das máquinas. Só permite excluir o ÚLTIMO fechamento do cliente.
// ============================================
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clienteId = searchParams.get('clienteId');
    const dataISO = searchParams.get('dataISO'); // ISO do fechamento a excluir

    if (!clienteId || !dataISO) {
      return NextResponse.json(
        { error: 'clienteId e dataISO são obrigatórios' },
        { status: 400 }
      );
    }

    // 1. Buscar todas as leituras do cliente no mesmo horário (±5 min)
    const targetIso = dataISO.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(dataISO)
      ? dataISO
      : `${dataISO}Z`;
    const targetMs = new Date(targetIso).getTime();
    const JANELA_MS = 5 * 60 * 1000;

    const [datePart] = dataISO.split('T');
    const inicioUtc = new Date(`${datePart}T00:00:00Z`);
    const fimUtc = new Date(`${datePart}T23:59:59Z`);

    const leiturasDoDia = await db.leitura.findMany({
      where: {
        clienteId,
        dataLeitura: { gte: inicioUtc, lte: fimUtc },
      },
      include: { maquina: { select: { id: true, codigo: true } } },
      orderBy: { dataLeitura: 'desc' },
    });

    // Filtrar para o mesmo horário (±5 min)
    const leiturasFechamento = leiturasDoDia.filter((l: any) => {
      if (!l.dataLeitura) return false;
      return Math.abs(new Date(l.dataLeitura).getTime() - targetMs) <= JANELA_MS;
    });

    if (leiturasFechamento.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma leitura encontrada para este fechamento.' },
        { status: 404 }
      );
    }

    // 2. Verificar se é o ÚLTIMO fechamento do cliente
    // Buscar a data da leitura mais recente do cliente
    const leituraMaisRecente = await db.leitura.findFirst({
      where: { clienteId },
      orderBy: { dataLeitura: 'desc' },
      select: { dataLeitura: true },
    });

    if (leituraMaisRecente && leituraMaisRecente.dataLeitura) {
      const recentMs = new Date(leituraMaisRecente.dataLeitura).getTime();
      // Se a leitura mais recente NÃO está no fechamento selecionado (±5 min),
      // então não é o último fechamento
      const isUltimo = Math.abs(recentMs - targetMs) <= JANELA_MS;
      if (!isUltimo) {
        return NextResponse.json(
          { error: 'Apenas o último fechamento pode ser excluído. Selecione o fechamento mais recente.' },
          { status: 403 }
        );
      }
    }

    // 3. Para cada leitura do fechamento, restaurar valores anteriores da máquina
    // entradaAtual volta para entradaAnterior, saidaAtual volta para saidaAnterior
    for (const leitura of leiturasFechamento) {
      await db.maquina.update({
        where: { id: leitura.maquinaId },
        data: {
          entradaAtual: leitura.entradaAnterior,
          saidaAtual: leitura.saidaAnterior,
        },
      });
    }

    // 4. Excluir as leituras do fechamento
    const leituraIds = leiturasFechamento.map(l => l.id);
    await db.leitura.deleteMany({
      where: { id: { in: leituraIds } },
    });

    return NextResponse.json({
      success: true,
      message: `${leiturasFechamento.length} leitura(s) excluída(s) e valores das máquinas restaurados.`,
      leiturasExcluidas: leiturasFechamento.length,
    });
  } catch (error) {
    console.error('Erro ao excluir leituras:', error);
    const errorMsg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Erro ao excluir leituras', details: errorMsg },
      { status: 500 }
    );
  }
}
