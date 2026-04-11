import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// POST - Testar conexão com a API de IA
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { empresaId } = body;

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId é obrigatório' }, { status: 400 });
    }

    // Buscar configurações da empresa
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { llmApiKey: true, llmModel: true },
    });

    if (!empresa) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    // Prioridade: empresa config > env
    const apiKey = empresa.llmApiKey?.trim() || process.env.LLM_API_KEY?.trim();
    const model = empresa.llmModel?.trim() || process.env.LLM_MODEL?.trim() || 'gemini-2.5-flash-lite';

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Nenhuma API Key configurada (nem empresa nem sistema)' },
        { status: 400 }
      );
    }

    // Teste simples: chamada à API Gemini com prompt mínimo
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: 'Responda APENAS com a palavra "OK".' },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 10,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `Erro ${response.status}`;

      try {
        const errorJson = JSON.parse(errorText);
        const apiMsg = errorJson?.error?.message;

        if (response.status === 401 || response.status === 403) {
          errorMsg = 'API Key inválida ou sem permissão';
        } else if (response.status === 404) {
          errorMsg = `Modelo "${model}" não encontrado`;
        } else if (response.status === 429) {
          errorMsg = 'Limite de requisições atingido. Tente novamente em instantes.';
        } else if (apiMsg) {
          errorMsg = apiMsg;
        }
      } catch {
        errorMsg = `Erro ${response.status}: ${errorText.substring(0, 200)}`;
      }

      return NextResponse.json({ error: errorMsg }, { status: 400 });
    }

    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    return NextResponse.json({
      success: true,
      mensagem: `Conexão OK! Modelo: ${model}`,
      modelo: model,
      apiKeyFonte: empresa.llmApiKey ? 'personalizada' : 'sistema',
    });
  } catch (error) {
    console.error('Erro ao testar conexão:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: `Erro de conexão: ${errorMessage}` }, { status: 500 });
  }
}
