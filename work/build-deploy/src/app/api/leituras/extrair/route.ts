import { NextRequest, NextResponse } from 'next/server';
import { callAI, loadAIConfig, extractJSON } from '@/lib/ai-vision';
import { enforcePlan } from '@/lib/plan-enforcement';

// Extrair valores de leitura de uma imagem usando IA
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imagem, nomeEntrada, nomeSaida, model: bodyModel, empresaId } = body;

    if (!imagem) {
      return NextResponse.json({ error: 'Imagem é obrigatória' }, { status: 400 });
    }

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId é obrigatório' }, { status: 400 });
    }

    if (!imagem.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Formato de imagem inválido. Envie uma imagem em base64.' }, { status: 400 });
    }

    const planCheck = await enforcePlan(empresaId, { feature: 'recIA' }, request);
    if (planCheck.error) return NextResponse.json({ error: planCheck.error }, { status: 403 });

    const { llmModel } = await loadAIConfig(bodyModel?.trim());
    const model = llmModel;

    // Prompt focado: APENAS localizar os valores ao lado dos rótulos configurados
    const nomeE = nomeEntrada || 'E';
    const nomeS = nomeSaida || 'S';
    const prompt = `Esta é uma foto do display de uma máquina de entretenimento.

Sua única tarefa: localize na imagem os textos "${nomeE}" e "${nomeS}".

Para cada texto encontrado, leia o valor numérico que aparece ao lado/abaixo dele no display.

Regras:
- Retorne APENAS os dígitos numéricos visíveis no display, sem pontos e sem vírgulas.
- Retorne o valor COMPLETO: se o display mostrar 1.234,56 retorne 123456 (ignore os separadores . e ,).
- Mantenha todos os dígitos incluindo zeros à esquerda (ex: 0042, não 42).
- Ignore pontos (.) e vírgulas (,) usados como separadores de milhar/decimal.
- Se "${nomeE}" não aparecer na foto, retorne null para entrada.
- Se "${nomeS}" não aparecer na foto, retorne null para saida.
- Se o valor for ilegível, retorne null.
- NUNCA invente valores. Retorne null se não conseguir ler.

Responda apenas com o JSON:
{"entrada": "digitos ou null", "saida": "digitos ou null", "confianca": 0_ate_100, "observacoes": "texto"}`;

    console.log(`[EXTRAIR] Modelo: ${model}`);

    const result = await callAI(prompt, imagem, model, {
      temperature: 0.1,
      maxTokens: 4096,
      jsonMode: true,
    });
    const content = result.content;

    console.log(`[EXTRAIR] Conteúdo extraído (${content.length} chars):`, content.substring(0, 500));

    if (!content || content.trim().length === 0) {
      return NextResponse.json(
        { error: 'A IA retornou uma resposta vazia. Tente novamente com outra foto.' },
        { status: 500 }
      );
    }

    // Extrair JSON da resposta (parser robusto com balanceamento de chaves)
    let resultado = extractJSON(content).parsed;

    if (!resultado) {
      // Fallback: extrair campos com regex se JSON falhar
      const entradaMatch = content.match(/"entrada"\s*:\s*"?(\d+)"?/i);
      const saidaMatch = content.match(/"saida"\s*:\s*"?(\d+)"?/i);
      if (entradaMatch || saidaMatch) {
        resultado = {
          entrada: entradaMatch ? parseInt(entradaMatch[1], 10) : null,
          saida: saidaMatch ? parseInt(saidaMatch[1], 10) : null,
          confianca: 50,
          observacoes: 'Extraído por regex (JSON inválido)',
        };
        console.warn(`[EXTRAIR] JSON parse falhou, regex fallback: ${JSON.stringify(resultado)}`);
      } else {
        const trecho = content.substring(0, 200).replace(/\n/g, ' ');
        console.error('[EXTRAIR] Falha ao parsear resposta da IA:', content.substring(0, 500));
        return NextResponse.json(
          { error: `A IA não retornou um formato válido. Resposta: ${trecho}` },
          { status: 500 }
        );
      }
    }

    const sanitizarValor = (valor: any): number | null => {
      if (valor === null || valor === undefined || valor === 'null') return null;
      const digitos = String(valor).replace(/\D/g, '');
      if (!digitos) return null;
      return parseInt(digitos, 10);
    };

    resultado.entrada = sanitizarValor(resultado.entrada);
    resultado.saida = sanitizarValor(resultado.saida);
    if (typeof resultado.confianca !== 'number') {
      resultado.confianca = 0;
    }

    return NextResponse.json({
      success: true,
      entrada: resultado.entrada,
      saida: resultado.saida,
      confianca: resultado.confianca,
      observacoes: resultado.observacoes || '',
      model,
    });

  } catch (error) {
    console.error('Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: `Erro: ${errorMessage}` }, { status: 500 });
  }
}
