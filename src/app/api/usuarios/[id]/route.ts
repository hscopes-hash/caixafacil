import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Buscar usuário por ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const usuario = await db.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        foto: true,
        ativo: true,
        nivelAcesso: true,
        ultimoAcesso: true,
        createdAt: true,
        empresa: {
          select: {
            id: true,
            nome: true,
          },
        },
      },
    });

    if (!usuario) {
      return NextResponse.json(
        { error: 'Usuário não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json(usuario);
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar usuário' },
      { status: 500 }
    );
  }
}

// Atualizar usuário
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { nome, email, senha, telefone, nivelAcesso, ativo } = body;

    const data: Record<string, unknown> = {};

    if (nome) data.nome = nome;
    if (email) data.email = email;
    if (telefone !== undefined) data.telefone = telefone;
    if (nivelAcesso) data.nivelAcesso = nivelAcesso;
    if (ativo !== undefined) data.ativo = ativo;
    if (senha) {
      const encoder = new TextEncoder();
      const hashData = encoder.encode(senha + 'machines-gestao-salt');
      const hashBuffer = await crypto.subtle.digest('SHA-256', hashData);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      data.senha = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    const usuario = await db.usuario.update({
      where: { id },
      data,
      select: {
        id: true,
        nome: true,
        email: true,
        telefone: true,
        ativo: true,
        nivelAcesso: true,
        ultimoAcesso: true,
      },
    });

    return NextResponse.json(usuario);
  } catch (error) {
    console.error('Erro ao atualizar usuário:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar usuário' },
      { status: 500 }
    );
  }
}

// Excluir usuário
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    await db.usuario.delete({
      where: { id },
    });

    return NextResponse.json({ message: 'Usuário excluído com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir usuário:', error);
    return NextResponse.json(
      { error: 'Erro ao excluir usuário' },
      { status: 500 }
    );
  }
}
