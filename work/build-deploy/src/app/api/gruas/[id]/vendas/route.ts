import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET - List vendas for a grua (PIX transactions with pulse details)
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const vendas = await db.vendaGrua.findMany({
      where: { gruaId: id },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await db.vendaGrua.count({ where: { gruaId: id } });

    // Summary stats
    const totalValor = vendas.reduce((sum, v) => sum + (v.valor || 0), 0);
    const totalPulsos = vendas.reduce((sum, v) => sum + (v.pulsos || 1), 0);

    return NextResponse.json({ vendas, total, totalValor, totalPulsos });
  } catch (error) {
    console.error('[GRUAS/VENDAS] Erro:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
