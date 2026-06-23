import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { SUPER_ADMIN_EMAIL } from '@/lib/saas-config';

// Sync schema silencioso: garante colunas novas sem travar o login
async function ensureSchema() {
  try {
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "pixChaveTipo" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "pixChave" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "pixMerchantNome" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "pixMerchantCidade" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "pixBancoNome" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "uiScale" DOUBLE PRECISION DEFAULT 1.0`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "impressoraTipo" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "impressoraPreset" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "impressoraConexao" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "impressoraServicoUUID" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "impressoraCharUUID" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "impressoraChunkSize" INTEGER`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "mercadopagoAccessToken" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "mercadopagoPublicKey" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS "whatsapp" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS "acertoPercentual" INTEGER DEFAULT 50`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "permiteEditarLeituraAnterior" BOOLEAN DEFAULT false`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "cieloMerchantId" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "cieloMerchantKey" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "cieloAmbiente" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "cieloClientId" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "cieloClientSecret" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "cieloMcc" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "cieloEstabelecimento" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS "formaCobranca" TEXT`);
    await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "telegramBotToken" TEXT`);
  await db.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "permitirDigitacaoLeitura" BOOLEAN DEFAULT true`);
    await db.$executeRawUnsafe(`ALTER TABLE clientes ADD COLUMN IF NOT EXISTS "telegramGroupId" TEXT`);
  } catch (e) { /* silencioso */ }
}

async function hashSenha(senha: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(senha + 'machines-gestao-salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function POST(request: NextRequest) {
  let step = 'init';
  try {
    step = 'parse-body';
    const body = await request.json();
    const { email, senha, empresaId } = body;
    // Normalizar email (trim + lowercase) para casar com como é salvo no banco
    const emailNorm = (email || '').trim().toLowerCase();

    if (!email || !senha) {
      return NextResponse.json({ error: 'Email e senha são obrigatórios' }, { status: 400 });
    }

    // Garantir schema atualizado antes de qualquer query
    step = 'ensure-schema';
    await ensureSchema();

    step = 'hash';
    const senhaHash = await hashSenha(senha);

    // Super admin
    if (emailNorm === SUPER_ADMIN_EMAIL) {
      step = 'find-super-admin';
      const superAdmin = await db.usuario.findFirst({
        where: { email: SUPER_ADMIN_EMAIL, ativo: true },
        select: { id: true, nome: true, email: true, telefone: true, foto: true, ativo: true, nivelAcesso: true, empresaId: true, ultimoAcesso: true, senha: true, createdAt: true, updatedAt: true },
      });

      if (!superAdmin || superAdmin.senha !== senhaHash) {
        return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
      }

      step = 'update-acesso';
      await db.usuario.update({
        where: { id: superAdmin.id },
        data: { ultimoAcesso: new Date() },
      });

      step = 'build-token';
      const token = Buffer.from(`${superAdmin.id}:${Date.now()}`).toString('base64');
      const { senha: _, ...usuarioSemSenha } = superAdmin;

      // Buscar empresa: priorizar empresaId do body, fallback superAdmin.empresaId
      step = 'find-empresa';
      let empresa = null;
      const targetEmpresaId = (empresaId && typeof empresaId === 'string' && empresaId.trim().length > 0)
        ? empresaId.trim()
        : (superAdmin.empresaId || null);

      if (targetEmpresaId) {
        empresa = await db.empresa.findUnique({ where: { id: targetEmpresaId } });
      }

      step = 'return';
      return NextResponse.json({ usuario: usuarioSemSenha, empresa, token, isSuperAdmin: true });
    }

    // Login normal
    if (!empresaId) {
      return NextResponse.json({ error: 'Selecione uma empresa para fazer login' }, { status: 400 });
    }

    step = 'find-user';
    const usuario = await db.usuario.findFirst({
      where: { email: emailNorm, empresaId, ativo: true },
      select: { id: true, nome: true, email: true, telefone: true, foto: true, ativo: true, nivelAcesso: true, empresaId: true, ultimoAcesso: true, senha: true, createdAt: true, updatedAt: true },
    });

    if (!usuario || usuario.senha !== senhaHash) {
      return NextResponse.json({ error: 'Credenciais inválidas' }, { status: 401 });
    }

    step = 'find-empresa';
    const empresa = await db.empresa.findUnique({ where: { id: usuario.empresaId } });

    if (empresa && empresa.bloqueada) {
      return NextResponse.json({ error: 'Empresa bloqueada.' }, { status: 403 });
    }

    step = 'update-acesso';
    await db.usuario.update({
      where: { id: usuario.id },
      data: { ultimoAcesso: new Date() },
    });

    step = 'build-token';
    const token = Buffer.from(`${usuario.id}:${Date.now()}`).toString('base64');
    const { senha: _, ...usuarioSemSenha } = usuario;

    return NextResponse.json({ usuario: usuarioSemSenha, empresa, token });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error(`[LOGIN ERROR] step=${step}`, msg, error);
    return NextResponse.json(
      { error: `Erro interno (${step})`, detail: msg },
      { status: 500 }
    );
  }
}
