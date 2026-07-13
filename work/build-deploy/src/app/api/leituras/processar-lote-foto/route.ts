import { NextRequest, NextResponse } from 'next/server';
import { callAI, loadAIConfig, extractJSON, avaliarNitidez } from '@/lib/ai-vision';
import { enforcePlan } from '@/lib/plan-enforcement';

/**
 * Endpoint unificado: identifica a máquina E extrai valores em UMA chamada.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imagem, codigosMaquinas, modelosMap, empresaId } = body;

    if (!imagem) return NextResponse.json({ error: 'Imagem e obrigatoria' }, { status: 400 });
    if (!empresaId) return NextResponse.json({ error: 'empresaId e obrigatorio' }, { status: 400 });
    if (!codigosMaquinas || !Array.isArray(codigosMaquinas) || codigosMaquinas.length === 0) {
      return NextResponse.json({ error: 'Lista de codigos de maquinas e obrigatoria' }, { status: 400 });
    }
    if (!imagem.startsWith('data:image/')) return NextResponse.json({ error: 'Formato de imagem invalido.' }, { status: 400 });

    const planCheck = await enforcePlan(empresaId, { feature: 'recIA' }, request);
    if (planCheck.error) return NextResponse.json({ error: planCheck.error }, { status: 403 });

    // === VERIFICAÇÃO DE NITIDEZ — recusa fotos borradas/tremidas antes de gastar IA ===
    try {
      const base64Data = imagem.split(',')[1];
      const imgBuffer = Buffer.from(base64Data, 'base64');
      const nitidez = await avaliarNitidez(imgBuffer);
      if (nitidez.ilegivel) {
        console.warn(`[PROCESSAR-LOTE-FOTO] Foto recusada: ${nitidez.motivo}`);
        return NextResponse.json({
          error: nitidez.motivo,
          ilegivel: true,
        }, { status: 422 });
      }
    } catch (err) {
      console.warn('[PROCESSAR-LOTE-FOTO] Verificação de nitidez falhou, continuando:', err);
    }

    const { llmModel } = await loadAIConfig();
    const model = llmModel;
    console.log(`[PROCESSAR-LOTE-FOTO] Modelo: ${model}`);

    const mapaModelos = modelosMap || {};
    const listaCodigos = codigosMaquinas.map((c: string) => `"${c}"`).join(', ');

    const prompt = `Analise esta foto de uma máquina de entretenimento. Duas tarefas:

TAREFA 1 — IDENTIFICAR A MÁQUINA:
Procure uma ETIQUETA ou ADESIVO legível na foto com um código da lista: [${listaCodigos}]
Se não houver etiqueta legível, retorne etiquetaLegivel como false e pule a TAREFA 2.

TAREFA 2 — LER VALORES DO DISPLAY:
Se a máquina foi identificada, localize no display os textos de ENTRADA e SAÍDA da máquina encontrada:
${codigosMaquinas.map((c: string) => {
  const info = mapaModelos[c];
  return `  - Código "${c}": rótulo entrada="${info?.nomeEntrada || 'E'}", rótulo saída="${info?.nomeSaida || 'S'}"`;
}).join('\n')}

Para cada rótulo encontrado, leia os dígitos numéricos que aparecem ao lado/abaixo dele.
Retorne APENAS dígitos, sem pontos e sem vírgulas. Se o display mostrar 1.234,56 retorne 123456 (ignore os separadores . e ,). Retorne o valor COMPLETO incluindo todos os dígitos visíveis (mantenha zeros à esquerda). Se ilegível, retorne null.

ATENÇÃO — DÍGITOS FACILMENTE CONFUNDÍVEIS:
- 0 (zero) vs 8: o zero é uma elipse vazia; o 8 tem duas curvas empilhadas com constrição no meio
- 0 (zero) vs O (letra): ignore letras, apenas dígitos
- 3 vs 8: o 3 tem duas curvas abertas à esquerda; o 8 é fechado
- 5 vs 6: o 5 tem topo reto e curva inferior; o 6 tem curva superior fechada
- 1 vs 7: o 1 é traço vertical; o 7 tem traço horizontal no topo
- 4 vs 1: o 4 tem dois traços cruzados; o 1 é único vertical

DICAS PARA DISPLAYS LCD/LED:
- Cada dígito ocupa uma posição retangular fixa — conte as posições
- Cor do dígito (verde/vermelho/azul/branco) não afeta o valor
- Se um segmento parece apagado, considere o dígito mais provável pela forma geral
- Zeros à esquerda SÃO importantes — não os remova

Responda APENAS com JSON:
{"etiquetaLegivel": true_ou_false, "codigoMaquina": "CODIGO_OU_VAZIO", "codigoLido": "CODIGO_OU_VAZIO", "confianca": 0_A_100, "entrada": "digitos_ou_null", "saida": "digitos_ou_null", "observacoes": "texto"}`;

    const result = await callAI(prompt, imagem, model, {
      temperature: 0.05,
      maxTokens: 4096,
      jsonMode: true,
    });
    const content = result.content;

    // Parse da resposta
    let resultado = extractJSON(content).parsed;

    if (!resultado) {
      const codigoMatch = content.match(/"codigoMaquina"\s*:\s*"([^"]+)"/i);
      const entradaMatch = content.match(/"entrada"\s*:\s*"?(\d+)"?/i);
      const saidaMatch = content.match(/"saida"\s*:\s*"?(\d+)"?/i);

      if (codigoMatch || entradaMatch || saidaMatch) {
        resultado = {
          etiquetaLegivel: true,
          codigoMaquina: codigoMatch?.[1] || '',
          codigoLido: codigoMatch?.[1] || '',
          confianca: 50,
          entrada: entradaMatch ? parseInt(entradaMatch[1], 10) : null,
          saida: saidaMatch ? parseInt(saidaMatch[1], 10) : null,
          observacoes: 'Extraido por regex (JSON invalido)',
        };
      } else {
        const trecho = content.substring(0, 200).replace(/\n/g, ' ');
        console.error('[PROCESSAR-LOTE-FOTO] Falha ao parsear:', content.substring(0, 500));
        return NextResponse.json(
          { error: `A IA nao retornou um formato valido. Resposta: ${trecho}` },
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

    const sanitizarValor = (valor: any): number | null => {
      if (valor === null || valor === undefined || valor === 'null') return null;
      const digitos = String(valor).replace(/\D/g, '');
      if (!digitos) return null;
      return parseInt(digitos, 10);
    };

    const entrada = sanitizarValor(resultado.entrada);
    const saida = sanitizarValor(resultado.saida);

    const codigoFinal = codigoEncontrado || codigoIdentificado || codigoLido;
    const infoMaquina = codigoFinal ? mapaModelos[codigoFinal] : null;

    let motivoNaoReconhecido: string | undefined;
    if (!etiquetaLegivel) {
      motivoNaoReconhecido = 'Sem etiqueta ou ilegivel';
    } else if (!codigoEncontrado) {
      motivoNaoReconhecido = 'Maquina nao pertence a esse cliente';
    }

    return NextResponse.json({
      success: true,
      codigoMaquina: codigoFinal,
      codigoLido,
      codigoReconhecido: !!codigoEncontrado,
      etiquetaLegivel,
      motivoNaoReconhecido,
      confianca: typeof resultado.confianca === 'number' ? resultado.confianca : 0,
      nomeEntrada: infoMaquina?.nomeEntrada || resultado.nomeEntrada || '',
      nomeSaida: infoMaquina?.nomeSaida || resultado.nomeSaida || '',
      entrada,
      saida,
      confiancaOCR: typeof resultado.confianca === 'number' ? resultado.confianca : 0,
      observacoes: resultado.observacoes || '',
      model,
    });
  } catch (error) {
    console.error('[PROCESSAR-LOTE-FOTO] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: `Erro: ${errorMessage}` }, { status: 500 });
  }
}
