import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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
      },
    });

    if (!empresa) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    // Mascarar a API Key para segurança (mostra primeiros e últimos caracteres)
    const apiKeyMascarada = empresa.llmApiKey
      ? empresa.llmApiKey.substring(0, 8) + '...' + empresa.llmApiKey.substring(empresa.llmApiKey.length - 4)
      : null;

    return NextResponse.json({
      success: true,
      llmApiKey: empresa.llmApiKey,
      llmApiKeyMascarada: apiKeyMascarada,
      llmModel: empresa.llmModel,
      temApiKey: !!empresa.llmApiKey,
      modeloPadrao: process.env.LLM_MODEL || 'gemini-2.5-flash-lite',
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
    const { empresaId, llmApiKey, llmModel } = body;

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId é obrigatório' }, { status: 400 });
    }

    // Verificar se a empresa existe
    const empresaExistente = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { id: true },
    });

    if (!empresaExistente) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    // Preparar dados para atualização
    const dadosAtualizacao: Record<string, string | null> = {};

    // API Key: permitir limpar (enviar string vazia) ou definir nova
    if (llmApiKey !== undefined && llmApiKey !== null) {
      const keyTrimmed = llmApiKey.trim();
      dadosAtualizacao.llmApiKey = keyTrimmed === '' ? null : keyTrimmed;
    }

    // Modelo: permitir limpar ou definir
    if (llmModel !== undefined && llmModel !== null) {
      const modelTrimmed = llmModel.trim();
      dadosAtualizacao.llmModel = modelTrimmed === '' ? null : modelTrimmed;
    }

    // Atualizar no banco
    const empresaAtualizada = await prisma.empresa.update({
      where: { id: empresaId },
      data: dadosAtualizacao,
      select: {
        id: true,
        llmApiKey: true,
        llmModel: true,
      },
    });

    return NextResponse.json({
      success: true,
      llmModel: empresaAtualizada.llmModel,
      temApiKey: !!empresaAtualizada.llmApiKey,
      mensagem: 'Configurações salvas com sucesso',
    });
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
