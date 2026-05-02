import { NextRequest, NextResponse } from 'next/server';
import { callAI, loadEmpresaAIConfig } from '@/lib/ai-vision';
import { detectProvider } from '@/lib/zhipu-auth';
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

    // Buscar configurações de IA da empresa
    const { llmModel, llmApiKey } = await loadEmpresaAIConfig(empresaId, bodyModel?.trim());

    if (!llmApiKey) {
      return NextResponse.json(
        { error: 'API Key não configurada. Configure nas Configurações do sistema.' },
        { status: 400 }
      );
    }

    const model = llmModel;

    // Prompt: buscar valores após os rótulos configurados
    const nomeE = nomeEntrada || 'E';
    const nomeS = nomeSaida || 'S';
    const prompt = `Veja esta foto de um display de máquina de entretenimento.

Procure na imagem os textos "${nomeE}" e "${nomeS}". Ao lado de cada um deles aparece um valor numérico. Leia esses valores.

Exemplo: se ao lado de "${nomeE}" está "1.234,56", o valor é 123456. Se ao lado de "${nomeS}" está "789,00", o valor é 78900.

Regras:
- Remova pontos e vírgulas do valor. Ex: "2.324,00" vira "232400", "0,50" vira "050", "1234" fica "1234".
- Retorne null se o rótulo não aparecer na foto ou o valor não for legível.
- NUNCA retorne zero a menos que o display mostre exatamente 0.

Responda apenas com o JSON:
{"entrada": "valor_apos_${nomeE}", "saida": "valor_apos_${nomeS}", "confianca": 0_ate_100, "observacoes": "texto"}`;

    console.log(`[EXTRAIR] Modelo: ${model} | Provedor: ${detectProvider(model)}`);

    const result = await callAI(prompt, imagem, llmApiKey, model, {
      temperature: 0.1,
      maxTokens: 200,
      jsonMode: true,
      responseFormat: true,
    });
    const content = result.content;

    console.log(`[EXTRAIR] Conteúdo extraído (provedor: ${result.provider}):`, content.substring(0, 200));

    // Extrair JSON da resposta
    let resultado;
    try {
      // Com responseMimeType/response_format, o modelo já retorna JSON limpo
      // Mantemos fallback para compatibilidade
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
      // Segunda tentativa: extrair campos com regex se JSON falhar
      const entradaMatch = content.match(/"entrada"\s*:\s*"?(\d+)"?/i);
      const saidaMatch = content.match(/"saida"\s*:\s*"?(\d+)"?/i);
      if (entradaMatch || saidaMatch) {
        resultado = {
          entrada: entradaMatch ? parseInt(entradaMatch[1], 10) : null,
          saida: saidaMatch ? parseInt(saidaMatch[1], 10) : null,
          confianca: 50,
          observacoes: 'Extraído por regex (JSON inválido)',
        };
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
      provider: result.provider,
      model,
    });

  } catch (error) {
    console.error('Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: `Erro: ${errorMessage}` }, { status: 500 });
  }
}
