import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { enforcePlan } from '@/lib/plan-enforcement';
import { Prisma } from '@prisma/client';

// GET - Gerar relatórios por tipo
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const empresaId = searchParams.get('empresaId');
    const tipo = searchParams.get('tipo'); // 'movimentacao' | 'pagamentos' | 'clientes' | 'maquinas' | 'contas' | 'fluxo-caixa'
    const dataInicio = searchParams.get('dataInicio');
    const dataFim = searchParams.get('dataFim');
    const clienteId = searchParams.get('clienteId');
    const statusFilter = searchParams.get('status');
    const tipoMaquinaId = searchParams.get('tipoMaquinaId');

    if (!empresaId || !tipo) {
      return NextResponse.json({ error: 'empresaId e tipo são obrigatórios' }, { status: 400 });
    }

    // Verificar acesso ao recurso de relatórios
    const planCheck = await enforcePlan(empresaId, { feature: 'recRelatorios' }, request);
    if (planCheck.error) {
      return NextResponse.json({ error: planCheck.error }, { status: 403 });
    }

    switch (tipo) {
      case 'movimentacao':
        return gerarRelatorioMovimentacao(empresaId, dataInicio, dataFim, clienteId, tipoMaquinaId);
      case 'pagamentos':
        return gerarRelatorioPagamentos(empresaId, dataInicio, dataFim, clienteId, statusFilter);
      case 'clientes':
        return gerarRelatorioClientes(empresaId, statusFilter);
      case 'maquinas':
        return gerarRelatorioMaquinas(empresaId, clienteId, statusFilter, tipoMaquinaId);
      case 'contas':
        return gerarRelatorioContas(empresaId, dataInicio, dataFim, clienteId, statusFilter);
      case 'fluxo-caixa':
        return gerarRelatorioFluxoCaixa(empresaId, dataInicio, dataFim, clienteId);
      default:
        return NextResponse.json({ error: 'Tipo de relatório inválido' }, { status: 400 });
    }
  } catch (error) {
    console.error('Erro ao gerar relatório:', error);
    return NextResponse.json({ error: 'Erro ao gerar relatório' }, { status: 500 });
  }
}

// ============================================
// RELATÓRIO DE MOVIMENTAÇÃO (Leituras)
// ============================================
async function gerarRelatorioMovimentacao(
  empresaId: string,
  dataInicio: string | null,
  dataFim: string | null,
  clienteId: string | null,
  tipoMaquinaId: string | null,
) {
  if (!dataInicio || !dataFim) {
    return NextResponse.json({ error: 'dataInicio e dataFim são obrigatórios para movimentação' }, { status: 400 });
  }

  const where: Prisma.LeituraWhereInput = {
    cliente: { empresaId },
    dataLeitura: {
      gte: new Date(dataInicio + 'T00:00:00.000Z'),
      lte: new Date(dataFim + 'T23:59:59.999Z'),
    },
  };

  if (clienteId && clienteId !== 'todos') {
    where.clienteId = clienteId;
  }

  if (tipoMaquinaId && tipoMaquinaId !== 'todos') {
    where.maquina = { tipoId: tipoMaquinaId };
  }

  const leituras = await db.leitura.findMany({
    where,
    include: {
      cliente: { select: { id: true, nome: true } },
      maquina: {
        select: {
          id: true,
          codigo: true,
          localizacao: true,
          tipo: { select: { id: true, descricao: true } },
        },
      },
      usuario: { select: { id: true, nome: true } },
    },
    orderBy: { dataLeitura: 'desc' },
  });

  // Calcular totais
  const totais = leituras.reduce(
    (acc, l) => ({
      totalEntradas: acc.totalEntradas + l.diferencaEntrada,
      totalSaidas: acc.totalSaidas + l.diferencaSaida,
      totalJogado: acc.totalJogado + l.saldo,
      totalDespesas: acc.totalDespesas + (l.valorDespesa || 0),
    }),
    { totalEntradas: 0, totalSaidas: 0, totalJogado: 0, totalDespesas: 0 },
  );

  return NextResponse.json({ leituras, totais, totalRegistros: leituras.length });
}

