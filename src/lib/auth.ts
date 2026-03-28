import { db } from '@/lib/db';
import { Usuario, Empresa } from '@prisma/client';

export type { Usuario, Empresa };

// Criptografia simples para senha (em produção usar bcrypt)
export async function hashSenha(senha: string): Promise<string> {
  // Para produção, usar bcrypt ou similar
  const encoder = new TextEncoder();
  const data = encoder.encode(senha + 'machines-gestao-salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function verificarSenha(senha: string, hash: string): Promise<boolean> {
  const senhaHash = await hashSenha(senha);
  return senhaHash === hash;
}

export async function autenticarUsuario(email: string, senha: string, empresaId: string): Promise<{ usuario: Usuario; empresa: Empresa } | null> {
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

  if (!usuario) {
    return null;
  }

  const senhaValida = await verificarSenha(senha, usuario.senha);

  if (!senhaValida) {
    return null;
  }

  // Atualizar último acesso
  await db.usuario.update({
    where: { id: usuario.id },
    data: { ultimoAcesso: new Date() },
  });

  const { senha: _, ...usuarioSemSenha } = usuario;
  return { usuario: usuarioSemSenha as Usuario, empresa: usuario.empresa };
}

export function temPermissao(nivelAcesso: string, acaoRequerida: string[]): boolean {
  const permissoes: Record<string, string[]> = {
    ADMINISTRADOR: ['all'],
    SUPERVISOR: ['view', 'create', 'edit', 'reports'],
    OPERADOR: ['view', 'edit'],
  };

  const permissoesUsuario = permissoes[nivelAcesso] || [];
  
  if (permissoesUsuario.includes('all')) return true;
  
  return acaoRequerida.every(acao => permissoesUsuario.includes(acao));
}

export function isAdmin(nivelAcesso: string): boolean {
  return nivelAcesso === 'ADMINISTRADOR';
}

export function isSupervisor(nivelAcesso: string): boolean {
  return nivelAcesso === 'SUPERVISOR' || nivelAcesso === 'ADMINISTRADOR';
}
