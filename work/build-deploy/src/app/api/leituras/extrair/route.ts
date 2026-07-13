import { NextRequest, NextResponse } from 'next/server';
import { callAI, loadAIConfig, extractJSON, avaliarNitidez } from '@/lib/ai-vision';
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

    // === VERIFICAÇÃO DE NITIDEZ — recusa fotos borradas/tremidas antes de gastar IA ===
    try {
      const base64Data = imagem.split(',')[1];
      const imgBuffer = Buffer.from(base64Data, 'base64');
      const nitidez = await avaliarNitidez(imgBuffer);
      if (nitidez.ilegivel) {
        console.warn(`[EXTRAIR] Foto recusada: ${nitidez.motivo}`);
        return NextResponse.json({
          error: nitidez.motivo,
          ilegivel: true,
        }, { status: 422 });
      }
    } catch (err) {
      // Se a verificação falhar, continua com a IA (não bloqueia o fluxo)
      console.warn('[EXTRAIR] Verificação de nitidez falhou, continuando:', err);
    }

    const { llmModel } = await loadAIConfig(bodyModel?.trim());
    const model = llmModel;

    // Prompt focado: APENAS localizar os valores ao lado dos rótulos configurados
    const nomeE = nomeEntrada || 'E';
    const nomeS = nomeSaida || 'S';
    const prompt = `Esta é uma foto do display de uma máquina de entretenimento (como caça-níqueis, terminais de jogo, vending machines).

Sua tarefa é localizar na imagem os textos "${nomeE}" e "${nomeS}" (que aparecem em telas LCD/LED ou impressos em painel) e ler o valor numérico que aparece ao lado ou abaixo de cada um deles.

INSTRUÇÕES DETALHADAS:
1. Os rótulos "${nomeE}" e "${nomeS}" podem aparecer em qualquer cor (vermelho, verde, azul, branco, laranja) renderizados em tela LCD/LED.
2. Os números ao lado também podem estar em qualquer cor, renderizados como texto digital na tela.
3. Os números podem ter 1 a 7 dígitos, com ou sem separadores de milhar (ponto ou vírgula).
4. Se houver múltiplos displays, priorize aqueles imediatamente adjacentes aos rótulos "${nomeE}" e "${nomeS}".
5. Se a foto estiver escura, tente identificar os dígitos mesmo assim (telas LCD/LED costumam ser visíveis no escuro).
6. Dígitos podem ser pequenos — leia cada caractere cuidadosamente, prestando atenção a zeros à esquerda.

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

REGRAS DE SAÍDA:
- Retorne APENAS os dígitos numéricos visíveis, sem pontos e sem vírgulas.
- Retorne o valor COMPLETO: se o display mostrar 1.234,56 retorne 123456 (ignore separadores).
- Mantenha zeros à esquerda (ex: 0042, não 42).
- Se "${nomeE}" não aparecer na foto, retorne null para entrada.
- Se "${nomeS}" não aparecer na foto, retorne null para saida.
- Se o valor for ilegível, retorne null.
- NUNCA invente valores. Retorne null se não conseguir ler com segurança.

CAMPO "confianca":
- 90-100: valores claramente legíveis, sem ambiguidade
- 70-89: legíveis mas com alguma incerteza (ex: dígito que pode ser 3 ou 8)
- 50-69: legíveis com dificuldade (ex: foto borrada, mas digitou parcialmente)
- 0-49: não conseguiu ler com segurança (preferir null)

CAMPO "observacoes":
- Descreva brevemente o que viu (ex: "Display LED vermelho, 6 dígitos" ou "Foto escura, display parcialmente visível")

Responda apenas com o JSON:
{"entrada": "digitos ou null", "saida": "digitos ou null", "confianca": 0_a_100, "observacoes": "texto"}`;

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
