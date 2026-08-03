import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { enforcePlan } from '@/lib/plan-enforcement';

// Garantir coluna formaCobranca e liberarDigitacaoLeitura
async function ensureSchema() {
  try { await db.$executeRawUnsafe(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS "formaCobranca" TEXT`); } catch {}
  try { await db.$executeRawUnsafe(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS "liberarDigitacaoLeitura" BOOLEAN NOT NULL DEFAULT true`); } catch {}
  try { await db.$executeRawUnsafe(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS "nomeCartao1" TEXT NOT NULL DEFAULT 'CARTÃO1'`); } catch {}
  try { await db.$executeRawUnsafe(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS "nomeCartao2" TEXT NOT NULL DEFAULT 'CARTÃO2'`); } catch {}
  try { await db.$executeRawUnsafe(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS "tCartao1" TEXT`); } catch {}
  try { await db.$executeRawUnsafe(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS "tCartao2" TEXT`); } catch {}
  try { await db.$executeRawUnsafe(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS "planilhaGabarito" TEXT`); } catch {}
}

// Listar clientes da empresa
export async function GET(request: NextRequest) {
  try {
    // Garantir que as colunas novas existem antes de fazer findMany
    // (sem isso, Prisma falha se a migration não rodou)
    await ensureSchema();

    const { searchParams } = new URL(request.url);
    const empresaId = searchParams.get('empresaId');
    const busca = searchParams.get('busca');

    if (!empresaId) {
      return NextResponse.json(
        { error: 'ID da empresa é obrigatório' },
        { status: 400 }
      );
    }

    const where: Record<string, unknown> = { empresaId };

    if (busca) {
      where.OR = [
        { nome: { contains: busca } },
        { cpfCnpj: { contains: busca } },
        { email: { contains: busca } },
        { telefone: { contains: busca } },
      ];
    }

    const clientes = await db.cliente.findMany({
      where,
      include: {
        _count: {
          select: { maquinas: true },
        },
      },
      orderBy: { nome: 'asc' },
    });

    return NextResponse.json(clientes);
  } catch (error) {
    console.error('Erro ao listar clientes:', error);
    return NextResponse.json(
      { error: 'Erro ao listar clientes' },
      { status: 500 }
    );
  }
}

// Criar novo cliente
export async function POST(request: NextRequest) {
  try {
    await ensureSchema();
    const body = await request.json();
    const {
      nome,
      cpfCnpj,
      email,
      telefone,
      telefone2,
      endereco,
      cidade,
      estado,
      cep,
      observacoes,
      whatsapp,
      telegramGroupId,
      empresaId,
      acertoPercentual,
      formaCobranca,
      liberarDigitacaoLeitura,
      nomeCartao1,
      nomeCartao2,
      tCartao1,
      tCartao2,
      planilhaGabarito,
    } = body;

    if (!nome || !empresaId) {
      return NextResponse.json(
        { error: 'Nome e empresa são obrigatórios' },
        { status: 400 }
      );
    }

    const planCheck = await enforcePlan(empresaId, { limit: 'clientes' }, request);
    if (planCheck.error) {
      return NextResponse.json({ error: planCheck.error }, { status: 403 });
    }

    // Verificar se a empresa existe
    const empresaExiste = await db.empresa.findUnique({
      where: { id: empresaId },
    });

    if (!empresaExiste) {
      return NextResponse.json(
        { error: 'Empresa não encontrada. Faça logout e login novamente.' },
        { status: 400 }
      );
    }

    // Validar e clampar acertoPercentual (0-100, padrão 50)
    let acerto = 50;
    if (acertoPercentual !== undefined && acertoPercentual !== null && acertoPercentual !== '') {
      const parsed = parseInt(acertoPercentual);
      if (!isNaN(parsed)) {
        acerto = Math.min(100, Math.max(0, parsed));
      }
    }

    const cliente = await db.cliente.create({
      data: {
        nome,
        cpfCnpj,
        email,
        telefone,
        telefone2,
        endereco,
        cidade,
        estado,
        cep,
        observacoes,
        whatsapp,
        telegramGroupId: telegramGroupId || null,
        empresaId,
        acertoPercentual: acerto,
        ...(formaCobranca ? { formaCobranca } : {}),
        liberarDigitacaoLeitura: liberarDigitacaoLeitura !== undefined ? Boolean(liberarDigitacaoLeitura) : true,
        nomeCartao1: nomeCartao1 || 'CARTÃO1',
        nomeCartao2: nomeCartao2 || 'CARTÃO2',
        tCartao1: tCartao1?.trim() || null,
        tCartao2: tCartao2?.trim() || null,
        planilhaGabarito: planilhaGabarito || null,
      },
    });

    return NextResponse.json(cliente);
  } catch (error) {
    console.error('Erro ao criar cliente:', error);
    return NextResponse.json(
      { error: 'Erro ao criar cliente' },
      { status: 500 }
    );
  }
}
