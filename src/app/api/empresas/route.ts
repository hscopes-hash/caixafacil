import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Listar empresas ativas (para seleção no login)
// Suporta ?ids=id1,id2,id3 para filtrar por IDs específicos
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get('ids');

    const where: any = { ativa: true };

    // Se foi passado parâmetro ids, filtrar apenas esses
    if (idsParam) {
      const ids = idsParam.split(',').filter(Boolean).map(id => id.trim());
      if (ids.length > 0) {
        where.id = { in: ids };
      }
    }

    const empresas = await db.empresa.findMany({
      where,
      select: {
        id: true,
        nome: true,
        cnpj: true,
        logo: true,
        ativa: true,
        bloqueada: true,
      },
      orderBy: {
        nome: 'asc',
      },
    });

    return NextResponse.json(empresas);
  } catch (error) {
    console.error('Erro ao listar empresas:', error);
    return NextResponse.json(
      { error: 'Erro ao listar empresas' },
      { status: 500 }
    );
  }
}
