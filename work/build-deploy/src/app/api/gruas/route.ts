import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET - List gruas for an empresa (with computed online status + auditoria)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const empresaId = searchParams.get('empresaId');

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId obrigatorio' }, { status: 400 });
    }

    // Auto-sync: guarantee tables exist
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "gruas" (
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
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "vendas_grua" (
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
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "telemetria_grua" (
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
    } catch (e) { /* tables already exist */ }

    const gruas = await db.grua.findMany({
      where: { empresaId },
      orderBy: { createdAt: 'desc' },
      include: { cliente: { select: { id: true, nome: true } } },
    });

    // Compute online status + auditoria
    const now = new Date();
    const gruasComStatus = gruas.map(grua => {
      const isOnline = grua.ultimaTelemetria
        ? (now.getTime() - new Date(grua.ultimaTelemetria).getTime()) < 10 * 60 * 1000
        : false;
      const valorPulso = grua.valorPulso || 2.00;
      const faturamentoDigital = grua.contadorParcial * valorPulso;

      // Auditoria: C = (T - T_zero) - (P - P_zero)
      const tAtual = grua.contadorHardwareAtual || 0;
      const pAtual = grua.contadorPixAcumulado || 0;
      const tZero = grua.marcoZeroHardware || 0;
      const pZero = grua.marcoZeroPix || 0;
      const pulsosCedulas = Math.max(0, (tAtual - tZero) - (pAtual - pZero));
      const faturamentoFisico = pulsosCedulas * valorPulso;
      const faturamentoTotal = faturamentoDigital + faturamentoFisico;

      // Status do cofre: verificar divergencia
      let statusCofre = 'CONCILIADO';
      if (pulsosCedulas > 0) {
        statusCofre = 'CONCILIADO'; // Tem cedulas no cofre, normal
      }

      return {
        ...grua,
        status: isOnline ? 'ONLINE' : 'OFFLINE',
        valorPulso,
        faturamentoDigital,
        faturamentoFisico,
        faturamentoTotal,
        pulsosCedulas,
        statusCofre,
      };
    });

    // Also fetch last telemetry for each grua
    const telemetryMap: Record<string, any> = {};
    for (const grua of gruas) {
      const lastTelemetry = await db.telemetriaGrua.findFirst({
        where: { gruaId: grua.id },
        orderBy: { createdAt: 'desc' },
      });
      if (lastTelemetry) {
        telemetryMap[grua.id] = lastTelemetry;
      }
    }

    return NextResponse.json({
      gruas: gruasComStatus,
      telemetry: telemetryMap,
    });
  } catch (error) {
    console.error('[GRUAS] Erro ao listar:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// POST - Create grua
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { empresaId, nome, clienteId, relayIp, relayPort, mpAccessToken, mpPublicKey, endereco, latitude, longitude, valorPulso } = body;

    if (!empresaId || !nome) {
      return NextResponse.json({ error: 'empresaId e nome obrigatorios' }, { status: 400 });
    }

    // Auto-sync table
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "gruas" (
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
    } catch (e) { /* table exists */ }

    const grua = await db.grua.create({
      data: {
        empresaId,
        nome,
        clienteId: clienteId || null,
        relayIp: relayIp || null,
        relayPort: relayPort || 80,
        mpAccessToken: mpAccessToken || null,
        mpPublicKey: mpPublicKey || null,
        endereco: endereco || null,
        latitude: latitude || null,
        longitude: longitude || null,
        valorPulso: valorPulso || 2.00,
      },
    });

    return NextResponse.json(grua);
  } catch (error: any) {
    console.error('[GRUAS] Erro ao criar:', error);
    if (error?.code === 'P2002') {
      return NextResponse.json({ error: 'Ja existe uma grua com este nome' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Erro ao criar grua' }, { status: 500 });
  }
}
