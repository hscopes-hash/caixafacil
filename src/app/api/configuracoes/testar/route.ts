import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Função para detectar o provedor com base no nome do modelo
function getProvider(model: string): 'gemini' | 'glm' {
  if (model.startsWith('glm-')) return 'glm';
  return 'gemini';
}

// POST - Testar conexão com a API de IA (Gemini ou GLM)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { empresaId } = body;

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId é obrigatório' }, { status: 400 });
    }

    // Buscar configurações da empresa
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { llmApiKey: true, llmModel: true },
    });

    if (!empresa) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    // Prioridade: empresa config > env
    const apiKey = empresa.llmApiKey?.trim() || process.env.LLM_API_KEY?.trim();
    const model = empresa.llmModel?.trim() || process.env.LLM_MODEL?.trim() || 'gemini-2.5-flash-lite';

    console.log('=== TESTE CONEXÃO ===');
    console.log('Modelo:', model);
    console.log('Provedor:', getProvider(model));
    console.log('API Key configurada na empresa:', !!empresa.llmApiKey);
    console.log('API Key do env:', !!process.env.LLM_API_KEY);
    console.log('API Key (primeiros 10):', apiKey ? apiKey.substring(0, 10) : 'NENHUMA');
    console.log('=======================');

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Nenhuma API Key configurada. Defina uma chave nas Configurações ou configure LLM_API_KEY no Vercel.' },
        { status: 400 }
      );
    }

    const provider = getProvider(model);
    let response: Response;

    if (provider === 'glm') {
      // ===== Zhipu AI (GLM) - OpenAI compatible =====
      const url = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'user', content: 'Responda APENAS com a palavra "OK".' },
          ],
          temperature: 0,
          max_tokens: 10,
        }),
      });
    } else {
      // ===== Google Gemini =====
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: 'Responda APENAS com a palavra "OK".' }] },
          ],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 10,
          },
        }),
      });
    }

    const responseText = await response.text();
    console.log('Status HTTP:', response.status);
    console.log('Resposta da API:', responseText.substring(0, 500));

    if (!response.ok) {
      let errorMsg = '';
      let errorDetalhe = '';

      try {
        const errorJson = JSON.parse(responseText);

        if (provider === 'glm') {
          // Formato GLM: { error: { code, message } } ou { error: { message } }
          const glmError = errorJson?.error;
          const glmCode = glmError?.code || '';
          const glmMsg = glmError?.message || '';
          errorDetalhe = `[${glmCode}] ${glmMsg}`;

          if (response.status === 401 || response.status === 403) {
            errorMsg = `API Key inválida para Zhipu AI. Verifique em https://open.bigmodel.cn/usercenter/apikeys`;
          } else if (response.status === 400) {
            errorMsg = `Requisição inválida: ${glmMsg || responseText.substring(0, 200)}`;
          } else if (response.status === 429) {
            errorMsg = `Limite de requisições da Zhipu AI atingido. Aguarde 1 minuto ou use outro modelo.`;
          } else if (response.status === 404) {
            errorMsg = `Modelo "${model}" não encontrado na Zhipu AI. Verifique o nome do modelo.`;
          } else {
            errorMsg = `Erro ${response.status}: ${glmMsg || responseText.substring(0, 200)}`;
          }
        } else {
          // Formato Gemini: { error: { message, status } }
          const geminiError = errorJson?.error;
          const geminiMsg = geminiError?.message || errorJson?.message || '';
          errorDetalhe = geminiMsg;

          if (response.status === 401 || response.status === 403) {
            errorMsg = `API Key inválida para Google Gemini. Verifique em https://aistudio.google.com/apikey`;
          } else if (response.status === 400) {
            errorMsg = `Requisição inválida: ${geminiMsg || responseText.substring(0, 200)}`;
          } else if (response.status === 429) {
            errorMsg = `Limite de requisições do Gemini atingido (15 req/min no plano gratuito). Aguarde 1 minuto.`;
          } else if (response.status === 404) {
            errorMsg = `Modelo "${model}" não encontrado. Verifique se o nome está correto.`;
          } else {
            errorMsg = `Erro ${response.status}: ${geminiMsg || responseText.substring(0, 200)}`;
          }
        }
      } catch {
        errorMsg = `Erro ${response.status}: ${responseText.substring(0, 200)}`;
        errorDetalhe = responseText.substring(0, 200);
      }

      return NextResponse.json(
        { error: errorMsg, detalhe: errorDetalhe, status: response.status },
        { status: 400 }
      );
    }

    const data = JSON.parse(responseText);

    // Extrair resposta conforme provedor
    let content: string | null;
    if (provider === 'glm') {
      content = data?.choices?.[0]?.message?.content || null;
    } else {
      content = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    }

    const provedorLabel = provider === 'glm' ? 'Zhipu AI (GLM)' : 'Google Gemini';

    return NextResponse.json({
      success: true,
      mensagem: `Conexão OK! ${provedorLabel} - Modelo: ${model}`,
      modelo: model,
      provider,
      apiKeyFonte: empresa.llmApiKey ? 'personalizada' : 'sistema (env)',
    });
  } catch (error) {
    console.error('Erro ao testar conexão:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: `Erro de conexão: ${errorMessage}` }, { status: 500 });
  }
}
