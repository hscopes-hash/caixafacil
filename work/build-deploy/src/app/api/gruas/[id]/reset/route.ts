import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST - Reset contador parcial (novo acerto) + capturar marcos zero para auditoria
// Fluxo: O App envia T (Counter1) e P (ACUMULADO_PIX_TOTAL) atuais.
// O servidor salva esses valores como os novos marcos zero.
// O hardware NUNCA e resetado — quem gerencia o periodo e o App.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      contadorHardwareAtual,   // T: Counter1 do Tasmota no momento do acerto
      contadorPixAcumulado,    // P: ACUMULADO_PIX_TOTAL do app no momento do acerto
    } = body;

    const grua = await db.grua.findUnique({ where: { id } });
    if (!grua) return NextResponse.json({ error: 'Grua nao encontrada' }, { status: 404 });

    const valorPulso = grua.valorPulso || 2.00;
    const pulsosAnterior = grua.contadorParcial;
    const faturamentoDigitalAnterior = pulsosAnterior * valorPulso;

    // Calcular faturamento fisico (cedulas) do periodo que esta encerrando
    const tAtual = contadorHardwareAtual ?? grua.contadorHardwareAtual ?? 0;
    const pAtual = contadorPixAcumulado ?? grua.contadorPixAcumulado ?? 0;
    const tZero = grua.marcoZeroHardware || 0;
    const pZero = grua.marcoZeroPix || 0;
    const pulsosCedulasPeriodo = Math.max(0, (tAtual - tZero) - (pAtual - pZero));
    const faturamentoFisicoAnterior = pulsosCedulasPeriodo * valorPulso;

    // Atualizar: zerar contador parcial + definir novos marcos zero
    const updated = await db.grua.update({
      where: { id },
      data: {
        contadorParcial: 0,
        // Capturar estado atual dos contadores como novos marcos zero
        marcoZeroHardware: tAtual,
        marcoZeroPix: pAtual,
        contadorHardwareAtual: tAtual,
        contadorPixAcumulado: pAtual,
        ultimoResetAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      // Resumo do periodo encerrado
      periodoAnterior: {
        faturamentoDigital: faturamentoDigitalAnterior,
        faturamentoFisico: faturamentoFisicoAnterior,
        faturamentoTotal: faturamentoDigitalAnterior + faturamentoFisicoAnterior,
        pulsosPix: pulsosAnterior,
        pulsosCedulas: pulsosCedulasPeriodo,
        pulsosTotais: pulsosAnterior + pulsosCedulasPeriodo,
      },
      // Novos marcos zero
      novosMarcos: {
        marcoZeroHardware: tAtual,
        marcoZeroPix: pAtual,
      },
      valorPulso,
      mensagem: `Acerto registrado. Digital: R$ ${faturamentoDigitalAnterior.toFixed(2)} | Fisico (Cedulas): R$ ${faturamentoFisicoAnterior.toFixed(2)} | Total: R$ ${(faturamentoDigitalAnterior + faturamentoFisicoAnterior).toFixed(2)}`,
    });
  } catch (error) {
    console.error('[GRUAS/RESET] Erro:', error);
    return NextResponse.json({ error: 'Erro ao resetar' }, { status: 500 });
  }
}