// ============================================
// RELATÓRIO DE PAGAMENTOS
// ============================================
async function gerarRelatorioPagamentos(
  empresaId: string,
  dataInicio: string | null,
  dataFim: string | null,
  clienteId: string | null,
  statusFilter: string | null,
) {
  const where: Prisma.PagamentoWhereInput = {
    cliente: { empresaId },
  };

  if (dataInicio && dataFim) {
    where.dataVencimento = {
      gte: new Date(dataInicio + 'T00:00:00.000Z'),
      lte: new Date(dataFim + 'T23:59:59.999Z'),
    };
  }

  if (clienteId && clienteId !== 'todos') {
    where.clienteId = clienteId;
  }

  if (statusFilter && statusFilter !== 'todos') {
    where.status = statusFilter as any;
  }

  const pagamentos = await db.pagamento.findMany({
    where,
    include: {
      cliente: { select: { id: true, nome: true } },
      assinatura: { select: { id: true, plano: true } },
    },
    orderBy: { dataVencimento: 'desc' },
  });

  const totais = pagamentos.reduce(
    (acc, p) => ({
      totalValor: acc.totalValor + p.valor,
      totalPago: acc.totalPago + (p.status === 'PAGO' ? p.valor : 0),
      totalPendente: acc.totalPendente + (p.status === 'PENDENTE' ? p.valor : 0),
      totalAtrasado: acc.totalAtrasado + (p.status === 'ATRASADO' ? p.valor : 0),
    }),
    { totalValor: 0, totalPago: 0, totalPendente: 0, totalAtrasado: 0 },
  );

  return NextResponse.json({ pagamentos, totais, totalRegistros: pagamentos.length });
}

// ============================================
// RELATÓRIO DE CLIENTES
// ============================================
async function gerarRelatorioClientes(empresaId: string, statusFilter: string | null) {
  const where: Prisma.ClienteWhereInput = { empresaId };

  if (statusFilter === 'ativos') {
    where.ativo = true;
    where.bloqueado = false;
  } else if (statusFilter === 'bloqueados') {
    where.bloqueado = true;
  } else if (statusFilter === 'inativos') {
    where.ativo = false;
  }

  const clientes = await db.cliente.findMany({
    where,
    include: {
      _count: {
        select: {
          maquinas: true,
          assinaturas: true,
          pagamentos: { where: { status: 'PENDENTE' } },
        },
      },
    },
    orderBy: { nome: 'asc' },
  });

  const totais = {
    totalClientes: clientes.length,
    totalMaquinas: clientes.reduce((sum, c) => sum + c._count.maquinas, 0),
    totalAssinaturas: clientes.reduce((sum, c) => sum + c._count.assinaturas, 0),
    totalPagamentosPendentes: clientes.reduce((sum, c) => sum + c._count.pagamentos, 0),
  };

  return NextResponse.json({ clientes, totais, totalRegistros: clientes.length });
}

// ============================================
// RELATÓRIO DE MÁQUINAS
// ============================================
async function gerarRelatorioMaquinas(
  empresaId: string,
  clienteId: string | null,
  statusFilter: string | null,
  tipoMaquinaId: string | null,
) {
  const where: Prisma.MaquinaWhereInput = {
    cliente: { empresaId },
  };

  if (clienteId && clienteId !== 'todos') {
    where.clienteId = clienteId;
  }

  if (statusFilter && statusFilter !== 'todos') {
    where.status = statusFilter as any;
  }

  if (tipoMaquinaId && tipoMaquinaId !== 'todos') {
    where.tipoId = tipoMaquinaId;
  }

  const maquinas = await db.maquina.findMany({
    where,
    include: {
      cliente: { select: { id: true, nome: true } },
      tipo: { select: { id: true, descricao: true, nomeEntrada: true, nomeSaida: true } },
    },
    orderBy: { codigo: 'asc' },
  });

  const totais = {
    totalMaquinas: maquinas.length,
    ativas: maquinas.filter(m => m.status === 'ATIVA').length,
    inativas: maquinas.filter(m => m.status === 'INATIVA').length,
    manutencao: maquinas.filter(m => m.status === 'MANUTENCAO').length,
    vendidas: maquinas.filter(m => m.status === 'VENDIDA').length,
    valorTotalAquisicao: maquinas.reduce((sum, m) => sum + (m.valorAquisicao || 0), 0),
    faturamentoMensal: maquinas.reduce((sum, m) => sum + (m.valorMensal || 0), 0),
  };

  return NextResponse.json({ maquinas, totais, totalRegistros: maquinas.length });
}

