import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Atualizar empresa
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { 
      adminEmail,
      nome, 
      cnpj, 
      email, 
      telefone, 
      endereco, 
      cidade, 
      estado,
      plano,
      isDemo,
      diasDemo,
      dataVencimento,
      ativa,
      bloqueada,
      motivoBloqueio,
    } = body;

    // Verificar se é o admin master
    if (adminEmail !== 'hscopes@gmail.com') {
      return NextResponse.json(
        { error: 'Acesso negado' },
        { status: 403 }
      );
    }

    const empresa = await db.empresa.update({
      where: { id },
      data: {
        nome,
        cnpj: cnpj || null,
        email: email || null,
        telefone: telefone || null,
        endereco: endereco || null,
        cidade: cidade || null,
        estado: estado || null,
        plano,
        isDemo,
        diasDemo,
        dataVencimento: dataVencimento ? new Date(dataVencimento) : null,
        ativa,
        bloqueada,
        motivoBloqueio,
      }
    });

    return NextResponse.json(empresa);
  } catch (error) {
    console.error('Erro ao atualizar empresa:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar empresa' },
      { status: 500 }
    );
  }
}

// Excluir empresa
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const adminEmail = searchParams.get('adminEmail');

    // Verificar se é o admin master
    if (adminEmail !== 'hscopes@gmail.com') {
      return NextResponse.json(
        { error: 'Acesso negado' },
        { status: 403 }
      );
    }

    await db.empresa.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir empresa:', error);
    return NextResponse.json(
      { error: 'Erro ao excluir empresa' },
      { status: 500 }
    );
  }
}
