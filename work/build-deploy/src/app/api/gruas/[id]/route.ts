import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET - Single grua detail (with auditoria)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const grua = await db.grua.findUnique({
      where: { id },
      include: { cliente: { select: { id: true, nome: true } } },
    });
    if (!grua) return NextResponse.json({ error: 'Grua nao encontrada' }, { status: 404 });

    // Last telemetry
    const lastTelemetry = await db.telemetriaGrua.findFirst({
      where: { gruaId: id },
      orderBy: { createdAt: 'desc' },
    });

    // Today's vendas (PIX transactions count + total pulsos)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const vendasHoje = await db.vendaGrua.findMany({
      where: { gruaId: id, createdAt: { gte: today } },
      select: { valor: true, pulsos: true },
    });
    const totalVendasHoje = vendasHoje.length;
    const totalPulsosHoje = vendasHoje.reduce((sum, v) => sum + (v.pulsos || 1), 0);
    const totalValorHoje = vendasHoje.reduce((sum, v) => sum + (v.valor || 0), 0);

    const now = new Date();
    const isOnline = grua.ultimaTelemetria
      ? (now.getTime() - new Date(grua.ultimaTelemetria).getTime()) < 10 * 60 * 1000
      : false;

    const valorPulso = grua.valorPulso || 2.00;

    // ========== AUDITORIA ==========
    const tAtual = grua.contadorHardwareAtual || 0;
    const pAtual = grua.contadorPixAcumulado || 0;
    const tZero = grua.marcoZeroHardware || 0;
    const pZero = grua.marcoZeroPix || 0;
    const pulsosCedulas = Math.max(0, (tAtual - tZero) - (pAtual - pZero));
    const faturamentoDigital = grua.contadorParcial * valorPulso;
    const faturamentoFisico = pulsosCedulas * valorPulso;

    // Status do cofre
    let statusCofre = 'SEM_DADOS';
    if (tAtual > 0) {
      statusCofre = pulsosCedulas > 0 ? 'CONCILIADO' : 'CONCILIADO';
    }

    return NextResponse.json({
      ...grua,
      status: isOnline ? 'ONLINE' : 'OFFLINE',
      valorPulso,
      // Vendas PIX
      vendasHoje: totalVendasHoje,
      pulsosHoje: totalPulsosHoje,
      valorHoje: totalValorHoje,
      // Auditoria
      auditoria: {
        tAtual,
        pAtual,
        tZero,
        pZero,
        pulsosCedulas,
        faturamentoDigital,
        faturamentoFisico,
        faturamentoTotal: faturamentoDigital + faturamentoFisico,
        statusCofre,
      },
      lastTelemetry: lastTelemetry || null,
    });
  } catch (error) {
    console.error('[GRUAS] Erro ao buscar:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// PATCH - Update grua
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { nome, ativa, clienteId, relayIp, relayPort, mpAccessToken, mpPublicKey, endereco, latitude, longitude, contadorParcial, contadorTotal, ultimoResetAt, valorPulso } = body;

    const data: Record<string, any> = {};
    if (nome !== undefined) data.nome = nome;
    if (ativa !== undefined) data.ativa = ativa;
    if (clienteId !== undefined) data.clienteId = clienteId || null;
    if (relayIp !== undefined) data.relayIp = relayIp || null;
    if (relayPort !== undefined) data.relayPort = relayPort;
    if (mpAccessToken !== undefined) data.mpAccessToken = mpAccessToken || null;
    if (mpPublicKey !== undefined) data.mpPublicKey = mpPublicKey || null;
    if (endereco !== undefined) data.endereco = endereco || null;
    if (latitude !== undefined) data.latitude = latitude || null;
    if (longitude !== undefined) data.longitude = longitude || null;
    if (contadorParcial !== undefined) data.contadorParcial = contadorParcial;
    if (contadorTotal !== undefined) data.contadorTotal = contadorTotal;
    if (ultimoResetAt !== undefined) data.ultimoResetAt = ultimoResetAt ? new Date(ultimoResetAt) : null;
    if (valorPulso !== undefined) data.valorPulso = valorPulso;

    const grua = await db.grua.update({ where: { id }, data });
    return NextResponse.json(grua);
  } catch (error: any) {
    console.error('[GRUAS] Erro ao atualizar:', error);
    if (error?.code === 'P2025') return NextResponse.json({ error: 'Grua nao encontrada' }, { status: 404 });
    return NextResponse.json({ error: 'Erro ao atualizar' }, { status: 500 });
  }
}

// DELETE - Delete grua
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.grua.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[GRUAS] Erro ao excluir:', error);
    if (error?.code === 'P2025') return NextResponse.json({ error: 'Grua nao encontrada' }, { status: 404 });
    return NextResponse.json({ error: 'Erro ao excluir' }, { status: 500 });
  }
}
