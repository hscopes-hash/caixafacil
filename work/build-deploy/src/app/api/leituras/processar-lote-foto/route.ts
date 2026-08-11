import { NextRequest, NextResponse } from 'next/server';
import { callAI, loadAIConfig, extractJSON, avaliarNitidez } from '@/lib/ai-vision';
import { enforcePlan } from '@/lib/plan-enforcement';

/**
 * Endpoint unificado: identifica a máquina E extrai valores em UMA chamada.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imagem, codigosMaquinas, modelosMap, empresaId, agressivo } = body;

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
  const compl = info?.complementoPrompt ? ` (instrução especial: ${info.complementoPrompt})` : '';
  const criterio = info?.criterioAnalise ? ` [ALERTA: ${info.criterioAnalise}]` : '';
  return `  - Código "${c}": rótulo entrada="${info?.nomeEntrada || 'E'}", rótulo saída="${info?.nomeSaida || 'S'}"${compl}${criterio}`;
}).join('\n')}

⚠️ POSIÇÃO ESPACIAL DOS RÓTULOS — MUITO IMPORTANTE:
Os rótulos de ENTRADA e SAÍDA estão em POSIÇÕES FIXAS no display:
- Geralmente um ACIMA do outro (vertical) ou UM AO LADO do outro (horizontal)
- NUNCA troque os valores entre os rótulos
- Se a foto estiver levemente inclinada, os rótulos continuam na MESMA POSIÇÃO RELATIVA
- Identifique PRIMEIRO qual rótulo está na posição de ENTRADA e qual está na posição de SAÍDA
- SÓ DEPOIS leia os dígitos ao lado de cada rótulo
- Se dois valores parecem iguais, VERIFIQUE se você está lendo o rótulo correto

⚠️ COLUNAS PARCIAL E TOTAL — MUITO IMPORTANTE:
Alguns displays mostram DUAS colunas de valores para cada rótulo:
- Coluna "PARCIAL" (valor do período atual, geralmente MENOR)
- Coluna "TOTAL" (valor acumulado, geralmente MAIOR)
- SEMPRE retorne o valor da coluna TOTAL (NÃO o parcial)
- Se houver apenas uma coluna de valor, retorne esse valor
- Se houver duas colunas e não estiver claro qual é TOTAL, retorne o MAIOR dos dois valores
- Os rótulos podem ser JOGADO (entrada), GANHO (saída), ENTRADAS, SAIDAS, etc.

PROCEDIMENTO (faça em silêncio, não inclua no JSON):
1. Localize TODOS os rótulos visíveis no display
2. Para cada rótulo, identifique se é ENTRADA ou SAÍDA pela palavra escrita
3. Verifique se há colunas PARCIAL e TOTAL — se sim, use SEMPRE a coluna TOTAL
4. Leia os dígitos AO LADO do rótulo correto (não do rótulo vizinho)
5. Se ENTRADA e SAÍDA resultarem no MESMO valor, VERIFIQUE se você não está lendo o mesmo campo duas vezes
6. Confirme que cada valor pertence ao rótulo correto e à coluna TOTAL

Para cada rótulo encontrado, leia os dígitos numéricos que aparecem ao lado/abaixo dele.
Retorne APENAS dígitos, sem pontos e sem vírgulas. Se o display mostrar 1.234,56 retorne 123456 (ignore os separadores . e ,). Retorne o valor COMPLETO incluindo todos os dígitos visíveis (mantenha zeros à esquerda). Se ilegível, retorne null.

TAREFA 3 — VERIFICAR ALERTA DE DEFEITO:
Se a máquina identificada tiver um critério de alerta (marcado como [ALERTA: ...] na lista acima), verifique se o critério é confirmado na foto. Por exemplo, se o critério diz "verificar se o display mostra erro", analise se há alguma mensagem de erro ou código de falha visível no display.
- Se o critérito NÃO for confirmado, retorne alertaDefeito como false.
- Se o critério FOR confirmado, retorne alertaDefeito como true e descreva o que encontrou em observacoes.

Responda APENAS com JSON:
{"etiquetaLegivel": true_ou_false, "codigoMaquina": "CODIGO_OU_VAZIO", "codigoLido": "CODIGO_OU_VAZIO", "confianca": 0_A_100, "entrada": "digitos_ou_null", "saida": "digitos_ou_null", "alertaDefeito": false, "observacoes": "texto"}`;

    const result = await callAI(prompt, imagem, model, {
      temperature: 0.05,
      maxTokens: 4096,
      jsonMode: true,
      agressivo: agressivo === true, // foto individual ativa deskew + pipeline agressivo
    });
    let content = result.content;

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
          alertaDefeito: false,
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

    // === TWO-PASS: se a máquina identificada tem ocrAgressivo e a primeira passagem
    // não foi agressiva, reprocessa com pipeline agressivo (deskew + JPEG 90) ===
    const codigoFinalParaChecagem = codigoEncontrado || codigoIdentificado || codigoLido;
    const infoMaquinaParaChecagem = codigoFinalParaChecagem ? mapaModelos[codigoFinalParaChecagem] : null;

    if (
      infoMaquinaParaChecagem?.ocrAgressivo === true &&
      agressivo !== true && // só reprocessa se a primeira passagem não foi agressiva
      etiquetaLegivel &&
      codigoEncontrado
    ) {
      console.log(`[PROCESSAR-LOTE-FOTO] OCR Agressivo ativado para máquina ${codigoFinalParaChecagem} — reprocessando com deskew + JPEG 90`);
      const result2 = await callAI(prompt, imagem, model, {
        temperature: 0.05,
        maxTokens: 4096,
        jsonMode: true,
        agressivo: true, // segunda passagem com pipeline agressivo
      });
      content = result2.content;
      const resultado2 = extractJSON(content).parsed;
      if (resultado2) {
        resultado = resultado2; // usa o resultado mais preciso da segunda passagem
      }
    }

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
      alertaDefeito: resultado.alertaDefeito === true,
      mensagemAlerta: (infoMaquina?.criterioAnalise && resultado.alertaDefeito === true)
        ? (infoMaquina as any)?.mensagemAlerta || 'ALERTA DE DEFEITO DETECTADO'
        : '',
      model,
    });
  } catch (error) {
    console.error('[PROCESSAR-LOTE-FOTO] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: `Erro: ${errorMessage}` }, { status: 500 });
  }
}
