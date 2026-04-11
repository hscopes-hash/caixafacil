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
        llmModel: true,
        llmModelFallback: true,
      },
    });

    if (!empresa) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      llmModel: empresa.llmModel,
      llmModelFallback: empresa.llmModelFallback,
      modeloPadrao: process.env.LLM_MODEL || 'gemini-2.5-flash-lite',
      temGeminiKey: !!process.env.LLM_API_KEY,
      temGlmKey: !!(process.env.LLM_API_KEY_GLM || process.env.LLM_API_KEY),
    });
  } catch (error) {
    console.error('Erro ao buscar configurações:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}

// PUT - Atualizar configurações de IA da empresa (somente modelos)
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { empresaId, llmModel, llmModelFallback } = body;

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

    if (llmModel !== undefined && llmModel !== null) {
      const modelTrimmed = llmModel.trim();
      dadosAtualizacao.llmModel = modelTrimmed === '' ? null : modelTrimmed;
    }
    if (llmModelFallback !== undefined && llmModelFallback !== null) {
      const modelTrimmed = llmModelFallback.trim();
      dadosAtualizacao.llmModelFallback = modelTrimmed === '' ? null : modelTrimmed;
    }

    const empresaAtualizada = await prisma.empresa.update({
      where: { id: empresaId },
      data: dadosAtualizacao,
      select: {
        id: true,
        llmModel: true,
        llmModelFallback: true,
      },
    });

    return NextResponse.json({
      success: true,
      llmModel: empresaAtualizada.llmModel,
      llmModelFallback: empresaAtualizada.llmModelFallback,
      mensagem: 'Configurações salvas com sucesso',
    });
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
}