// ============================================
// RELATÓRIO DE CONTAS (Débitos)
// ============================================
async function gerarRelatorioContas(
  empresaId: string,
  dataInicio: string | null,
  dataFim: string | null,
  clienteId: string | null,
  statusFilter: string | null,
) {
  const where: Prisma.ContaWhereInput = {
    empresaId,
  };

  if (dataInicio && dataFim) {
    where.data = {
      gte: new Date(dataInicio + 'T00:00:00.000Z'),
      lte: new Date(dataFim + 'T23:59:59.999Z'),
    };
  }

  if (clienteId && clienteId !== 'todos') {
    where.clienteId = clienteId;
  }

  if (statusFilter === 'pagas') {
    where.paga = true;
  } else if (statusFilter === 'pendentes') {
    where.paga = false;
  }

  const contas = await db.conta.findMany({
    where,
    include: {
      cliente: { select: { id: true, nome: true } },
    },
    orderBy: { data: 'desc' },
  });

  const totais = contas.reduce(
    (acc, c) => ({
      totalAPagar: acc.totalAPagar + (c.tipo === 0 ? c.valor : 0),
      totalAReceber: acc.totalAReceber + (c.tipo === 1 ? c.valor : 0),
      totalPagas: acc.totalPagas + (c.paga ? c.valor : 0),
      totalPendentes: acc.totalPendentes + (!c.paga ? c.valor : 0),
    }),
    { totalAPagar: 0, totalAReceber: 0, totalPagas: 0, totalPendentes: 0 },
  );

  return NextResponse.json({ contas, totais, totalRegistros: contas.length });
}

// ============================================
// RELATÓRIO FLUXO DE CAIXA
// ============================================
async function gerarRelatorioFluxoCaixa(
  empresaId: string,
  dataInicio: string | null,
  dataFim: string | null,
  clienteId: string | null,
) {
  if (!dataInicio || !dataFim) {
    return NextResponse.json({ error: 'dataInicio e dataFim são obrigatórios para fluxo de caixa' }, { status: 400 });
  }

  // Buscar todas as contas no período
  const contasWhere: Prisma.ContaWhereInput = {
    empresaId,
    dataPagamento: {
      gte: new Date(dataInicio + 'T00:00:00.000Z'),
      lte: new Date(dataFim + 'T23:59:59.999Z'),
    },
    paga: true,
  };

  if (clienteId && clienteId !== 'todos') {
    contasWhere.clienteId = clienteId;
  }

  const contas = await db.conta.findMany({
    where: contasWhere,
    include: {
      cliente: { select: { id: true, nome: true } },
    },
    orderBy: { dataPagamento: 'desc' },
  });

  // Buscar pagamentos recebidos no período
  const pagamentosWhere: Prisma.PagamentoWhereInput = {
    cliente: { empresaId },
    status: 'PAGO',
    dataPagamento: {
      gte: new Date(dataInicio + 'T00:00:00.000Z'),
      lte: new Date(dataFim + 'T23:59:59.999Z'),
    },
  };

  if (clienteId && clienteId !== 'todos') {
    pagamentosWhere.clienteId = clienteId;
  }

  const pagamentos = await db.pagamento.findMany({
    where: pagamentosWhere,
    include: {
      cliente: { select: { id: true, nome: true } },
    },
    orderBy: { dataPagamento: 'desc' },
  });

  // Combinar em timeline
  const entradas = pagamentos.map(p => ({
    id: p.id,
    data: p.dataPagamento || p.dataVencimento,
    descricao: `Pagamento - ${p.cliente.nome}`,
    valor: p.valor,
    tipo: 'entrada' as const,
    categoria: p.formaPagamento || '-',
    cliente: p.cliente.nome,
  }));

  const saidas = contas.filter(c => c.tipo === 0).map(c => ({
    id: c.id,
    data: c.dataPagamento || c.data,
    descricao: c.descricao,
    valor: c.valor,
    tipo: 'saida' as const,
    categoria: 'Despesa',
    cliente: c.cliente.nome,
  }));

  const receitas = contas.filter(c => c.tipo === 1).map(c => ({
    id: c.id,
    data: c.dataPagamento || c.data,
    descricao: c.descricao,
    valor: c.valor,
    tipo: 'entrada' as const,
    categoria: 'Receita',
    cliente: c.cliente.nome,
  }));

  const todos = [...entradas, ...saidas, ...receitas].sort((a, b) =>
    new Date(b.data).getTime() - new Date(a.data).getTime(),
  );

  const totais = {
    totalEntradas: [...entradas, ...receitas].reduce((s, i) => s + i.valor, 0),
    totalSaidas: saidas.reduce((s, i) => s + i.valor, 0),
    saldo: [...entradas, ...receitas].reduce((s, i) => s + i.valor, 0) - saidas.reduce((s, i) => s + i.valor, 0),
  };

  return NextResponse.json({
    lancamentos: todos,
    totais,
    totalRegistros: todos.length,
  });
}
