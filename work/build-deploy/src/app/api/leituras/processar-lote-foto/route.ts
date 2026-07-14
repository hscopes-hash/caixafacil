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

    // Chamar IA — abordagem em 2 etapas para foto individual agressiva
    // Etapa 1: IA detecta região (bounding box) dos valores
    // Etapa 2: Crop + upscale da região → IA extrai dígitos
    let result;
    let resultadoAlternativo = null;

    if (agressivo === true && usarGLM !== true) {
      // === ABORDAGEM 2 ETAPAS (apenas foto individual agressiva) ===
      console.log('[PROCESSAR-LOTE-FOTO] Abordagem 2 etapas (detectar região → crop → extrair)');

      // === ETAPA 1: Detectar região dos valores ===
      const promptRegiao = `Analise esta foto de uma máquina de entretenimento e identifique onde estão os valores numéricos do display.

Procure pelos rótulos de ENTRADA e SAÍDA:
${codigosMaquinas.map((c: string) => {
  const info = mapaModelos[c];
  return `  - Código "${c}": rótulo entrada="${info?.nomeEntrada || 'E'}", rótulo saída="${info?.nomeSaida || 'S'}"`;
}).join('\n')}

Para cada rótulo encontrado, retorne as COORDENADAS da região retangular onde está o VALOR NUMÉRICO (não o rótulo, mas o número ao lado).

As coordenadas são em porcentagem (0-100) da largura e altura da imagem:
- x1, y1: canto superior esquerdo do retângulo
- x2, y2: canto inferior direito do retângulo

Exemplo: se o valor está no canto superior direito, pode ser x1=60, y1=10, x2=95, y2=25

Responda APENAS com JSON:
{"entradaRegiao": {"x1": 0, "y1": 0, "x2": 100, "y2": 100}, "saidaRegiao": {"x1": 0, "y1": 0, "x2": 100, "y2": 100}}

Se não encontrar um dos rótulos, retorne null para a região correspondente.`;

      const resultRegiao = await callAI(promptRegiao, imagem, model, {
        temperature: 0.05,
        maxTokens: 1024,
        jsonMode: true,
        agressivo: false, // pipeline rápido para detectar região
      });

      const regiaoData = extractJSON(resultRegiao.content).parsed;
      console.log(`[2-ETAPAS] Região detectada:`, JSON.stringify(regiaoData));

      let resultadoFinal = null;

      if (regiaoData && (regiaoData.entradaRegiao || regiaoData.saidaRegiao)) {
        // === ETAPA 2: Crop + upscale + extrair dígitos ===
        const sharp = (await import('sharp')).default;
        const matches = imagem.match(/^data:(image\/\w+);base64,(.+)$/);
        if (matches) {
          const imgBuffer = Buffer.from(matches[2], 'base64');
          const meta = await sharp(imgBuffer).metadata();

          // Função helper: fazer crop + upscale + processar
          const processarRegiao = async (regiao: any, rotulo: string): Promise<string | null> => {
            if (!regiao || regiao.x1 === undefined) return null;
            const left = Math.max(0, Math.floor(meta.width! * regiao.x1 / 100));
            const top = Math.max(0, Math.floor(meta.height! * regiao.y1 / 100));
            const width = Math.min(meta.width! - left, Math.floor(meta.width! * (regiao.x2 - regiao.x1) / 100));
            const height = Math.min(meta.height! - top, Math.floor(meta.height! * (regiao.y2 - regiao.y1) / 100));

            if (width < 10 || height < 10) {
              console.log(`[2-ETAPAS] Região ${rotulo} muito pequena: ${width}x${height}`);
              return null;
            }

            console.log(`[2-ETAPAS] Crop ${rotulo}: left=${left} top=${top} ${width}x${height} (de ${meta.width}x${meta.height})`);

            // Crop + upscale 2000px + processamento agressivo
            const cropBuffer = await sharp(imgBuffer)
              .extract({ left, top, width, height })
              .removeAlpha()
              .resize(2000, 2000, { fit: 'inside', kernel: 'lanczos3' })
              .normalise()
              .modulate({ saturation: 1.3 })
              .sharpen({ sigma: 1.5, m1: 1.0, m2: 0.8 })
              .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
              .toBuffer();

            return `data:image/jpeg;base64,${cropBuffer.toString('base64')}`;
          };

          // Processar região de ENTRADA
          const entradaCrop = await processarRegiao(regiaoData.entradaRegiao, 'ENTRADA');
          // Processar região de SAÍDA
          const saidaCrop = await processarRegiao(regiaoData.saidaRegiao, 'SAÍDA');

          // Extrair dígitos de cada região
          let entradaValor: string | null = null;
          let saidaValor: string | null = null;
          let confiancaEntrada = 0;
          let confiancaSaida = 0;

          if (entradaCrop) {
            const promptExtrair = `Leia os dígitos numéricos desta imagem. É um recorte ampliado de um display LCD/LED mostrando o valor do CONTADOR (inteiro, sem pontos ou vírgulas).

ATENÇÃO — DÍGITOS FACILMENTE CONFUNDÍVEIS:
- 0 (zero) vs 8: ZERO é elipse VAZIA sem linha no meio; 8 tem DUAS curvas com CINTURA no meio
- 3 vs 8: 3 tem curvas ABERTAS à esquerda; 8 é FECHADO
- 5 vs 6: 5 tem topo RETO; 6 tem curva SUPERIOR FECHADA
- 1 vs 7: 1 é traço VERTICAL; 7 tem traço HORIZONTAL no topo

PROCEDIMENTO:
1. Conte quantos dígitos o valor tem
2. Para CADA dígito, verifique: tem linha horizontal no MEIO (cintura)?
   - Se SIM: é 8
   - Se NÃO e é elipse vazia: é 0 (zero)
3. Monte o número completo

Retorne APENAS os dígitos (sem . ou ,). Se ilegível, retorne null.

JSON: {"digitos": "string_ou_null", "confianca": 0_a_100}`;

            const resultEntrada = await callAI(promptExtrair, entradaCrop, model, {
              temperature: 0.05,
              maxTokens: 512,
              jsonMode: true,
              agressivo: false, // já processamos manualmente
            });
            const entradaParsed = extractJSON(resultEntrada.content).parsed;
            if (entradaParsed) {
              entradaValor = entradaParsed.digitos ? String(entradaParsed.digitos).replace(/\D/g, '') : null;
              confiancaEntrada = entradaParsed.confianca || 0;
              console.log(`[2-ETAPAS] ENTRADA extraída: ${entradaValor} (confiança: ${confiancaEntrada})`);
            }
          }

          if (saidaCrop) {
            const promptExtrair = `Leia os dígitos numéricos desta imagem. É um recorte ampliado de um display LCD/LED mostrando o valor do CONTADOR (inteiro, sem pontos ou vírgulas).

ATENÇÃO — DÍGITOS FACILMENTE CONFUNDÍVEIS:
- 0 (zero) vs 8: ZERO é elipse VAZIA sem linha no meio; 8 tem DUAS curvas com CINTURA no meio
- 3 vs 8: 3 tem curvas ABERTAS à esquerda; 8 é FECHADO
- 5 vs 6: 5 tem topo RETO; 6 tem curva SUPERIOR FECHADA
- 1 vs 7: 1 é traço VERTICAL; 7 tem traço HORIZONTAL no topo

PROCEDIMENTO:
1. Conte quantos dígitos o valor tem
2. Para CADA dígito, verifique: tem linha horizontal no MEIO (cintura)?
   - Se SIM: é 8
   - Se NÃO e é elipse vazia: é 0 (zero)
3. Monte o número completo

Retorne APENAS os dígitos (sem . ou ,). Se ilegível, retorne null.

JSON: {"digitos": "string_ou_null", "confianca": 0_a_100}`;

            const resultSaida = await callAI(promptExtrair, saidaCrop, model, {
              temperature: 0.05,
              maxTokens: 512,
              jsonMode: true,
              agressivo: false,
            });
            const saidaParsed = extractJSON(resultSaida.content).parsed;
            if (saidaParsed) {
              saidaValor = saidaParsed.digitos ? String(saidaParsed.digitos).replace(/\D/g, '') : null;
              confiancaSaida = saidaParsed.confianca || 0;
              console.log(`[2-ETAPAS] SAÍDA extraída: ${saidaValor} (confiança: ${confiancaSaida})`);
            }
          }

          // Montar resultado final
          resultadoFinal = {
            etiquetaLegivel: true,
            codigoMaquina: regiaoData.codigoMaquina || '',
            codigoLido: regiaoData.codigoMaquina || '',
            confianca: Math.max(confiancaEntrada, confiancaSaida),
            entrada: entradaValor,
            saida: saidaValor,
            observacoes: `Extraído por abordagem 2 etapas (crop + upscale). Confiança entrada: ${confiancaEntrada}, saída: ${confiancaSaida}`,
          };
        }
      }

      if (resultadoFinal) {
        // Simular content para o parser abaixo
        result = { content: JSON.stringify(resultadoFinal) };
      } else {
        // Fallback: se abordagem 2 etapas falhou, usar chamada simples
        console.log('[2-ETAPAS] Falhou, usando chamada simples');
        result = await callAI(prompt, imagem, model, {
          temperature: 0.05,
          maxTokens: 4096,
          jsonMode: true,
          agressivo: true,
        });
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
      debugInverteuCores: _ultimaCompressaoAgressivaInfo.inverteuCores,
      debugBrilhoMedio: _ultimaCompressaoAgressivaInfo.brilhoMedio,
      debugDuplaChamada: agressivo === true && usarGLM !== true,
      debugAbordagem2Etapas: agressivo === true && usarGLM !== true,
    });
  } catch (error) {
    console.error('[PROCESSAR-LOTE-FOTO] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: `Erro: ${errorMessage}` }, { status: 500 });
  }
}
