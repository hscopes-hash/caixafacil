import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { loadAIConfig, getVertexAccessToken, getVertexModel, VERTEX_LOCATIONS, tryVertexAIRegionStream } from '@/lib/ai-vision';
import { gatherCompanyContext, detectIntent } from '@/lib/gather-context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Rota de streaming para chat IA em tempo real (baixa latência)
// Retorna Server-Sent Events (SSE) com chunks de texto conforme o Vertex AI gera
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mensagem, empresaId, usuarioId, historyMessages = [] } = body;

    if (!mensagem || !empresaId) {
      return new Response(JSON.stringify({ error: 'mensagem e empresaId são obrigatórios' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Detectar intenção para carregar contexto relevante
    const intent = detectIntent(mensagem);

    // Carregar contexto da empresa (paralelo)
    const [companyContext] = await Promise.all([
      gatherCompanyContext(empresaId, intent),
    ]);

    // Buscar configurações de IA
    const { llmModel } = await loadAIConfig();

    // Calcular datas no timezone do Brasil
    const agoraBrasil = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const hojeBrasil = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const amanhaBrasil = new Date(Date.now() + 86400000).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const ontemBrasil = new Date(Date.now() - 86400000).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const systemPrompt = `Você é o ESPECIALISTA VIRTUAL do CaixaFacil, sistema de gestão financeira de máquinas de entretenimento (sinuca, jogos, vending machines, etc.).

## SEU PAPEL
Você é um analista financeiro e operacional especialista no CaixaFacil. Você:
- Conhece profundamente o sistema: clientes, máquinas, leituras, contas, pagamentos, fluxo de caixa
- Tem acesso em tempo real ao banco de dados de PRODUÇÃO da empresa
- Pode consultar, criar, editar e liquidar contas
- Orienta o usuário em decisões financeiras e operacionais

## DATA E HORA ATUAL (referência obrigatória)
- Agora: ${agoraBrasil}
- Hoje: ${hojeBrasil}
- Amanhã: ${amanhaBrasil}
- Ontem: ${ontemBrasil}
IMPORTANTE: Use SEMPRE estas datas. Formato JSON: AAAA-MM-DD.

## DADOS DA EMPRESA (resumo — NÃO é a lista completa)
${companyContext}

## REGRAS FUNDAMENTAIS
1. RESPOSTAS EM LINGUAGEM NATURAL: frases completas, português brasileiro coloquial, formato de moeda R$ X.XXX,XX. Evite símbolos como |, [], {}, tabelas.
2. SEMPRE USE AÇÃO JSON PARA CONSULTAS: quando o usuário pedir para VER, LISTAR, MOSTRAR, CONSULTAR, retorne a ação JSON correspondente.
3. PERGUNTAS CONVERSAÇÃOIS (saudações, dúvidas gerais) não precisam de JSON.
4. FOCO NO CAIXAFACIL: Você é especialista EXCLUSIVO do CaixaFacil. Só responda sobre:
   - Clientes, máquinas, leituras, contas, pagamentos, fluxo de caixa
   - Funcionalidades do sistema CaixaFacil (cobrança, leitura, ajuste, relatórios, OCR, etc.)
   - Dúvidas operacionais sobre como usar o sistema
   Se o usuário perguntar sobre assuntos FORA do escopo (política, esportes, receitas, programação, notícias, etc.), recuse educadamente: "Sou especialista apenas no CaixaFacil. Posso ajudar com clientes, máquinas, contas, pagamentos e fluxo de caixa. Como posso ajudar com isso?" NUNCA tente responder assuntos externos.

## AÇÕES DISPONÍVEIS
- "listar_contas": Listar contas (clienteId, tipo: 0=Pagar/1=Receber, paga: true/false)
- "criar_conta": Criar conta (descricao, valor, data, tipo, clienteId — todos obrigatórios)
- "liquidar_conta": Marcar como paga (clienteId + valor + data)
- "excluir_conta": Excluir (clienteId + valor + data)
- "editar_conta": Alterar conta pendente (clienteId + valor + data + campos a alterar)
- "listar_clientes": Listar clientes
- "listar_maquinas": Listar máquinas (por clienteId)
- "resumo_financeiro": Resumo financeiro detalhado

## FORMATO DA RESPOSTA
Para ações: {"acao": "nome_da_acao", "dados": {...}}
Para modificações: inclua "friendlyText" explicando.
NUNCA invente dados. Se faltar informação, pergunte em texto natural.

Use formato de moeda brasileiro (R$ X.XXX,XX) em todos os valores.`;

    // Montar histórico (últimas 10 mensagens)
    const recentHistory = Array.isArray(historyMessages)
      ? historyMessages.slice(-10)
      : [];

    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Entendido, sou o especialista virtual do CaixaFacil.' }] },
      ...recentHistory.flatMap(m => [
        { role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }
      ]),
      { role: 'user', parts: [{ text: mensagem }] },
    ];

    const generationConfig = { temperature: 0.3, maxOutputTokens: 2048 };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000);

    // Obter token de acesso
    let accessToken: string;
    try {
      accessToken = await getVertexAccessToken();
    } catch {
      return new Response(JSON.stringify({ error: 'Falha ao obter token do Vertex AI.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const vertexModel = getVertexModel(llmModel);

    // Tentar streaming em cada região até conseguir
    let vertexStream: ReadableStream<Uint8Array> | null = null;
    for (const region of VERTEX_LOCATIONS) {
      vertexStream = await tryVertexAIRegionStream(
        region, accessToken, vertexModel, contents, generationConfig, controller.signal
      );
      if (vertexStream) break;
    }

    if (!vertexStream) {
      clearTimeout(timeoutId);
      return new Response(JSON.stringify({ error: 'Todas as regiões do Vertex AI falharam.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Criar stream de SSE que lê o stream do Vertex AI e envia chunks parseados
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const sseStream = new ReadableStream({
      async start(controller) {
        const reader = vertexStream!.getReader();
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });

            // Vertex AI streaming retorna JSON objects separados
            // Cada objeto tem: candidates[0].content.parts[0].text
            let braceCount = 0;
            let startIdx = -1;

            for (let i = 0; i < buffer.length; i++) {
              if (buffer[i] === '{') {
                if (braceCount === 0) startIdx = i;
                braceCount++;
              } else if (buffer[i] === '}') {
                braceCount--;
                if (braceCount === 0 && startIdx !== -1) {
                  const jsonStr = buffer.substring(startIdx, i + 1);
                  try {
                    const chunk = JSON.parse(jsonStr);
                    const text = chunk?.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
                    }
                  } catch {
                    // JSON incompleto, ignorar
                  }
                  startIdx = -1;
                }
              }
            }

            // Manter o restante não processado no buffer
            if (startIdx !== -1) {
              buffer = buffer.substring(startIdx);
            } else {
              buffer = '';
            }
          }

          // Sinalizar fim do stream
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        } catch (err: any) {
          if (err.name !== 'AbortError') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
          }
        } finally {
          clearTimeout(timeoutId);
          controller.close();
        }
      },

      cancel() {
        clearTimeout(timeoutId);
        controller.abort();
      },
    });

    // Salvar mensagem do usuário no histórico (fire-and-forget)
    db.chatHistorico.create({
      data: {
        empresaId,
        sessaoId: `stream-${usuarioId}-${Date.now()}`,
        role: 'user',
        content: mensagem.substring(0, 5000),
      },
    }).catch(() => {});

    return new Response(sseStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error: any) {
    console.error('Erro no chat-ia/stream:', error);
    return new Response(JSON.stringify({ error: error.message || 'Erro interno' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
