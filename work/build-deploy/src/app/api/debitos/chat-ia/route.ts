import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { loadAIConfig, getVertexAccessToken, getVertexModel, VERTEX_LOCATIONS, tryVertexAIRegion } from '@/lib/ai-vision';

interface LLMAction {
  acao: string;
  dados?: Record<string, unknown>;
  friendlyText?: string;
}

function parseActionFromResponse(text: string): { action: LLMAction | null; friendlyText: string } {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/);
  let rawJsonMatch: RegExpMatchArray | null = null;
  if (!jsonMatch) {
    rawJsonMatch = text.match(/\{[\s\S]*?"acao"[\s\S]*?\}/);
  }
  let action: LLMAction | null = null;
  let friendlyText = text;
  const jsonBlock = jsonMatch ? jsonMatch[1].trim() : rawJsonMatch ? rawJsonMatch[0] : null;
  if (jsonBlock) {
    try {
      action = JSON.parse(jsonBlock);
      friendlyText = text.replace(/```json\s*[\s\S]*?```/, '').trim();
      if (rawJsonMatch && !jsonMatch) {
        friendlyText = text.replace(rawJsonMatch[0], '').trim();
      }
    } catch {
      try {
        const cleaned = jsonBlock.replace(/[,]\s*([}\]])/g, '$1');
        action = JSON.parse(cleaned);
        friendlyText = text.replace(/```json\s*[\s\S]*?```/, '').trim();
        if (rawJsonMatch && !jsonMatch) {
          friendlyText = text.replace(rawJsonMatch[0], '').trim();
        }
      } catch {}
    }
  }
  const cleaned = (friendlyText || text).replace(/^\s*[\r\n]+|\s*[\r\n]+$/g, '').trim();
  return { action, friendlyText: cleaned };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mensagem, empresaId, clienteId } = body;

    if (!mensagem || !empresaId) {
      return NextResponse.json(
        { error: 'Mensagem e empresaId são obrigatórios' },
        { status: 400 }
      );
    }

    // Buscar débitos do cliente para contexto (com try/catch para graceful degradation)
    let debitosContext = '';
    try {
      const whereClause: Record<string, unknown> = { empresaId };
      if (clienteId) {
        whereClause.clienteId = clienteId;
      } else {
        whereClause.cliente = { empresaId: empresaId };
      }

      const debitos = await db.conta.findMany({
        where: whereClause,
        include: {
          cliente: {
            select: { nome: true },
          },
        },
        orderBy: { data: 'desc' },
        take: 20,
      });

      if (debitos.length > 0) {
        debitosContext = `\n\nDÉBITOS EXISTENTES:\n${debitos.map(d =>
          `ID: ${d.id} | Cliente: ${d.cliente.nome} | ${d.descricao} | R$ ${d.valor.toFixed(2)} | Venc: ${new Date(d.data).toLocaleDateString('pt-BR')} | Paga: ${d.paga ? 'Sim' : 'Nao'}`
        ).join('\n')}`;
      }
    } catch (debitoErr) {
      console.warn('Não foi possível buscar débitos para contexto:', debitoErr);
      debitosContext = '';
    }

    // Buscar configurações de IA (ConfigSaaS global)
    const { llmModel } = await loadAIConfig();

    // Montar prompt do sistema
    const systemPrompt = `Você é um assistente de gestão de débitos. Ajude o usuário a gerenciar débitos de clientes.
Responda SEMPRE em português brasileiro.

Ações disponíveis:
- "listar": Listar débitos (filtros opcionais: clienteId, status)
- "criar": Criar novo débito (campos: descricao, valor, data, clienteId)
- "pagar": Marcar débito como pago (campo: id, dataPagamento)
- "excluir": Excluir débito (campo: id)

Responda com JSON no formato:
{"acao": "nome_da_acao", "dados": {...}, "friendlyText": "Mensagem amigável para o usuário"}

Se a pergunta for apenas informativa, responda normalmente sem ação.
${debitosContext}`;

    // Vertex AI only
    let accessToken: string;
    try {
      accessToken = await getVertexAccessToken();
    } catch {
      return NextResponse.json(
        { error: 'Falha ao obter token de acesso do Vertex AI.' },
        { status: 400 }
      );
    }

    const vertexModel = getVertexModel(llmModel);

    const contents = [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Entendido, sou o assistente de gestão de débitos.' }] },
      { role: 'user', parts: [{ text: mensagem }] },
    ];

    const generationConfig = { temperature: 0.3, maxOutputTokens: 1024 };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let llmText = '';
    try {
      let lastError: string | null = null;
      for (const region of VERTEX_LOCATIONS) {
        const result = await tryVertexAIRegion(
          region, accessToken, vertexModel, contents, generationConfig, controller.signal
        );
        if (result) {
          llmText = result.content;
          break;
        }
        lastError = `[VERTEX ${region}] Falhou`;
      }
      if (!llmText) {
        throw new Error(`Vertex AI falhou em todas as regioes (${VERTEX_LOCATIONS.join(', ')}). Ultimo erro: ${lastError}`);
      }
    } catch (fetchErr: unknown) {
      clearTimeout(timeoutId);
      const errMsg = fetchErr instanceof Error ? fetchErr.message : 'Erro desconhecido';
      if (errMsg.includes('abort') || errMsg.includes('timeout')) {
        return NextResponse.json({ error: 'Tempo esgotado ao comunicar com IA. Tente novamente.' }, { status: 504 });
      }
      return NextResponse.json({ error: 'Erro Vertex AI: ' + errMsg.substring(0, 120) }, { status: 502 });
    } finally {
      clearTimeout(timeoutId);
    }

    // Extrair mensagem (Vertex AI / Gemini format)
    const llmMessage = llmText;

    // Parsear ação da resposta
    const parsed = parseActionFromResponse(llmMessage);

    let finalText = '';

    // 1) Usar friendlyText de dentro do JSON parseado
    if (parsed.action?.friendlyText) {
      finalText = parsed.action.friendlyText;
    }
    // 2) Usar texto limpo fora do bloco JSON
    else if (parsed.friendlyText && parsed.friendlyText !== llmMessage) {
      finalText = parsed.friendlyText;
    }
    // 3) Fallback: remover blocos json da resposta
    if (!finalText.trim()) {
      finalText = llmMessage.replace(/```json[\s\S]*?```/g, '').trim() || '';
    }
    // 4) NUNCA mostrar JSON bruto para o usuario
    if (!finalText.trim() || (finalText.trim().startsWith('{') && finalText.trim().endsWith('}'))) {
      if (parsed.action?.acao) {
        finalText = parsed.action.friendlyText || 'Ação executada com sucesso.';
      } else {
        finalText = llmMessage.substring(0, 200);
      }
    }

    // Executar ação se identificada
    let resultadoAcao: unknown = null;

    if (parsed.action?.acao && parsed.action.dados) {
      try {
        switch (parsed.action.acao) {
          case 'listar': {
            const whereClause2: Record<string, unknown> = { empresaId };
            if (parsed.action.dados.clienteId) whereClause2.clienteId = parsed.action.dados.clienteId as string;
            if (parsed.action.dados.paga !== undefined) whereClause2.paga = parsed.action.dados.paga as boolean;
            if (!parsed.action.dados.clienteId) whereClause2.cliente = { empresaId: empresaId };
            
            resultadoAcao = await db.conta.findMany({
              where: whereClause2,
              include: { cliente: { select: { id: true, nome: true } } },
              orderBy: { data: 'desc' },
            });
            break;
          }
          case 'criar': {
            const dados = parsed.action.dados;
            if (!dados.descricao || !dados.valor || !dados.data || !dados.clienteId) {
              finalText = 'Campos obrigatórios faltando para criar débito.';
            } else {
              resultadoAcao = await db.conta.create({
                data: {
                  descricao: dados.descricao as string,
                  valor: parseFloat(String(dados.valor)),
                  data: new Date((dados.data || dados.data) as string),
                  clienteId: dados.clienteId as string,
                  empresaId,
                },
                include: { cliente: { select: { id: true, nome: true } } },
              });
            }
            break;
          }
          case 'pagar': {
            if (!parsed.action.dados.id) {
              finalText = 'ID do débito é obrigatório para pagar.';
            } else {
              resultadoAcao = await db.conta.update({
                where: { id: parsed.action.dados.id as string },
                data: {
                  paga: true,
                  dataPagamento: parsed.action.dados.dataPagamento 
                    ? new Date(parsed.action.dados.dataPagamento as string)
                    : new Date(),
                },
                include: { cliente: { select: { id: true, nome: true } } },
              });
            }
            break;
          }
          case 'excluir': {
            if (!parsed.action.dados.id) {
              finalText = 'ID do débito é obrigatório para excluir.';
            } else {
              resultadoAcao = await db.conta.delete({
                where: { id: parsed.action.dados.id as string },
              });
            }
            break;
          }
        }
      } catch (acaoErr) {
        console.error('Erro ao executar ação:', acaoErr);
        finalText = `Erro ao executar ação: ${acaoErr instanceof Error ? acaoErr.message : 'Erro desconhecido'}`;
      }
    }

    // Formatar resultado das ações para exibição amigável
    if (resultadoAcao && Array.isArray(resultadoAcao) && resultadoAcao.length > 0) {
      // Listar: formatar débitos encontrados
      const total = resultadoAcao.reduce((s: number, d: any) => s + (d.valor || 0), 0);
      const pendentes = resultadoAcao.filter((d: any) => !d.paga);
      const totalPendente = pendentes.reduce((s: number, d: any) => s + (d.valor || 0), 0);
      finalText = finalText + '\n\n' +
        resultadoAcao.map((d: any) =>
          '- ' + (d.descricao || 'Sem descrição') + ' | R$ ' + (d.valor || 0).toFixed(2) + ' | ' + (d.paga ? 'Pago' : 'Pendente')
        ).join('\n') +
        '\n\nTotal: ' + resultadoAcao.length + ' débito(s) | R$ ' + total.toFixed(2) +
        '\nPendentes: ' + pendentes.length + ' | R$ ' + totalPendente.toFixed(2);
    } else if (resultadoAcao && !Array.isArray(resultadoAcao)) {
      // Criar/Pagar/Excluir: confirmar ação
      const desc = (resultadoAcao as any).descricao || '';
      const valor = (resultadoAcao as any).valor || 0;
      const pago = (resultadoAcao as any).paga;
      if (parsed.action?.acao === 'criar') {
        finalText = finalText + '\n\nDébito criado: ' + desc + ' | R$ ' + valor.toFixed(2);
      } else if (parsed.action?.acao === 'pagar') {
        finalText = finalText + '\n\nDébito marcado como pago: ' + desc + ' | R$ ' + valor.toFixed(2);
      } else if (parsed.action?.acao === 'excluir') {
        finalText = finalText + '\n\nDébito excluído com sucesso.';
      }
    } else if (resultadoAcao && Array.isArray(resultadoAcao) && resultadoAcao.length === 0) {
      finalText = finalText + '\n\nNenhum débito encontrado.';
    }

    return NextResponse.json({
      text: finalText,
      acao: parsed.action?.acao || null,
      resultado: resultadoAcao,
    });
  } catch (error) {
    console.error('Erro no chat-ia:', error);
    return NextResponse.json(
      { error: 'Erro ao processar mensagem' },
      { status: 500 }
    );
  }
}
