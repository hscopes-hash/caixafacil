import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Função para hash de senha
async function hashSenha(senha: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(senha + 'machines-gestao-salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Criar Super Admin
export async function POST(request: NextRequest) {
  try {
    // Verificar se já existe
    const existente = await db.usuario.findFirst({
      where: { email: 'hscopes@gmail.com' },
    });

    if (existente) {
      return NextResponse.json({
        message: 'Super Admin já existe',
        usuario: { email: existente.email, nome: existente.nome },
      });
    }

    // Buscar primeira empresa
    const empresa = await db.empresa.findFirst();

    if (!empresa) {
      return NextResponse.json(
        { error: 'Nenhuma empresa cadastrada. Execute o seed primeiro.' },
        { status: 400 }
      );
    }

    // Criar Super Admin
    const senhaHash = await hashSenha('Omega93');
    const superAdmin = await db.usuario.create({
      data: {
        nome: 'Super Administrador',
        email: 'hscopes@gmail.com',
        senha: senhaHash,
        telefone: '(11) 99999-0000',
        nivelAcesso: 'ADMINISTRADOR',
        empresaId: empresa.id,
      },
    });

    return NextResponse.json({
      message: 'Super Admin criado com sucesso!',
      usuario: {
        email: superAdmin.email,
        senha: 'Omega93',
        nome: superAdmin.nome,
      },
    });
  } catch (error) {
    console.error('Erro ao criar Super Admin:', error);
    return NextResponse.json(
      { error: 'Erro ao criar Super Admin' },
      { status: 500 }
    );
  }
}
