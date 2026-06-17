import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET - Buscar config global do SaaS (assinaturas)
export async function GET() {
  try {
    // Auto-sync: garantir que a tabela existe com colunas de IA
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "config_saas" (
          "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
          "mpAccessToken" TEXT,
          "mpPublicKey" TEXT,
          "pixChaveTipo" TEXT,
          "pixChave" TEXT,
          "pixMerchantNome" TEXT,
          "pixMerchantCidade" TEXT,
          "pixBancoNome" TEXT,
          "geminiApiKey" TEXT,
          "llmModel" TEXT,
          "permissoes" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch (e) {
      // Tabela ja existe ou erro ignoravel
    }

    // Garantir colunas novas existam (migration inline)
    try { await db.$executeRawUnsafe(`ALTER TABLE "config_saas" ADD COLUMN IF NOT EXISTS "geminiApiKey" TEXT`); } catch {}
    try { await db.$executeRawUnsafe(`ALTER TABLE "config_saas" ADD COLUMN IF NOT EXISTS "llmModel" TEXT`); } catch {}
    try { await db.$executeRawUnsafe(`ALTER TABLE "config_saas" ADD COLUMN IF NOT EXISTS "permissoes" TEXT`); } catch {}

    // Garantir que existe pelo menos uma row
    try {
      await db.$executeRawUnsafe(`
        INSERT INTO "config_saas" ("id")
        SELECT 'default'
        WHERE NOT EXISTS (SELECT 1 FROM "config_saas" LIMIT 1)
      `);
    } catch (e) {
      // Row ja existe
    }

    const config = await db.$queryRawUnsafe(
      `SELECT * FROM "config_saas" LIMIT 1`
    ) as any[];

    const c = config[0] || {};

    return NextResponse.json({
      success: true,
      mpAccessToken: c.mpAccessToken || '',
      mpPublicKey: c.mpPublicKey || '',
      pixChaveTipo: c.pixChaveTipo || '',
      pixChave: c.pixChave || '',
      pixMerchantNome: c.pixMerchantNome || '',
      pixMerchantCidade: c.pixMerchantCidade || '',
      pixBancoNome: c.pixBancoNome || '',
      geminiApiKey: c.geminiApiKey || '',
      llmModel: c.llmModel || '',
    });
  } catch (error) {
    console.error('[SAAS-CONFIG] Erro ao buscar config:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// PUT - Atualizar config global do SaaS (assinaturas)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { mpAccessToken, mpPublicKey, pixChaveTipo, pixChave, pixMerchantNome, pixMerchantCidade, pixBancoNome, geminiApiKey, llmModel } = body;

    // Auto-sync: garantir que a tabela existe com colunas de IA
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "config_saas" (
          "id" TEXT NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
          "mpAccessToken" TEXT,
          "mpPublicKey" TEXT,
          "pixChaveTipo" TEXT,
          "pixChave" TEXT,
          "pixMerchantNome" TEXT,
          "pixMerchantCidade" TEXT,
          "pixBancoNome" TEXT,
          "geminiApiKey" TEXT,
          "llmModel" TEXT,
          "permissoes" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
      `);
    } catch (e) {
      // Tabela ja existe
    }

    try { await db.$executeRawUnsafe(`ALTER TABLE "config_saas" ADD COLUMN IF NOT EXISTS "geminiApiKey" TEXT`); } catch {}
    try { await db.$executeRawUnsafe(`ALTER TABLE "config_saas" ADD COLUMN IF NOT EXISTS "llmModel" TEXT`); } catch {}
    try { await db.$executeRawUnsafe(`ALTER TABLE "config_saas" ADD COLUMN IF NOT EXISTS "permissoes" TEXT`); } catch {}

    // Garantir que existe pelo menos uma row para o UPDATE afetar
    try {
      await db.$executeRawUnsafe(`
        INSERT INTO "config_saas" ("id")
        SELECT 'default'
        WHERE NOT EXISTS (SELECT 1 FROM "config_saas" LIMIT 1)
      `);
    } catch (e) {
      // Row ja existe
    }

    await db.$executeRawUnsafe(`
      UPDATE "config_saas" SET
        "mpAccessToken" = $1,
        "mpPublicKey" = $2,
        "pixChaveTipo" = $3,
        "pixChave" = $4,
        "pixMerchantNome" = $5,
        "pixMerchantCidade" = $6,
        "pixBancoNome" = $7,
        "geminiApiKey" = $8,
        "llmModel" = $9,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = (SELECT "id" FROM "config_saas" LIMIT 1)
    `,
      mpAccessToken?.trim() || null,
      mpPublicKey?.trim() || null,
      pixChaveTipo?.trim() || null,
      pixChave?.trim() || null,
      pixMerchantNome?.trim() || null,
      pixMerchantCidade?.trim() || null,
      pixBancoNome?.trim() || null,
      geminiApiKey?.trim() || null,
      llmModel?.trim() || null
    );

    return NextResponse.json({
      success: true,
      mensagem: 'Configuracoes SaaS salvas com sucesso',
    });
  } catch (error) {
    console.error('[SAAS-CONFIG] Erro ao salvar config:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
