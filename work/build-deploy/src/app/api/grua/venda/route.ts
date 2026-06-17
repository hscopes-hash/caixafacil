import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST - Register a sale (from POS after PIX payment confirmed)
// Supports variable amounts that are multiples of valorPulso (default R$ 2,00)
// pulsos = valor / valorPulso (e.g., R$10 / R$2 = 5 pulses)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { gruaId, mpPaymentId, mpStatus, valor, relayOk, dispositivoId, gpsLatitude, gpsLongitude } = body;

    if (!gruaId) {
      return NextResponse.json({ error: 'gruaId obrigatorio' }, { status: 400 });
    }

    // Auto-sync
    try {
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "vendas_grua" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "gruaId" TEXT NOT NULL,
        "empresaId" TEXT NOT NULL,
        "mpPaymentId" TEXT,
        "mpStatus" TEXT,
        "valor" DOUBLE PRECISION NOT NULL DEFAULT 2.00,
        "pulsos" INTEGER NOT NULL DEFAULT 1,
        "formaPagamento" TEXT NOT NULL DEFAULT 'PIX',
        "relayOk" BOOLEAN NOT NULL DEFAULT false,
        "dispositivoId" TEXT,
        "gpsLatitude" DOUBLE PRECISION,
        "gpsLongitude" DOUBLE PRECISION,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "vendas_grua_mpPaymentId_key" UNIQUE ("mpPaymentId")
      );`);
    } catch (e) { /* table exists */ }

    // Get grua (including valorPulso)
    const grua = await db.grua.findUnique({ where: { id: gruaId } });
    if (!grua) return NextResponse.json({ error: 'Grua nao encontrada' }, { status: 404 });

    // Determine valor and pulsos
    const valorPulso = grua.valorPulso || 2.00;
    const valorFinal = valor || valorPulso; // default to 1 pulse if not specified

    // Validate: valor must be a positive multiple of valorPulso
    if (valorFinal <= 0 || valorFinal % valorPulso !== 0) {
      return NextResponse.json({
        error: `Valor deve ser multiplo de R$ ${valorPulso.toFixed(2)}`
      }, { status: 400 });
    }

    // Cap at reasonable max (50 pulses)
    const pulsos = Math.round(valorFinal / valorPulso);
    if (pulsos > 50) {
      return NextResponse.json({ error: 'Maximo de 50 pulsos por transacao' }, { status: 400 });
    }

    // Create venda
    const venda = await db.vendaGrua.create({
      data: {
        gruaId,
        empresaId: grua.empresaId,
        mpPaymentId: mpPaymentId || null,
        mpStatus: mpStatus || null,
        valor: valorFinal,
        pulsos,
        relayOk: relayOk || false,
        dispositivoId: dispositivoId || null,
        gpsLatitude: gpsLatitude ?? null,
        gpsLongitude: gpsLongitude ?? null,
      },
    });

    // Increment contadores on grua by number of pulses (not by 1)
    await db.grua.update({
      where: { id: gruaId },
      data: {
        contadorParcial: { increment: pulsos },
        contadorTotal: { increment: pulsos },
      },
    });

    return NextResponse.json({ success: true, venda, pulsos });
  } catch (error: any) {
    console.error('[GRUA/VENDA] Erro:', error);
    return NextResponse.json({ error: 'Erro ao registrar venda' }, { status: 500 });
  }
}
