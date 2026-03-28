import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// Email do super admin (acesso total sem vínculo com empresa)
const SUPER_ADMIN_EMAIL = 'hscopes@gmail.com';

// Função para hash de senha
async function hashSenha(senha: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(senha + 'machines-gestao-salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, senha, empresaId } = body;

    if (!email || !senha) {
      return NextResponse.json(
        { error: 'Email e senha são obrigatórios' },
        { status: 400 }
      );
    }

    const senhaHash = await hashSenha(senha);

    // Verificar se é super admin
    if (email === SUPER_ADMIN_EMAIL) {
      // Buscar o usuário super admin em qualquer empresa
      const superAdmin = await db.usuario.findFirst({
        where: {
          email: SUPER_ADMIN_EMAIL,
          ativo: true,
        },
        include: {
          empresa: true,
        },
      });

      if (!superAdmin || superAdmin.senha !== senhaHash) {
        return NextResponse.json(
          { error: 'Credenciais inválidas' },
          { status: 401 }
        );
      }

      // Atualizar último acesso
      await db.usuario.update({
        where: { id: superAdmin.id },
        data: { ultimoAcesso: new Date() },
      });

      // Gerar token simples
      const token = Buffer.from(`${superAdmin.id}:${Date.now()}`).toString('base64');

      const { senha: _, ...usuarioSemSenha } = superAdmin;

      // Se selecionou uma empresa específica, buscar essa empresa
      if (empresaId) {
        const empresaSelecionada = await db.empresa.findUnique({
          where: { id: empresaId },
        });

        if (empresaSelecionada) {
          return NextResponse.json({
            usuario: usuarioSemSenha,
            empresa: empresaSelecionada,
            token,
            isSuperAdmin: true,
          });
        }
      }

      // Se não selecionou empresa, retorna a empresa original ou null (modo gestão)
      return NextResponse.json({
        usuario: usuarioSemSenha,
        empresa: superAdmin.empresa,
        token,
        isSuperAdmin: true,
      });
    }

    // Login normal - precisa de empresa
    if (!empresaId) {
      return NextResponse.json(
        { error: 'Selecione uma empresa para fazer login' },
        { status: 400 }
      );
    }

    const usuario = await db.usuario.findFirst({
      where: {
        email,
        empresaId,
        ativo: true,
      },
      include: {
        empresa: true,
      },
    });

    if (!usuario || usuario.senha !== senhaHash) {
      return NextResponse.json(
        { error: 'Credenciais inválidas' },
        { status: 401 }
      );
    }

    if (usuario.empresa.bloqueada) {
      return NextResponse.json(
        { error: 'Empresa bloqueada. Entre em contato com o suporte.' },
        { status: 403 }
      );
    }

    // Atualizar último acesso
    await db.usuario.update({
      where: { id: usuario.id },
      data: { ultimoAcesso: new Date() },
    });

    // Gerar token simples (em produção usar JWT)
    const token = Buffer.from(`${usuario.id}:${Date.now()}`).toString('base64');

    const { senha: _, ...usuarioSemSenha } = usuario;

    return NextResponse.json({
      usuario: usuarioSemSenha,
      empresa: usuario.empresa,
      token,
    });
  } catch (error) {
    console.error('Erro no login:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
