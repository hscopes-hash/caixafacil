import { NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * PATCH /api/migration/fix-plano-profissional
 * Correcao pontual: altera limiteMaquinas do plano "Profissional" de 15 para 50.
 * Executar uma vez e depois excluir este endpoint.
 */
export async function PATCH() {
  try {
    const plano = await prisma.planoSaaS.findFirst({
      where: { nome: 'Profissional' },
    });

    if (!plano) {
      return NextResponse.json({ message: 'Plano Profissional nao encontrado no banco', updated: false });
    }

    if (plano.limiteMaquinas === 50) {
      return NextResponse.json({ message: 'Plano Profissional ja possui limiteMaquinas=50, nenhuma alteracao necessaria', updated: false });
    }

    const updated = await prisma.planoSaaS.update({
      where: { id: plano.id },
      data: { limiteMaquinas: 50 },
    });

    return NextResponse.json({
      message: `Plano Profissional atualizado: limiteMaquinas ${plano.limiteMaquinas} -> 50`,
      updated: true,
      planoId: plano.id,
    });
  } catch (error) {
    console.error('[MIGRATION] Erro ao atualizar plano Profissional:', error);
    return NextResponse.json({ error: 'Erro ao atualizar plano' }, { status: 500 });
  }
}
