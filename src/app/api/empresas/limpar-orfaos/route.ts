import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

const SUPER_ADMIN_EMAIL = 'hscopes@gmail.com';

// Limpar registros órfãos (sem empresa associada)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { adminEmail } = body;

    if (adminEmail !== SUPER_ADMIN_EMAIL) {
      return NextResponse.json(
        { error: 'Acesso negado' },
        { status: 403 }
      );
    }

    const resultados: Record<string, number> = {};

    // Buscar todas as empresas válidas
    const empresas = await db.empresa.findMany({
      select: { id: true },
    });
    const empresaIds = empresas.map((e) => e.id);

    // Deletar tipos de máquina órfãos
    const tiposOrfaos = await db.tipoMaquina.deleteMany({
      where: {
        empresaId: { notIn: empresaIds },
      },
    });
    resultados.tiposMaquina = tiposOrfaos.count;

    // Deletar usuários órfãos (exceto super admin que não tem empresa)
    const usuariosOrfaos = await db.usuario.deleteMany({
      where: {
        empresaId: { notIn: empresaIds },
        email: { not: SUPER_ADMIN_EMAIL },
      },
    });
    resultados.usuarios = usuariosOrfaos.count;

    // Deletar clientes órfãos
    const clientesOrfaos = await db.cliente.deleteMany({
      where: {
        empresaId: { notIn: empresaIds },
      },
    });
    resultados.clientes = clientesOrfaos.count;

    // Deletar máquinas órfãs
    const maquinasOrfas = await db.maquina.deleteMany({
      where: {
        empresaId: { notIn: empresaIds },
      },
    });
    resultados.maquinas = maquinasOrfas.count;

    // Deletar leituras órfãs
    const leiturasOrfas = await db.leitura.deleteMany({
      where: {
        empresaId: { notIn: empresaIds },
      },
    });
    resultados.leituras = leiturasOrfas.count;

    // Deletar pagamentos órfãos (via cliente)
    const pagamentosOrfaos = await db.pagamento.deleteMany({
      where: {
        empresaId: { notIn: empresaIds },
      },
    });
    resultados.pagamentos = pagamentosOrfaos.count;

    // Deletar assinaturas órfãs
    const assinaturasOrfas = await db.assinatura.deleteMany({
      where: {
        empresaId: { notIn: empresaIds },
      },
    });
    resultados.assinaturas = assinaturasOrfas.count;

    // Deletar faturamentos órfãos
    const faturamentosOrfaos = await db.faturamento.deleteMany({
      where: {
        empresaId: { notIn: empresaIds },
      },
    });
    resultados.faturamentos = faturamentosOrfaos.count;

    // Deletar logs de acesso órfãos
    const logsOrfaos = await db.logAcesso.deleteMany({
      where: {
        empresaId: { notIn: empresaIds },
      },
    });
    resultados.logsAcesso = logsOrfaos.count;

    return NextResponse.json({
      success: true,
      message: 'Limpeza concluída',
      registrosRemovidos: resultados,
    });
  } catch (error) {
    console.error('Erro ao limpar registros órfãos:', error);
    return NextResponse.json(
      { error: 'Erro ao limpar registros órfãos' },
      { status: 500 }
    );
  }
}
