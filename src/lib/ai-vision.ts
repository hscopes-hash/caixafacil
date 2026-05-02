/**
 * ai-vision.ts — Módulo compartilhado para chamadas de IA Vision (OCR)
 *
 * Centraliza a lógica de chamada à API de IA para todos os endpoints de OCR:
 * - /api/leituras/extrair (leitura de display)
 * - /api/leituras/extrair-cartao (canhotos de cartão)
 * - /api/leituras/identificar-lote (identificar máquina por etiqueta)
 * - /api/ocr (leitura de display 7 segmentos)
 *
 * Otimizações:
 * - responseMimeType: "application/json" força saída JSON válida no Gemini
 * - response_format: { type: "json_object" } para GLM e OpenRouter
 * - Timeout unificado com AbortController
 * - Tratamento de erros amigável por provedor
 */

import { db } from '@/lib/db';
import { generateZhipuToken, getApiKeyForModel, detectProvider } from '@/lib/zhipu-auth';

// ============================================
// CONFIGURAÇÃO PADRÃO
// ============================================

export const AI_TIMEOUT = 55000; // 55s (dentro do limite do Vercel)
export const OCR_TIMEOUT = 30000; // 30s (OCR é rápido, não precisa de 55s)
export const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

// ============================================
// EXTRAÇÃO DE CONTEÚDO
// ============================================

export function extractContent(data: any, provider: string): string | null {
  if (provider === 'glm' || provider === 'openrouter') {
    return data?.choices?.[0]?.message?.content || null;
  }
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

// ============================================
// OPÇÕES DE CHAMADA
// ============================================

export interface CallAIOptions {
  temperature?: number;
  maxTokens?: number;
  /** Timeout personalizado (padrão: AI_TIMEOUT) */
  timeout?: number;
  /** Gemini: forçar saída JSON (elimina markdown/regex parsing) */
  jsonMode?: boolean;
  /** GLM/OpenRouter: forçar response_format json_object */
  responseFormat?: boolean;
}

// ============================================
// CHAMADA ÚNICA À IA (MULTI-PROVEDOR)
// ============================================

export async function callAI(
  prompt: string,
  imagem: string,
  apiKey: string,
  model: string,
  options: CallAIOptions = {}
): Promise<{ content: string; provider: string }> {
  const {
    temperature = 0.1,
    maxTokens = 200,
    timeout = AI_TIMEOUT,
    jsonMode = true,
    responseFormat = true,
  } = options;

  const provider = detectProvider(model);
  const base64Data = imagem.split(',')[1];
  const mimeType = imagem.split(';')[0].split(':')[1];

  let response: Response;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    if (provider === 'glm') {
      const authToken = generateZhipuToken(apiKey);
      response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: imagem } },
              ],
            },
          ],
          temperature,
          max_tokens: maxTokens,
          ...(responseFormat ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
    } else if (provider === 'openrouter') {
      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: imagem } },
              ],
            },
          ],
          temperature,
          max_tokens: maxTokens,
          ...(responseFormat ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
    } else {
      // Gemini — com otimização responseMimeType para JSON
      const generationConfig: Record<string, any> = {
        temperature,
        maxOutputTokens: maxTokens,
      };

      if (jsonMode) {
        generationConfig.responseMimeType = 'application/json';
      }

      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  { inline_data: { mime_type: mimeType, data: base64Data } },
                ],
              },
            ],
            generationConfig,
          }),
        }
      );
    }
  } finally {
    clearTimeout(timeoutId);
  }

  const responseText = await response.text();

  if (!response.ok) {
    handleProviderError(responseText, response.status, provider);
  }

  const data = JSON.parse(responseText);
  const content = extractContent(data, provider);

  if (!content) {
    if (data?.promptFeedback?.blockReason) {
      throw new Error(`Imagem bloqueada: ${data.promptFeedback.blockReason}`);
    }
    throw new Error('Resposta vazia da IA');
  }

  return { content, provider };
}

// ============================================
// CHAMADA COM MÚLTIPLAS IMAGENS (OCR route)
// ============================================

