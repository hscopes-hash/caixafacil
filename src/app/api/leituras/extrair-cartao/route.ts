import { NextRequest, NextResponse } from 'next/server';
import { callAI, loadEmpresaAIConfig } from '@/lib/ai-vision';
import { detectProvider } from '@/lib/zhipu-auth';
import { enforcePlan } from '@/lib/plan-enforcement';

// ============================================
// VALIDAÇÃO DE TROCO
// Detecta e remove valores que são claramente troco de um cupom.
// ============================================
function removerTrocoSuspeito(tickets: number[]): number[] {
  if (tickets.length <= 1) return tickets;

  const notasComuns = [2, 5, 10, 20, 50, 100, 200];
  const indicesParaRemover = new Set<number>();

  for (let i = 0; i < tickets.length; i++) {
    if (indicesParaRemover.has(i)) continue;
    const candidatoTroco = tickets[i];

    for (let j = 0; j < tickets.length; j++) {
      if (i === j || indicesParaRemover.has(j)) continue;
      const cupom = tickets[j];

      for (const nota of notasComuns) {
        const trocoCalculado = Math.round((nota - cupom) * 100) / 100;
        if (trocoCalculado > 0 && Math.abs(trocoCalculado - candidatoTroco) < 0.02) {
          indicesParaRemover.add(i);
          break;
        }
      }
      if (indicesParaRemover.has(i)) break;
    }
  }

  if (indicesParaRemover.size === 0) return tickets;
  return tickets.filter((_, idx) => !indicesParaRemover.has(idx));
}

// Extrair valores de canhotos de cartão de uma imagem usando IA
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imagem, empresaId } = body;

    if (!imagem) {
      return NextResponse.json({ error: 'Imagem é obrigatória' }, { status: 400 });
    }

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId é obrigatório' }, { status: 400 });
    }

    if (!imagem.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Formato de imagem inválido.' }, { status: 400 });
    }

    const planCheck = await enforcePlan(empresaId, { feature: 'recIA' }, request);
    if (planCheck.error) return NextResponse.json({ error: planCheck.error }, { status: 403 });

    // Buscar configurações de IA da empresa
    const { llmModel, llmApiKey } = await loadEmpresaAIConfig(empresaId);

    if (!llmApiKey) {
      return NextResponse.json(
        { error: 'API Key não configurada. Configure nas Configurações do sistema.' },
        { status: 400 }
      );
    }

    const model = llmModel;

    const prompt = `Esta foto contém VÁRIOS cupons fiscais empilhados.

Sua única tarefa: de cada cupom, extraia APENAS o valor que aparece ao lado dos textos "VALOR A PAGAR" ou "TOTAL", seguido de "R$".
São os únicos dois campos que importam. Ignore TODOS os outros valores do cupom (itens, troco, desconto, subtotal, formas de pagamento, etc).

Cada cupom fiscal tem exatamente UM desses campos. Encontre todos os cupons na imagem e extraia o valor de cada um.

Regras de saída:
- Formato decimal com ponto: 100.00 (não 100,00)
- Retorne apenas números positivos
- Não duplique valores - cada cupom = um valor
- Se não conseguir ler um valor, pule-o mas CONTINUE procurando os outros
- O total deve ser a soma EXATA de todos os valores encontrados

Responda APENAS com JSON neste formato exato, sem nenhum texto adicional:
{"tickets": [{"valor": 100.00}, {"valor": 30.00}, {"valor": 45.50}],"total": 175.50}`;

    console.log(`[EXTRAIR-CARTAO] Modelo: ${model} | Provedor: ${detectProvider(model)}`);

    const result = await callAI(prompt, imagem, llmApiKey, model, {
      temperature: 0.1,
      maxTokens: 4000,
      jsonMode: true,
      responseFormat: true,
    });
    const content = result.content;

    console.log(`[EXTRAIR-CARTAO] Conteúdo extraído (provedor: ${result.provider}):`, content.substring(0, 300));

    // Extrair JSON da resposta
    let resultado;
    try {
      let cleanContent = content
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();

      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        resultado = JSON.parse(jsonMatch[0]);
      } else {
        resultado = JSON.parse(cleanContent);
      }
    } catch {
      // Segunda tentativa: extrair total com regex
      const totalMatch = content.match(/"total"\s*:\s*"?([\d.,]+)"?/i);
      if (totalMatch) {
        const totalNum = parseFloat(totalMatch[1].replace(',', '.'));
        if (!isNaN(totalNum) && totalNum > 0) {
          resultado = { tickets: [{ valor: totalNum }], total: totalNum };
        } else {
          throw new Error('Não foi possível extrair valores dos canhotos');
        }
      } else {
        console.error('[EXTRAIR-CARTAO] Falha ao parsear resposta da IA:', content.substring(0, 500));
        return NextResponse.json(
          { error: 'A IA não conseguiu identificar os valores dos canhotos.' },
          { status: 500 }
        );
      }
    }

    // Validar resultado
    const totalIA = typeof resultado.total === 'number' ? resultado.total : parseFloat(resultado.total);
    const tickets = Array.isArray(resultado.tickets) ? resultado.tickets.map((t: any) => typeof t.valor === 'number' ? t.valor : parseFloat(t.valor)).filter((v: number) => !isNaN(v) && v > 0) : [];

    if (isNaN(totalIA) || totalIA <= 0) {
      return NextResponse.json(
        { error: 'Nenhum valor de cartão identificado na foto. Certifique-se de que os canhotos estejam visíveis.' },
        { status: 400 }
      );
    }

    // Remover valores que são claramente TROCO
    const ticketsFiltrados = removerTrocoSuspeito(tickets);
    if (ticketsFiltrados.length < tickets.length) {
      const removidos = tickets.length - ticketsFiltrados.length;
      console.log(`[EXTRAIR-CARTAO] TROCO DETECTADO: ${removidos} valor(es) removido(s) como troco suspeito | Antes: [${tickets.join(', ')}] | Depois: [${ticketsFiltrados.join(', ')}]`);
    }

    // Build 130: Soma calculada pelo código (confiável), não pela IA
    const totalCalculado = ticketsFiltrados.reduce((soma: number, v: number) => soma + v, 0);
    const somaConferida = Math.abs(totalCalculado - totalIA) < 0.01;

    // Logar discrepância para monitoramento
    if (!somaConferida) {
      console.log(`[EXTRAIR-CARTAO] DISCREPANCIA: IA disse ${totalIA} | Código calculou ${totalCalculado} | Diferença: ${(totalCalculado - totalIA).toFixed(2)} | Provedor: ${result.provider}`);
    }

    return NextResponse.json({
      success: true,
      tickets: ticketsFiltrados,
      total: totalCalculado,
      totalIA: somaConferida ? undefined : totalIA,
      totalConferido: somaConferida,
      quantidade: ticketsFiltrados.length,
      provider: result.provider,
      model,
    });

  } catch (error) {
    console.error('Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: `Erro: ${errorMessage}` }, { status: 500 });
  }
}
