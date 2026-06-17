import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// POST - Receive telemetry from POS (heartbeat) + dados de auditoria
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      gruaId,
      dispositivoId,
      contadorParcial,
      contadorTotal,
      gpsLatitude,
      gpsLongitude,
      bateria,
      sinal4g,
      sinalWifi,
      temperatura,
      memoriaLivre,
      versaoApp,
      relayOnline,
      // Dados de auditoria (Odometro + Auditor)
      contadorHardwareAtual,   // T: Counter1 do Tasmota
      contadorPixAcumulado,    // P: ACUMULADO_PIX_TOTAL do app
      faturamentoDigital,      // (P - P_zero) * valorPulso
      faturamentoFisico,       // ((T - T_zero) - (P - P_zero)) * valorPulso
      statusCofre,             // CONCILIADO | DIVERGENTE | ALERTA_FRAUDE
    } = body;

    if (!gruaId) {
      return NextResponse.json({ error: 'gruaId obrigatorio' }, { status: 400 });
    }

    // Auto-sync tables
    try {
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "gruas" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "nome" TEXT NOT NULL,
        "empresaId" TEXT NOT NULL,
        "clienteId" TEXT,
        "ativa" BOOLEAN NOT NULL DEFAULT true,
        "dispositivoId" TEXT,
        "relayIp" TEXT,
        "relayPort" INTEGER NOT NULL DEFAULT 80,
        "mpAccessToken" TEXT,
        "mpPublicKey" TEXT,
        "endereco" TEXT,
        "latitude" DOUBLE PRECISION,
        "longitude" DOUBLE PRECISION,
        "contadorParcial" INTEGER NOT NULL DEFAULT 0,
        "contadorTotal" INTEGER NOT NULL DEFAULT 0,
        "ultimoResetAt" TIMESTAMP(3),
        "valorPulso" DOUBLE PRECISION NOT NULL DEFAULT 2.00,
        "contadorHardwareAtual" INTEGER NOT NULL DEFAULT 0,
        "contadorPixAcumulado" INTEGER NOT NULL DEFAULT 0,
        "marcoZeroHardware" INTEGER NOT NULL DEFAULT 0,
        "marcoZeroPix" INTEGER NOT NULL DEFAULT 0,
        "ultimaTelemetria" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "gruas_nome_empresaId_key" UNIQUE ("nome", "empresaId")
      );`);
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "telemetria_grua" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "gruaId" TEXT NOT NULL,
        "empresaId" TEXT NOT NULL,
        "bateria" INTEGER,
        "sinal4g" INTEGER,
        "sinalWifi" INTEGER,
        "temperatura" DOUBLE PRECISION,
        "memoriaLivre" INTEGER,
        "versaoApp" TEXT,
        "relayOnline" BOOLEAN,
        "gpsLatitude" DOUBLE PRECISION,
        "gpsLongitude" DOUBLE PRECISION,
        "contadorHardwareAtual" INTEGER,
        "contadorPixAcumulado" INTEGER,
        "faturamentoDigital" DOUBLE PRECISION,
        "faturamentoFisico" DOUBLE PRECISION,
        "statusCofre" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );`);
    } catch (e) { /* tables exist */ }

    // Update grua: ultimaTelemetria + contadores + GPS + dados auditoria
    const updateData: Record<string, any> = {
      ultimaTelemetria: new Date(),
    };
    if (contadorParcial !== undefined) updateData.contadorParcial = contadorParcial;
    if (contadorTotal !== undefined) updateData.contadorTotal = contadorTotal;
    if (gpsLatitude !== undefined) updateData.latitude = gpsLatitude;
    if (gpsLongitude !== undefined) updateData.longitude = gpsLongitude;
    if (dispositivoId) updateData.dispositivoId = dispositivoId;
    // Dados de auditoria do hardware
    if (contadorHardwareAtual !== undefined) updateData.contadorHardwareAtual = contadorHardwareAtual;
    if (contadorPixAcumulado !== undefined) updateData.contadorPixAcumulado = contadorPixAcumulado;

    await db.grua.update({
      where: { id: gruaId },
      data: updateData,
    });

    // Get empresaId + valorPulso from grua
    const grua = await db.grua.findUnique({
      where: { id: gruaId },
      select: { empresaId: true, valorPulso: true, marcoZeroHardware: true, marcoZeroPix: true },
    });
    if (!grua) {
      return NextResponse.json({ error: 'Grua nao encontrada' }, { status: 404 });
    }

    // Salvar registro de telemetria (com dados de auditoria)
    await db.telemetriaGrua.create({
      data: {
        gruaId,
        empresaId: grua.empresaId,
        bateria: bateria ?? null,
        sinal4g: sinal4g ?? null,
        sinalWifi: sinalWifi ?? null,
        temperatura: temperatura ?? null,
        memoriaLivre: memoriaLivre ?? null,
        versaoApp: versaoApp ?? null,
        relayOnline: relayOnline ?? null,
        gpsLatitude: gpsLatitude ?? null,
        gpsLongitude: gpsLongitude ?? null,
        // Dados de auditoria
        contadorHardwareAtual: contadorHardwareAtual ?? null,
        contadorPixAcumulado: contadorPixAcumulado ?? null,
        faturamentoDigital: faturamentoDigital ?? null,
        faturamentoFisico: faturamentoFisico ?? null,
        statusCofre: statusCofre ?? null,
      },
    });

    // Cleanup old telemetry (keep last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    try {
      await db.telemetriaGrua.deleteMany({
        where: { createdAt: { lt: sevenDaysAgo } },
      });
    } catch (e) { /* ignore cleanup errors */ }

    // Calcular auditoria no servidor para confirmar/conferir com o que o POS enviou
    const valorPulso = grua.valorPulso || 2.00;
    const tZero = grua.marcoZeroHardware || 0;
    const pZero = grua.marcoZeroPix || 0;
    const tAtual = contadorHardwareAtual || 0;
    const pAtual = contadorPixAcumulado || 0;

    const serverFaturamentoDigital = (pAtual - pZero) * valorPulso;
    const serverFaturamentoFisico = ((tAtual - tZero) - (pAtual - pZero)) * valorPulso;

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      valorPulso,
      // Auditoria calculada no servidor
      auditoria: {
        tAtual,
        pAtual,
        tZero,
        pZero,
        pulsosCedulasPeriodo: (tAtual - tZero) - (pAtual - pZero),
        faturamentoDigital: serverFaturamentoDigital,
        faturamentoFisico: serverFaturamentoFisico,
      },
    });
  } catch (error) {
    console.error('[TELEMETRIA] Erro:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
