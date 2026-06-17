import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST - Acionamento remoto do relay (abrir grua)
// Tambem registra venda por CEDULA se solicitado (cash insertion)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { registrarCedula, dispositivoId, gpsLatitude, gpsLongitude } = body;

    const grua = await db.grua.findUnique({
      where: { id },
    });
    if (!grua) return NextResponse.json({ error: 'Grua nao encontrada' }, { status: 404 });

    if (!grua.relayIp) {
      return NextResponse.json({ error: 'Grua nao tem IP de relay configurado' }, { status: 400 });
    }

    // Attempt to trigger relay via Sonoff Tasmota HTTP
    let relayOk = false;
    let relayError: string | null = null;

    try {
      const relayUrl = `http://${grua.relayIp}:${grua.relayPort}/cm?cmnd=PulseTime1%202`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout (LAN)

      const response = await fetch(relayUrl, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      relayOk = response.ok;
      if (!relayOk) {
        relayError = `Relay respondeu com status ${response.status}`;
      }
    } catch (err: any) {
      relayError = err.name === 'AbortError'
        ? 'Timeout ao conectar com relay (rede local inacessivel)'
        : `Erro ao conectar com relay: ${err.message}`;
      relayOk = false;
    }

    // If registrarCedula = true, also register a cash sale
    if (registrarCedula && relayOk) {
      try {
        // Create VendaGrua for cedula
        await db.vendaGrua.create({
          data: {
            gruaId: id,
            empresaId: grua.empresaId,
            valor: 2.00,
            formaPagamento: 'CEDULA',
            relayOk: true,
            dispositivoId: dispositivoId || null,
            gpsLatitude: gpsLatitude ?? null,
            gpsLongitude: gpsLongitude ?? null,
          },
        });

        // Increment Grua counters
        await db.grua.update({
          where: { id },
          data: {
            contadorParcial: { increment: 1 },
            contadorTotal: { increment: 1 },
          },
        });

        // Nota: A gruia nao tem relacao direta com Maquina no schema.
        // A integracao financeira com o fluxo de cobranca e via clienteId.
      } catch (e) {
        console.error('[GRUAS/ABRIR] Erro ao registrar cedula:', e);
      }
    }

    return NextResponse.json({
      success: true,
      relayOk,
      relayError,
      gruaNome: grua.nome,
    });
  } catch (error) {
    console.error('[GRUAS/ABRIR] Erro:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
