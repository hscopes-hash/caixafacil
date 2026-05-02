import { NextRequest, NextResponse } from 'next/server';
import { callAI, loadEmpresaAIConfig } from '@/lib/ai-vision';
import { detectProvider } from '@/lib/zhipu-auth';
import { enforcePlan } from '@/lib/plan-enforcement';

// Identificar máquina pelo código na etiqueta da foto
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imagem, codigosMaquinas, model: bodyModel, empresaId } = body;

    if (!imagem) {
      return NextResponse.json({ error: 'Imagem é obrigatória' }, { status: 400 });
    }

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId é obrigatório' }, { status: 400 });
    }

    if (!codigosMaquinas || !Array.isArray(codigosMaquinas) || codigosMaquinas.length === 0) {
      return NextResponse.json({ error: 'Lista de códigos de máquinas é obrigatória' }, { status: 400 });
    }

    if (!imagem.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Formato de imagem inválido.' }, { status: 400 });
    }

    const planCheck = await enforcePlan(empresaId, { feature: 'recIA' }, request);
    if (planCheck.error) return NextResponse.json({ error: planCheck.error }, { status: 403 });

    // Buscar configurações de IA da empresa
    const { llmModel, llmApiKey } = await loadEmpresaAIConfig(empresaId, bodyModel?.trim());

    if (!llmApiKey) {
      return NextResponse.json(
        { error: 'API Key não configurada. Configure nas Configurações do sistema.' },
        { status: 400 }
      );
    }

    const model = llmModel;

    console.log(`[IDENTIFICAR-LOTE] Modelo: ${model} | Provedor: ${detectProvider(model)}`);

    const listaCodigos = codigosMaquinas.map((c: string) => `"${c}"`).join(', ');

    const prompt = `Analise esta foto de uma máquina de entretenimento.

Sua ÚNICA tarefa: identificar o código da máquina que aparece em uma ETIQUETA ou ADESIVO na foto.

CÓDIGOS POSSÍVEIS (escolha EXATAMENTE um): [${listaCodigos}]

PROCEDIMENTO:
1. Procure por uma etiqueta, adesivo ou texto impresso na foto que contenha um dos códigos acima.
2. Compare com a lista de códigos possíveis.
3. Retorne o código que melhor corresponde ao encontrado na etiqueta.

Responda APENAS com este JSON (sem markdown, sem explicações):
{"codigoMaquina": "CODIGO_EXATO", "confianca": PERCENTUAL_0_A_100, "observacoes": "texto breve sobre onde encontrou a etiqueta"}`;

    console.log(`[IDENTIFICAR] Tentando modelo: ${model}`);
    const result = await callAI(prompt, imagem, llmApiKey, model, {
      temperature: 0.05,
      maxTokens: 150,
      jsonMode: true,
      responseFormat: true,
    });
    const content = result.content;

    let resultado;
    try {
      let cleanContent = content
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();

      const jsonMatch = cleanContent.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
      if (jsonMatch) {
        resultado = JSON.parse(jsonMatch[0]);
      } else {
        resultado = JSON.parse(cleanContent);
      }
    } catch {
      const codigoMatch = content.match(/"codigoMaquina"\s*:\s*"([^"]+)"/i);
      if (codigoMatch) {
        resultado = {
          codigoMaquina: codigoMatch[1],
          confianca: 50,
          observacoes: 'Extraído por regex (JSON inválido)',
        };
      } else {
        const trecho = content.substring(0, 200).replace(/\n/g, ' ');
        console.error('[IDENTIFICAR] Falha ao parsear resposta da IA:', content.substring(0, 500));
        return NextResponse.json(
          { error: `A IA não retornou um formato válido. Resposta: ${trecho}` },
          { status: 500 }
        );
      }
    }

    const codigoIdentificado = (resultado.codigoMaquina || '').toString().trim().toUpperCase();
    const codigoEncontrado = codigosMaquinas.find(
      (c: string) => c.toUpperCase() === codigoIdentificado
    );

    return NextResponse.json({
      success: true,
      codigoMaquina: codigoEncontrado || codigoIdentificado,
      codigoReconhecido: !!codigoEncontrado,
      confianca: typeof resultado.confianca === 'number' ? resultado.confianca : 0,
      observacoes: resultado.observacoes || '',
      provider: result.provider,
      model,
    });
  } catch (error) {
    console.error('Erro ao identificar máquina:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: `Erro: ${errorMessage}` }, { status: 500 });
  }
}
