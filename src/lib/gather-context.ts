import { db } from '@/lib/db';

/**
 * Gathers comprehensive company context from multiple database tables
 * to provide the AI assistant with real-time business data.
 */
export async function gatherCompanyContext(empresaId: string): Promise<string> {
  const lines: string[] = [];

  try {
    // Company info
    const empresa = await db.empresa.findUnique({
      where: { id: empresaId },
      select: { nome: true, plano: true, ativa: true, bloqueada: true },
    });
    if (empresa) {
      lines.push(`Empresa: ${empresa.nome}`);
      lines.push(`Plano: ${empresa.plano} | Ativa: ${empresa.ativa ? 'Sim' : 'Não'} | Bloqueada: ${empresa.bloqueada ? 'Sim' : 'Não'}`);
    }
  } catch {}

  try {
    // Clients summary
    const totalClientes = await db.cliente.count({
      where: { empresaId },
    });
    const clientesAtivos = await db.cliente.count({
      where: { empresaId, ativo: true, bloqueado: false },
    });
    const clientesBloqueados = await db.cliente.count({
      where: { empresaId, bloqueado: true },
    });
    lines.push(`\nCLIENTES: Total=${totalClientes} | Ativos=${clientesAtivos} | Bloqueados=${clientesBloqueados}`);
  } catch {}

  try {
    // Machines summary
    const totalMaquinas = await db.maquina.count({
      where: { cliente: { empresaId } },
    });
    const maquinasAtivas = await db.maquina.count({
      where: { cliente: { empresaId }, status: 'ATIVA' },
    });
    const maquinasManutencao = await db.maquina.count({
      where: { cliente: { empresaId }, status: 'MANUTENCAO' },
    });
    const maquinasInativas = await db.maquina.count({
      where: { cliente: { empresaId }, status: 'INATIVA' },
    });
    lines.push(`MÁQUINAS: Total=${totalMaquinas} | Ativas=${maquinasAtivas} | Manutenção=${maquinasManutencao} | Inativas=${maquinasInativas}`);
  } catch {}

  try {
    // Contas (Fluxo de Caixa) summary
    const contasReceber = await db.conta.findMany({
      where: { empresaId, tipo: 1 },
      select: { valor: true, paga: true },
    });
    const contasPagar = await db.conta.findMany({
      where: { empresaId, tipo: 0 },
      select: { valor: true, paga: true },
    });

    const totalReceber = contasReceber.reduce((s, c) => s + c.valor, 0);
    const totalReceberPendente = contasReceber.filter(c => !c.paga).reduce((s, c) => s + c.valor, 0);
    const totalReceberRecebido = contasReceber.filter(c => c.paga).reduce((s, c) => s + c.valor, 0);
    const totalPagar = contasPagar.reduce((s, c) => s + c.valor, 0);
    const totalPagarPendente = contasPagar.filter(c => !c.paga).reduce((s, c) => s + c.valor, 0);
    const totalPagarPago = contasPagar.filter(c => c.paga).reduce((s, c) => s + c.valor, 0);
    const saldo = totalReceber - totalPagar;

    lines.push(`\nFLUXO DE CAIXA:`);
    lines.push(`  A Receber: Total=R$ ${totalReceber.toFixed(2)} | Pendente=R$ ${totalReceberPendente.toFixed(2)} | Recebido=R$ ${totalReceberRecebido.toFixed(2)} (${contasReceber.filter(c => !c.paga).length} pendentes)`);
    lines.push(`  A Pagar: Total=R$ ${totalPagar.toFixed(2)} | Pendente=R$ ${totalPagarPendente.toFixed(2)} | Pago=R$ ${totalPagarPago.toFixed(2)} (${contasPagar.filter(c => !c.paga).length} pendentes)`);
    lines.push(`  SALDO: R$ ${saldo.toFixed(2)}`);
  } catch {}

  try {
    // Recent readings (last 30 days)
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

    const leiturasRecentes = await db.leitura.findMany({
      where: {
        cliente: { empresaId },
        dataLeitura: { gte: trintaDiasAtras },
      },
      select: { saldo: true, diferencaEntrada: true, diferencaSaida: true },
    });

    if (leiturasRecentes.length > 0) {
      const totalSaldoLeituras = leiturasRecentes.reduce((s, l) => s + l.saldo, 0);
      lines.push(`\nLEITURAS (últimos 30 dias): ${leiturasRecentes.length} leituras | Saldo total=R$ ${totalSaldoLeituras.toFixed(2)}`);
    } else {
      lines.push(`\nLEITURAS (últimos 30 dias): Nenhuma leitura registrada`);
    }
  } catch {}

  try {
    // Recent payments (last 30 days)
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30);

    const pagamentosRecentes = await db.pagamento.findMany({
      where: {
        cliente: { empresaId },
        dataPagamento: { gte: trintaDiasAtras },
      },
      select: { valor: true, status: true },
    });

    if (pagamentosRecentes.length > 0) {
      const totalRecebido = pagamentosRecentes
        .filter(p => p.status === 'PAGO')
        .reduce((s, p) => s + p.valor, 0);
      lines.push(`PAGAMENTOS (últimos 30 dias): ${pagamentosRecentes.length} pagamentos | Recebido=R$ ${totalRecebido.toFixed(2)}`);
    }
  } catch {}

  // Recent contas list for AI context (last 10)
  try {
    const contasRecentes = await db.conta.findMany({
      where: { empresaId },
      include: { cliente: { select: { nome: true } } },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (contasRecentes.length > 0) {
      lines.push(`\nÚLTIMAS CONTAS:`);
      contasRecentes.forEach(c => {
        const tipoStr = c.tipo === 0 ? 'PAGAR' : 'RECEBER';
        const statusStr = c.paga ? 'Liquidada' : 'Pendente';
        lines.push(`  [${tipoStr}] ${c.descricao} | R$ ${c.valor.toFixed(2)} | ${c.cliente?.nome || '-'} | ${statusStr}`);
      });
    }
  } catch {}

  return lines.join('\n');
}
