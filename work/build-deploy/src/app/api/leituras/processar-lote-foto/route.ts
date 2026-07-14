import { NextRequest, NextResponse } from 'next/server';
import { callAI, callAIGLM, loadAIConfig, extractJSON, avaliarNitidez, _ultimaCompressaoAgressivaInfo } from '@/lib/ai-vision';
import { enforcePlan } from '@/lib/plan-enforcement';

/**
 * Endpoint unificado: identifica a máquina E extrai valores em UMA chamada.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imagem, codigosMaquinas, modelosMap, empresaId, agressivo, usarGLM } = body;

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
    console.log(`[PROCESSAR-LOTE-FOTO] Modelo: ${model} | Agressivo: ${agressivo === true} | UsarGLM: ${usarGLM === true}`);

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

⚠️ QUAL VALOR LER — MUITO IMPORTANTE:
O display pode mostrar DOIS valores para cada campo:
1. Valor do CONTADOR (inteiro, sem formatação) — ESTE é o valor que queremos
2. Valor MONETÁRIO formatado (com pontos e vírgulas) — NÃO queremos este

Exemplo: se o display mostra "10259000" e "182.598,88" ao lado de ENTRADAS:
  ✅ Retorne: "10259000" (valor do contador, inteiro)
  ❌ NÃO retorne: "18259888" (valor monetário)

COMO DISTINGUIR:
- Valor do CONTADOR: número INTEIRO, SEM pontos, SEM vírgulas, geralmente maior
- Valor MONETÁRIO: tem ponto (.) para milhar e vírgula (,) para decimal

PROCEDIMENTO PARA LEITURA (faça em silêncio, não inclua no JSON):
1. Localize o rótulo de ENTRADA e identifique os valores ao lado
2. Se houver DOIS valores, escolha o INTEIRO (sem . ou ,)
3. Para CADA dígito do valor inteiro, da esquerda para a direita:
   - Tem linha horizontal no MEIO (cintura)? → é 8
   - É uma elipse/círculo vazia SEM linha no meio? → é 0 (zero)
   - Tem curva superior fechada? → é 6 (não 5)
   - Tem topo reto e curva inferior aberta? → é 5 (não 6)
4. Monte o número completo
5. Repita para SAÍDA

DÍGITOS FACILMENTE CONFUNDÍVEIS:
- 0 (zero) vs 8: ZERO é elipse VAZIA sem linha no meio; 8 tem DUAS curvas com CINTURA no meio
- 0 (zero) vs O (letra): ignore letras, apenas dígitos
- 3 vs 8: 3 tem curvas ABERTAS à esquerda; 8 é FECHADO
- 5 vs 6: 5 tem topo RETO; 6 tem curva SUPERIOR FECHADA
- 1 vs 7: 1 é traço VERTICAL; 7 tem traço HORIZONTAL no topo
- 4 vs 1: 4 tem traços CRUZADOS; 1 é ÚNICO vertical

DICAS PARA DISPLAYS LCD/LED:
- Cada dígito ocupa uma posição retangular fixa — conte as posições
- Cor do dígito (verde/vermelho/azul/branco) não afeta o valor
- Se um segmento parece apagado, considere o dígito mais provável pela forma geral
- Zeros à esquerda SÃO importantes — não os remova

REGRAS DE SAÍDA:
- Retorne APENAS os dígitos numéricos do CONTADOR (inteiro, sem . ou ,)
- Se o display mostrar 1.234,56 (monetário) E 123456 (contador), retorne 123456
- Mantenha zeros à esquerda
- Se ilegível, retorne null

Responda APENAS com JSON:
{"etiquetaLegivel": true_ou_false, "codigoMaquina": "CODIGO_OU_VAZIO", "codigoLido": "CODIGO_OU_VAZIO", "confianca": 0_A_100, "entrada": "digitos_ou_null", "saida": "digitos_ou_null", "observacoes": "texto"}`;

    // Chamar IA — dupla chamada para foto individual agressiva (validação cruzada)
    // Chama 2x: com inversão de cores e sem inversão. Se divergirem, usa maior confiança.
    let result;
    let resultadoAlternativo = null;

    if (agressivo === true && usarGLM !== true) {
      // === DUPLA CHAMADA (apenas foto individual agressiva) ===
      console.log('[PROCESSAR-LOTE-FOTO] Dupla chamada (validação cruzada)');

      // Chamada 1: com pipeline agressivo (que pode inverter cores)
      const result1 = await callAI(prompt, imagem, model, {
        temperature: 0.05,
        maxTokens: 4096,
        jsonMode: true,
        agressivo: true,
      });

      // Para a chamada 2, precisamos desativar a inversão temporariamente.
      // Como callAI não permite controlar isso diretamente, usamos callAIGLM
      // que não inverte, OU fazemos uma segunda chamada com agressivo=false.
      // Melhor abordagem: segunda chamada com pipeline rápido (sem inversão)
      const result2 = await callAI(prompt, imagem, model, {
        temperature: 0.05,
        maxTokens: 4096,
        jsonMode: true,
        agressivo: false, // pipeline rápido = sem inversão de cores
      });

      // Parse das duas respostas
      const parsed1 = extractJSON(result1.content).parsed;
      const parsed2 = extractJSON(result2.content).parsed;

      if (parsed1 && parsed2) {
        const ent1 = String(parsed1.entrada ?? '');
        const ent2 = String(parsed2.entrada ?? '');
        const sai1 = String(parsed1.saida ?? '');
        const sai2 = String(parsed2.saida ?? '');

        console.log(`[DUPLA] Chamada 1 (agressivo): entrada=${ent1}, saida=${sai1}`);
        console.log(`[DUPLA] Chamada 2 (rápido): entrada=${ent2}, saida=${sai2}`);

        // Se entradas divergem, usar a de maior confiança
        if (ent1 !== ent2) {
          const conf1 = parsed1.confianca || 0;
          const conf2 = parsed2.confianca || 0;
          console.log(`[DUPLA] Divergência na entrada! conf1=${conf1}, conf2=${conf2}`);

          // Se confianças próximas (diferença < 10), tentar encontrar dígito ambíguo
          // e aplicar regra: se um tem 8 e outro tem 0 na mesma posição, preferir 0
          // (zeros são mais comuns em contadores que 8s)
          if (Math.abs(conf1 - conf2) < 10 && ent1.length === ent2.length) {
            let entradaFinal = '';
            for (let i = 0; i < ent1.length; i++) {
              if (ent1[i] !== ent2[i]) {
                // Dígito divergente — se um é 0 e outro é 8, preferir 0
                if ((ent1[i] === '0' && ent2[i] === '8') || (ent1[i] === '8' && ent2[i] === '0')) {
                  entradaFinal += '0';
                  console.log(`[DUPLA] Dígito ${i}: 0 vs 8 → escolhido 0 (zero mais comum)`);
                } else {
                  // Outra divergência — usar maior confiança
                  entradaFinal += conf1 >= conf2 ? ent1[i] : ent2[i];
                }
              } else {
                entradaFinal += ent1[i];
              }
            }
            parsed1.entrada = entradaFinal;
            console.log(`[DUPLA] Entrada final (reconciliada): ${entradaFinal}`);
          } else {
            // Confianças diferentes — usar a maior
            if (conf2 > conf1) {
              parsed1.entrada = parsed2.entrada;
              parsed1.saida = parsed2.saida;
            }
            // parsed1 já tem o resultado de maior confiança se conf1 >= conf2
          }
        }

        // Mesma lógica para saída
        if (sai1 !== sai2 && !resultadoAlternativo) {
          const conf1 = parsed1.confianca || 0;
          const conf2 = parsed2.confianca || 0;
          if (Math.abs(conf1 - conf2) < 10 && sai1.length === sai2.length) {
            let saidaFinal = '';
            for (let i = 0; i < sai1.length; i++) {
              if (sai1[i] !== sai2[i]) {
                if ((sai1[i] === '0' && sai2[i] === '8') || (sai1[i] === '8' && sai2[i] === '0')) {
                  saidaFinal += '0';
                } else {
                  saidaFinal += conf1 >= conf2 ? sai1[i] : sai2[i];
                }
              } else {
                saidaFinal += sai1[i];
              }
            }
            parsed1.saida = saidaFinal;
          }
        }

        result = result1;
      } else {
        result = result1;
      }
    } else if (usarGLM === true) {
      result = await callAIGLM(prompt, imagem, {
        temperature: 0.05,
        maxTokens: 4096,
        jsonMode: true,
        agressivo: agressivo === true,
      });
    } else {
      result = await callAI(prompt, imagem, model, {
        temperature: 0.05,
        maxTokens: 4096,
        jsonMode: true,
        agressivo: agressivo === true,
      });
    }
    const content = result.content;

    // Parse da resposta — usa parsed1 reconciliado se dupla chamada foi feita
    let resultado;
    if (agressivo === true && usarGLM !== true) {
      // Dupla chamada — usar parsed1 reconciliado
      resultado = extractJSON(result1.content).parsed;
      // Reaplicar reconciliação se perdeu
      if (resultado && parsed1) {
        resultado = parsed1;
      }
    } else {
      resultado = extractJSON(content).parsed;
    }

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
      debugInverteuCores: _ultimaCompressaoAgressivaInfo.inverteuCores,
      debugBrilhoMedio: _ultimaCompressaoAgressivaInfo.brilhoMedio,
      debugDuplaChamada: agressivo === true && usarGLM !== true,
    });
  } catch (error) {
    console.error('[PROCESSAR-LOTE-FOTO] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: `Erro: ${errorMessage}` }, { status: 500 });
  }
}
