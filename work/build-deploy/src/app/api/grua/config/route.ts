import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET - Return config for a device (by dispositivoId or gruaId) + dados de auditoria
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const dispositivoId = searchParams.get('dispositivoId');
    const gruaId = searchParams.get('gruaId');

    let grua = null;

    if (dispositivoId) {
      grua = await db.grua.findUnique({ where: { dispositivoId } });
    } else if (gruaId) {
      grua = await db.grua.findUnique({ where: { id: gruaId } });
    }

    if (!grua) {
      return NextResponse.json({ error: 'Dispositivo nao vinculado a nenhuma grua' }, { status: 404 });
    }

    const valorPulso = grua.valorPulso || 2.00;
    const tAtual = grua.contadorHardwareAtual || 0;
    const pAtual = grua.contadorPixAcumulado || 0;
    const tZero = grua.marcoZeroHardware || 0;
    const pZero = grua.marcoZeroPix || 0;

    return NextResponse.json({
      gruaId: grua.id,
      nome: grua.nome,
      relayIp: grua.relayIp,
      relayPort: grua.relayPort,
      mpAccessToken: grua.mpAccessToken,
      mpPublicKey: grua.mpPublicKey,
      contadorParcial: grua.contadorParcial,
      contadorTotal: grua.contadorTotal,
      valorPulso,
      ultimoResetAt: grua.ultimoResetAt,
      ativa: grua.ativa,
      // Dados de auditoria para o POS sincronizar
      auditoria: {
        contadorHardwareAtual: tAtual,    // T atual (Counter1)
        contadorPixAcumulado: pAtual,     // P atual (PIX total)
        marcoZeroHardware: tZero,          // T no ultimo reset
        marcoZeroPix: pZero,               // P no ultimo reset
        pulsosCedulasPeriodo: Math.max(0, (tAtual - tZero) - (pAtual - pZero)),
        faturamentoDigital: (pAtual - pZero) * valorPulso,
        faturamentoFisico: Math.max(0, ((tAtual - tZero) - (pAtual - pZero))) * valorPulso,
      },
    });
  } catch (error) {
    console.error('[GRUA/CONFIG] Erro:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
