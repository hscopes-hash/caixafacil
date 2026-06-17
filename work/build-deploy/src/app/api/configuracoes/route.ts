import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function maskApiKey(key?: string | null): string {
  if (!key || key.length < 8) return '';
  return key.substring(0, 4) + '****' + key.substring(key.length - 4);
}

// GET - Buscar configurações de IA da empresa
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const empresaId = searchParams.get('empresaId');

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId é obrigatório' }, { status: 400 });
    }

    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: {
        id: true,
        nome: true,
        llmApiKey: true,
        llmModel: true,
        llmApiKeyGemini: true,
        llmApiKeyGlm: true,
        llmApiKeyOpenrouter: true,
        mercadopagoAccessToken: true,
        mercadopagoPublicKey: true,
        impressoraTipo: true,
        impressoraPreset: true,
        impressoraConexao: true,
        impressoraServicoUUID: true,
        impressoraCharUUID: true,
        impressoraChunkSize: true,
      },
    });

    if (!empresa) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    // Indica se as configs estão centralizadas via ENV vars (SaaS)
    const envGeminiKey = !!process.env.GEMINI_API_KEY;
    const envLlmModel = !!process.env.LLM_MODEL;
    const envMpAccess = !!process.env.MERCADOPAGO_ACCESS_TOKEN;
    const envMpPublic = !!process.env.MERCADOPAGO_PUBLIC_KEY;

    // Auto-sync: garantir que colunas existem
    try {
      await prisma.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "uiScale" DOUBLE PRECISION DEFAULT 1.0`);
      await prisma.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "pixChaveTipo" VARCHAR(255)`);
      await prisma.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "pixChave" VARCHAR(255)`);
      await prisma.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "pixMerchantNome" VARCHAR(255)`);
      await prisma.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "pixMerchantCidade" VARCHAR(255)`);
      await prisma.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "pixBancoNome" VARCHAR(255)`);
      await prisma.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "permiteEditarLeituraAnterior" BOOLEAN DEFAULT false`);
      await prisma.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "cieloMerchantId" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "cieloMerchantKey" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "cieloAmbiente" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "cieloClientId" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "cieloClientSecret" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "cieloMcc" TEXT`);
      await prisma.$executeRawUnsafe(`ALTER TABLE empresas ADD COLUMN IF NOT EXISTS "cieloEstabelecimento" TEXT`);
    } catch (e) {
      // Colunas já existem ou erro ignorável
    }

    return NextResponse.json({
      success: true,
      llmApiKey: empresa.llmApiKey || '',
      llmModel: empresa.llmModel,
      llmApiKeyGemini: empresa.llmApiKeyGemini || '',
      llmApiKeyGlm: empresa.llmApiKeyGlm || '',
      llmApiKeyOpenrouter: empresa.llmApiKeyOpenrouter || '',
      llmApiKeyMasked: maskApiKey(empresa.llmApiKey),
      mercadopagoAccessToken: empresa.mercadopagoAccessToken || '',
      mercadopagoPublicKey: empresa.mercadopagoPublicKey || '',
      // PIX Banco (QR Code estático EMV COB)
      pixChaveTipo: (empresa as any).pixChaveTipo || '',
      pixChave: (empresa as any).pixChave || '',
      pixMerchantNome: (empresa as any).pixMerchantNome || '',
      pixMerchantCidade: (empresa as any).pixMerchantCidade || '',
      pixBancoNome: (empresa as any).pixBancoNome || '',
      modeloPadrao: process.env.LLM_MODEL || 'gemini-3.1-flash-lite',
      impressoraTipo: empresa.impressoraTipo || null,
      impressoraPreset: empresa.impressoraPreset || null,
      impressoraConexao: empresa.impressoraConexao || null,
      impressoraServicoUUID: empresa.impressoraServicoUUID || null,
      impressoraCharUUID: empresa.impressoraCharUUID || null,
      impressoraChunkSize: empresa.impressoraChunkSize || null,
      uiScale: (empresa as any).uiScale ?? 1.0,
      permiteEditarLeituraAnterior: (empresa as any).permiteEditarLeituraAnterior ?? false,
      // Cielo
      cieloMerchantId: (empresa as any).cieloMerchantId || '',
      cieloMerchantKey: (empresa as any).cieloMerchantKey || '',
      cieloAmbiente: (empresa as any).cieloAmbiente || 'sandbox',
      cieloClientId: (empresa as any).cieloClientId || '',
      cieloClientSecret: (empresa as any).cieloClientSecret || '',
      cieloMcc: (empresa as any).cieloMcc || '',
      cieloEstabelecimento: (empresa as any).cieloEstabelecimento || '',
      // Flags ENV vars
      envConfig: {
        geminiApiKey: envGeminiKey,
        llmModel: envLlmModel,
        mercadopagoAccessToken: envMpAccess,
        mercadopagoPublicKey: envMpPublic,
      },
    });
  } catch (error) {
    console.error('Erro ao buscar configurações:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// PUT - Atualizar configurações de IA da empresa
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { empresaId, llmApiKey, llmModel, llmApiKeyGemini, llmApiKeyGlm, llmApiKeyOpenrouter, mercadopagoAccessToken, mercadopagoPublicKey, pixChaveTipo, pixChave, pixMerchantNome, pixMerchantCidade, pixBancoNome, impressoraTipo, impressoraPreset, impressoraConexao, impressoraServicoUUID, impressoraCharUUID, impressoraChunkSize, uiScale, permiteEditarLeituraAnterior, cieloMerchantId, cieloMerchantKey, cieloAmbiente, cieloClientId, cieloClientSecret, cieloMcc, cieloEstabelecimento } = body;

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId é obrigatório' }, { status: 400 });
    }

    const empresaExistente = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { id: true },
    });

    if (!empresaExistente) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const dadosAtualizacao: Record<string, string | null> = {};

    if (llmApiKey !== undefined && llmApiKey !== null) {
      const trimmed = llmApiKey.trim();
      dadosAtualizacao.llmApiKey = trimmed === '' ? null : trimmed;
    }
    if (llmModel !== undefined && llmModel !== null) {
      const trimmed = llmModel.trim();
      dadosAtualizacao.llmModel = trimmed === '' ? null : trimmed;
    }
    // Salvar keys por provedor para preenchimento automático
    if (llmApiKeyGemini !== undefined && llmApiKeyGemini !== null) {
      const trimmed = llmApiKeyGemini.trim();
      dadosAtualizacao.llmApiKeyGemini = trimmed === '' ? null : trimmed;
    }
    if (llmApiKeyGlm !== undefined && llmApiKeyGlm !== null) {
      const trimmed = llmApiKeyGlm.trim();
      dadosAtualizacao.llmApiKeyGlm = trimmed === '' ? null : trimmed;
    }
    if (llmApiKeyOpenrouter !== undefined && llmApiKeyOpenrouter !== null) {
      const trimmed = llmApiKeyOpenrouter.trim();
      dadosAtualizacao.llmApiKeyOpenrouter = trimmed === '' ? null : trimmed;
    }
    // MercadoPago
    if (mercadopagoAccessToken !== undefined && mercadopagoAccessToken !== null) {
      const trimmed = mercadopagoAccessToken.trim();
      dadosAtualizacao.mercadopagoAccessToken = trimmed === '' ? null : trimmed;
    }
    if (mercadopagoPublicKey !== undefined && mercadopagoPublicKey !== null) {
      const trimmed = mercadopagoPublicKey.trim();
      dadosAtualizacao.mercadopagoPublicKey = trimmed === '' ? null : trimmed;
    }
    // PIX Banco
    if (pixChaveTipo !== undefined && pixChaveTipo !== null) {
      const trimmed = pixChaveTipo.trim();
      dadosAtualizacao.pixChaveTipo = trimmed === '' ? null : trimmed;
    }
    if (pixChave !== undefined && pixChave !== null) {
      const trimmed = pixChave.trim();
      dadosAtualizacao.pixChave = trimmed === '' ? null : trimmed;
    }
    if (pixMerchantNome !== undefined && pixMerchantNome !== null) {
      const trimmed = pixMerchantNome.trim();
      dadosAtualizacao.pixMerchantNome = trimmed === '' ? null : trimmed;
    }
    if (pixMerchantCidade !== undefined && pixMerchantCidade !== null) {
      const trimmed = pixMerchantCidade.trim();
      dadosAtualizacao.pixMerchantCidade = trimmed === '' ? null : trimmed;
    }
    if (pixBancoNome !== undefined && pixBancoNome !== null) {
      const trimmed = pixBancoNome.trim();
      dadosAtualizacao.pixBancoNome = trimmed === '' ? null : trimmed;
    }
    // Impressora
    if (impressoraTipo !== undefined && impressoraTipo !== null) {
      const trimmed = impressoraTipo.trim();
      dadosAtualizacao.impressoraTipo = trimmed === '' ? null : trimmed;
    }
    if (impressoraPreset !== undefined && impressoraPreset !== null) {
      const trimmed = impressoraPreset.trim();
      dadosAtualizacao.impressoraPreset = trimmed === '' ? null : trimmed;
    }
    if (impressoraConexao !== undefined && impressoraConexao !== null) {
      const trimmed = impressoraConexao.trim();
      dadosAtualizacao.impressoraConexao = trimmed === '' ? null : trimmed;
    }
    if (impressoraServicoUUID !== undefined && impressoraServicoUUID !== null) {
      const trimmed = impressoraServicoUUID.trim();
      dadosAtualizacao.impressoraServicoUUID = trimmed === '' ? null : trimmed;
    }
    if (impressoraCharUUID !== undefined && impressoraCharUUID !== null) {
      const trimmed = impressoraCharUUID.trim();
      dadosAtualizacao.impressoraCharUUID = trimmed === '' ? null : trimmed;
    }
    if (impressoraChunkSize !== undefined && impressoraChunkSize !== null) {
      dadosAtualizacao.impressoraChunkSize = typeof impressoraChunkSize === 'number' ? impressoraChunkSize : null;
    }
    // UI Scale (acessibilidade)
    if (uiScale !== undefined && uiScale !== null) {
      const scale = typeof uiScale === 'number' ? Math.min(2.0, Math.max(0.8, uiScale)) : null;
      dadosAtualizacao.uiScale = scale;
    }
    // Permissão edição leitura anterior
    if (permiteEditarLeituraAnterior !== undefined && permiteEditarLeituraAnterior !== null) {
      dadosAtualizacao.permiteEditarLeituraAnterior = !!permiteEditarLeituraAnterior;
    }
    // Cielo
    if (cieloMerchantId !== undefined && cieloMerchantId !== null) {
      const trimmed = cieloMerchantId.trim();
      dadosAtualizacao.cieloMerchantId = trimmed === '' ? null : trimmed;
    }
    if (cieloMerchantKey !== undefined && cieloMerchantKey !== null) {
      const trimmed = cieloMerchantKey.trim();
      dadosAtualizacao.cieloMerchantKey = trimmed === '' ? null : trimmed;
    }
    if (cieloAmbiente !== undefined && cieloAmbiente !== null) {
      const trimmed = cieloAmbiente.trim();
      dadosAtualizacao.cieloAmbiente = trimmed === '' ? 'sandbox' : trimmed;
    }
    if (cieloClientId !== undefined && cieloClientId !== null) {
      const trimmed = cieloClientId.trim();
      dadosAtualizacao.cieloClientId = trimmed === '' ? null : trimmed;
    }
    if (cieloClientSecret !== undefined && cieloClientSecret !== null) {
      const trimmed = cieloClientSecret.trim();
      dadosAtualizacao.cieloClientSecret = trimmed === '' ? null : trimmed;
    }
    if (cieloMcc !== undefined && cieloMcc !== null) {
      const trimmed = cieloMcc.trim();
      dadosAtualizacao.cieloMcc = trimmed === '' ? null : trimmed;
    }
    if (cieloEstabelecimento !== undefined && cieloEstabelecimento !== null) {
      const trimmed = cieloEstabelecimento.trim();
      dadosAtualizacao.cieloEstabelecimento = trimmed === '' ? null : trimmed;
    }

    const empresaAtualizada = await prisma.empresa.update({
      where: { id: empresaId },
      data: dadosAtualizacao,
      select: {
        id: true,
        llmApiKey: true,
        llmModel: true,
        llmApiKeyGemini: true,
        llmApiKeyGlm: true,
        llmApiKeyOpenrouter: true,
        mercadopagoAccessToken: true,
        mercadopagoPublicKey: true,
        impressoraTipo: true,
        impressoraPreset: true,
        impressoraConexao: true,
        impressoraServicoUUID: true,
        impressoraCharUUID: true,
        impressoraChunkSize: true,
      },
    });

    return NextResponse.json({
      success: true,
      llmApiKey: empresaAtualizada.llmApiKey || '',
      llmModel: empresaAtualizada.llmModel,
      llmApiKeyGemini: empresaAtualizada.llmApiKeyGemini || '',
      llmApiKeyGlm: empresaAtualizada.llmApiKeyGlm || '',
      llmApiKeyOpenrouter: empresaAtualizada.llmApiKeyOpenrouter || '',
      llmApiKeyMasked: maskApiKey(empresaAtualizada.llmApiKey),
      mercadopagoAccessToken: empresaAtualizada.mercadopagoAccessToken || '',
      mercadopagoPublicKey: empresaAtualizada.mercadopagoPublicKey || '',
      // PIX Banco
      pixChaveTipo: (empresaAtualizada as any).pixChaveTipo || '',
      pixChave: (empresaAtualizada as any).pixChave || '',
      pixMerchantNome: (empresaAtualizada as any).pixMerchantNome || '',
      pixMerchantCidade: (empresaAtualizada as any).pixMerchantCidade || '',
      pixBancoNome: (empresaAtualizada as any).pixBancoNome || '',
      mensagem: 'Configurações salvas com sucesso',
      impressoraTipo: empresaAtualizada.impressoraTipo || null,
      impressoraPreset: empresaAtualizada.impressoraPreset || null,
      impressoraConexao: empresaAtualizada.impressoraConexao || null,
      impressoraServicoUUID: empresaAtualizada.impressoraServicoUUID || null,
      impressoraCharUUID: empresaAtualizada.impressoraCharUUID || null,
      impressoraChunkSize: empresaAtualizada.impressoraChunkSize || null,
      uiScale: (empresaAtualizada as any).uiScale ?? 1.0,
      permiteEditarLeituraAnterior: (empresaAtualizada as any).permiteEditarLeituraAnterior ?? false,
      cieloMerchantId: (empresaAtualizada as any).cieloMerchantId || '',
      cieloMerchantKey: (empresaAtualizada as any).cieloMerchantKey || '',
      cieloAmbiente: (empresaAtualizada as any).cieloAmbiente || 'sandbox',
      cieloClientId: (empresaAtualizada as any).cieloClientId || '',
      cieloClientSecret: (empresaAtualizada as any).cieloClientSecret || '',
      cieloMcc: (empresaAtualizada as any).cieloMcc || '',
      cieloEstabelecimento: (empresaAtualizada as any).cieloEstabelecimento || '',
    });
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