export async function callAIMultiImage(
  systemPrompt: string,
  userPrompt: string,
  images: Array<{ base64: string; mimeType?: string }>,
  apiKey: string,
  model: string,
  options: CallAIOptions = {}
): Promise<{ content: string; provider: string }> {
  const {
    temperature = 0,
    maxTokens = 30,
    timeout = OCR_TIMEOUT,
    jsonMode = true,
    responseFormat = true,
  } = options;

  const provider = detectProvider(model);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  let response: Response;

  try {
    if (provider === 'glm') {
      const authToken = generateZhipuToken(apiKey);
      const content: any[] = [
        { type: 'text', text: userPrompt },
        ...images.map(img => ({
          type: 'image_url' as const,
          image_url: { url: `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}` },
        })),
      ];

      response = await fetch('https://open.bigmodel.cn/api/paas/v4/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content },
          ],
          max_tokens: maxTokens,
          temperature,
          ...(responseFormat ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
    } else if (provider === 'openrouter') {
      const content: any[] = [
        { type: 'text', text: userPrompt },
        ...images.map(img => ({
          type: 'image_url' as const,
          image_url: { url: `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}` },
        })),
      ];

      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content },
          ],
          max_tokens: maxTokens,
          temperature,
          ...(responseFormat ? { response_format: { type: 'json_object' } } : {}),
        }),
      });
    } else {
      // Gemini
      const parts: any[] = [
        { text: systemPrompt + '\n\n' + userPrompt },
        ...images.map(img => ({
          inline_data: { mime_type: img.mimeType || 'image/jpeg', data: img.base64 },
        })),
      ];

      const generationConfig: Record<string, any> = {
        temperature,
        maxOutputTokens: maxTokens,
      };
      if (jsonMode) {
        generationConfig.responseMimeType = 'application/json';
      }

      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig,
          }),
        }
      );
    }
  } finally {
    clearTimeout(timeoutId);
  }

  const responseText = await response.text();

  if (!response.ok) {
    handleProviderError(responseText, response.status, provider);
  }

  const data = JSON.parse(responseText);
  const content = extractContent(data, provider);

  if (!content) {
    throw new Error('Resposta vazia da IA');
  }

  return { content, provider };
}

// ============================================
// TRATAMENTO DE ERROS POR PROVEDOR
// ============================================

function handleProviderError(responseText: string, status: number, provider: string): never {
  try {
    const errData = JSON.parse(responseText);
    const errCode = errData?.error?.code;
    const errMsg = errData?.error?.message || '';

    // Erros do Zhipu (GLM)
    if (provider === 'glm') {
      if (errCode === '1305') {
        throw new Error('Modelo GLM gratuito com excesso de tráfego no momento. Tente novamente em alguns segundos ou use outro modelo de IA.');
      }
      if (errCode === '1301' || errCode === '1302') {
        throw new Error('Chave API do GLM inválida ou expirada. Verifique a configuração de IA.');
      }
      if (errCode === '1004' || errCode === '1006') {
        throw new Error('Limite de uso da API GLM atingido. Tente novamente mais tarde ou use outro modelo.');
      }
    }

    // Erros do Gemini
    if (provider === 'gemini') {
      if (status === 429) {
        throw new Error('Limite de requisições do Gemini atingido. Tente novamente em alguns segundos.');
      }
      if (status === 403) {
        throw new Error('Chave API do Gemini inválida ou sem permissão. Verifique a configuração de IA.');
      }
      if (status === 404) {
        throw new Error('Modelo não encontrado no Gemini. Verifique o nome do modelo na configuração de IA.');
      }
      if (errMsg) {
        throw new Error(`Erro do Gemini: ${errMsg}`);
      }
    }

    // Erros do OpenRouter
    if (provider === 'openrouter' && errData?.error) {
      throw new Error(`Erro do OpenRouter: ${errData.error.message || errData.error}`);
    }

    // Fallback genérico
    throw new Error(`Erro da IA (código ${status}): ${errMsg || 'Erro desconhecido'}`);
  } catch (e) {
    if (e instanceof Error && (
      e.message.includes('Modelo GLM') ||
      e.message.includes('Chave API') ||
      e.message.includes('Limite') ||
      e.message.includes('Erro da IA') ||
      e.message.includes('Erro do Gemini') ||
      e.message.includes('Erro do OpenRouter') ||
      e.message.includes('Modelo não encontrado')
    )) {
      throw e;
    }
    const error = new Error(responseText.substring(0, 300));
    (error as any).status = status;
    throw error;
  }
}

// ============================================
// CARREGAR CONFIGURAÇÃO DE IA DA EMPRESA
// ============================================

export async function loadEmpresaAIConfig(empresaId: string, fallbackModel?: string) {
  let llmApiKey = '';
  let llmModel = fallbackModel?.trim() || DEFAULT_MODEL;

  try {
    const empresa = await db.empresa.findUnique({
      where: { id: empresaId },
      select: {
        llmApiKey: true,
        llmModel: true,
        llmApiKeyGemini: true,
        llmApiKeyGlm: true,
        llmApiKeyOpenrouter: true,
      },
    });
    if (empresa) {
      llmModel = empresa.llmModel?.trim() || llmModel;
      llmApiKey = getApiKeyForModel(
        llmModel,
        empresa.llmApiKey,
        empresa.llmApiKeyGemini,
        empresa.llmApiKeyGlm,
        empresa.llmApiKeyOpenrouter
      ) || '';
    }
  } catch {
    // Usa valores padrão
  }

  return { llmModel, llmApiKey };
}
