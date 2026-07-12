import { NextRequest, NextResponse } from 'next/server';
import { callAI, loadAIConfig, extractJSON, avaliarNitidez } from '@/lib/ai-vision';
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

    // === VERIFICAÇÃO DE NITIDEZ — recusa fotos borradas/tremidas antes de gastar IA ===
    try {
      const base64Data = imagem.split(',')[1];
      const imgBuffer = Buffer.from(base64Data, 'base64');
      const nitidez = await avaliarNitidez(imgBuffer);
      if (nitidez.ilegivel) {
        console.warn(`[IDENTIFICAR-LOTE] Foto recusada: ${nitidez.motivo}`);
        return NextResponse.json({
          error: nitidez.motivo,
          ilegivel: true,
        }, { status: 422 });
      }
    } catch (err) {
      console.warn('[IDENTIFICAR-LOTE] Verificação de nitidez falhou, continuando:', err);
    }

    const { llmModel } = await loadAIConfig(bodyModel?.trim());
    const model = llmModel;

    console.log(`[IDENTIFICAR-LOTE] Modelo: ${model}`);

    const listaCodigos = codigosMaquinas.map((c: string) => `"${c}"`).join(', ');

    const prompt = `Analise esta foto de uma máquina de entretenimento.

Sua tarefa: verificar se há uma ETIQUETA ou ADESIVO legível na foto e, se sim, identificar o código da máquina.

CÓDIGOS POSSÍVEIS (escolha EXATAMENTE um se a etiqueta for legível): [${listaCodigos}]

PROCEDIMENTO:
1. Verifique se há uma etiqueta, adesivo ou texto impresso legível na foto.
2. Se NÃO houver etiqueta legível, retorne etiquetaLegivel como false.
3. Se houver etiqueta legível, leia o código nela e compare com a lista acima.
4. Se o código lido ESTIVER na lista, retorne codigoMaquina com o código exato e etiquetaLegivel como true.
5. Se o código lido NÃO ESTIVER na lista, retorne codigoLido com o código que você leu e etiquetaLegivel como true.

Responda APENAS com este JSON (sem markdown, sem explicações):
{"etiquetaLegivel": true_ou_false, "codigoMaquina": "CODIGO_DA_LISTA_OU_VAZIO", "codigoLido": "CODIGO_QUE_VOCE_LEU_OU_VAZIO", "confianca": PERCENTUAL_0_A_100, "observacoes": "texto breve"}`;

    console.log(`[IDENTIFICAR] Tentando modelo: ${model}`);
    const result = await callAI(prompt, imagem, model, {
      temperature: 0.05,
      maxTokens: 4096,
      jsonMode: true,
    });
    const content = result.content;

    // Extrair JSON da resposta (parser robusto com balanceamento de chaves)
    let resultado = extractJSON(content).parsed;

    if (!resultado) {
      const codigoMatch = content.match(/"codigoMaquina"\s*:\s*"([^"]+)"/i);
      if (codigoMatch) {
        resultado = {
          etiquetaLegivel: true,
          codigoMaquina: codigoMatch[1],
          codigoLido: codigoMatch[1],
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

    const etiquetaLegivel = resultado.etiquetaLegivel === true;
    const codigoIdentificado = (resultado.codigoMaquina || '').toString().trim().toUpperCase();
    const codigoLido = (resultado.codigoLido || resultado.codigoMaquina || '').toString().trim().toUpperCase();
    const codigoEncontrado = codigosMaquinas.find(
      (c: string) => c.toUpperCase() === codigoIdentificado
    );

    let motivoNaoReconhecido: string | undefined;
    if (!etiquetaLegivel) {
      motivoNaoReconhecido = 'Sem etiqueta ou ilegível';
    } else if (!codigoEncontrado) {
      motivoNaoReconhecido = 'Máquina não pertence a esse cliente';
    }

    return NextResponse.json({
      success: true,
      codigoMaquina: codigoEncontrado || codigoIdentificado || codigoLido,
      codigoLido,
      codigoReconhecido: !!codigoEncontrado,
      etiquetaLegivel,
      motivoNaoReconhecido,
      confianca: typeof resultado.confianca === 'number' ? resultado.confianca : 0,
      observacoes: resultado.observacoes || '',
      model,
    });
  } catch (error) {
    console.error('Erro ao identificar máquina:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: `Erro: ${errorMessage}` }, { status: 500 });
  }
}
