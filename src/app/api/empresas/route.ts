import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Listar todas as empresas ativas (para seleção no login)
export async function GET() {
  try {
    const empresas = await db.empresa.findMany({
      where: {
        ativa: true,
      },
      select: {
        id: true,
        nome: true,
        cnpj: true,
        logo: true,
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
