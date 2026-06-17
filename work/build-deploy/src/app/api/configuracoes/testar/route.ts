import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getVertexAccessToken, getVertexModel, VERTEX_LOCATIONS, tryVertexAIRegion } from '@/lib/ai-vision';

// POST - Testar conexão com a API de IA (Vertex AI only)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { empresaId, llmModel: bodyModel } = body;

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId é obrigatório' }, { status: 400 });
    }

    // Determinar modelo: corpo > ConfigSaaS > padrao
    const defaultModel = 'gemini-2.5-flash';
    let model = bodyModel?.trim() || defaultModel;

    try {
      const configRows = await db.$queryRawUnsafe(
        `SELECT "llmModel" FROM "config_saas" LIMIT 1`
      ) as any[];
      const config = configRows?.[0];
      if (config?.llmModel?.trim() && !bodyModel?.trim()) {
        model = config.llmModel.trim();
      }
    } catch {}

    console.log('=== TESTE CONEXÃO (Vertex AI) ===');
    console.log('Modelo:', model);
    console.log('==================================');

    let accessToken: string;
    try {
      accessToken = await getVertexAccessToken();
    } catch (err) {
      return NextResponse.json(
        { error: 'Falha ao obter token de acesso do Vertex AI. Verifique as credenciais de serviço configuradas.' },
        { status: 400 }
      );
    }

    const vertexModel = getVertexModel(model);

    const contents = [{ parts: [{ text: 'Responda APENAS com a palavra "OK".' }] }];
    const generationConfig = { temperature: 0, maxOutputTokens: 10 };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let lastError: string | null = null;
    let result = null;

    try {
      for (const region of VERTEX_LOCATIONS) {
        const r = await tryVertexAIRegion(region, accessToken, vertexModel, contents, generationConfig, controller.signal);
        if (r) {
          result = r;
          break;
        }
        lastError = `[VERTEX ${region}] Falhou`;
      }
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError?.name === 'AbortError') {
        return NextResponse.json(
          { error: `Tempo esgotado (30s). O modelo "${model}" pode estar lento ou indisponível no momento.` },
          { status: 400 }
        );
      }
      return NextResponse.json({ error: `Erro Vertex AI: ${fetchError.message?.substring(0, 120)}` }, { status: 502 });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!result) {
      return NextResponse.json(
        { error: `Vertex AI falhou em todas as regioes (${VERTEX_LOCATIONS.join(', ')}). Ultimo erro: ${lastError}` },
        { status: 400 }
      );
    }

    const content = result.content;

    if (!content) {
      return NextResponse.json(
        { error: 'A Vertex AI respondeu, mas sem conteúdo. Verifique o modelo selecionado.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      mensagem: `Conexão OK! Vertex AI - ${model}`,
      modelo: model,
    });
  } catch (error) {
    console.error('Erro ao testar conexão:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: `Erro de conexão: ${errorMessage}` }, { status: 500 });
  }
}
