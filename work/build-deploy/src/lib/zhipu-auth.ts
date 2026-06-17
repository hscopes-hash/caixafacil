import crypto from 'node:crypto';

// ============================================
// DETECÇÃO DE PROVEDOR
// ============================================

export type Provider = 'gemini' | 'glm' | 'openrouter';

/**
 * Detecta o provedor baseado no nome do modelo.
 * OpenRouter: contém "/" (ex: google/gemini-2.0-flash-exp:free)
 * GLM: começa com "glm-"
 * Gemini: demais casos
 */
export function detectProvider(model: string): Provider {
  if (model.includes('/')) return 'openrouter';
  if (model.startsWith('glm-')) return 'glm';
  return 'gemini';
}

/**
 * Retorna a API Key para o modelo solicitado.
 *
 * Prioridade: ENV var do sistema > chave específica do provedor (DB) > chave genérica (DB)
 *
 * ENV vars usadas:
 *   - GEMINI_API_KEY      → para modelos Gemini
 *   - GLM_API_KEY         → para modelos GLM (formato: id.secret)
 *   - OPENROUTER_API_KEY  → para modelos OpenRouter
 *   - LLM_API_KEY         → fallback genérico (qualquer provedor)
 */
export function getApiKeyForModel(model: string, empresaApiKey?: string | null, empresaApiKeyGemini?: string | null, empresaApiKeyGlm?: string | null, empresaApiKeyOpenrouter?: string | null): string | null {
  const provider = detectProvider(model);

  if (provider === 'glm') {
    return process.env.GLM_API_KEY?.trim()
      || empresaApiKeyGlm?.trim()
      || process.env.LLM_API_KEY?.trim()
      || empresaApiKey?.trim()
      || null;
  }
  if (provider === 'openrouter') {
    return process.env.OPENROUTER_API_KEY?.trim()
      || empresaApiKeyOpenrouter?.trim()
      || process.env.LLM_API_KEY?.trim()
      || empresaApiKey?.trim()
      || null;
  }
  // Gemini (padrão)
  return process.env.GEMINI_API_KEY?.trim()
    || empresaApiKeyGemini?.trim()
    || process.env.LLM_API_KEY?.trim()
    || empresaApiKey?.trim()
    || null;
}

/**
 * Retorna o modelo de IA configurado.
 *
 * Prioridade: ENV var LLM_MODEL > modelo do DB > padrão
 */
export function getModel(fallbackModel?: string, dbModel?: string | null): string {
  return process.env.LLM_MODEL?.trim()
    || dbModel?.trim()
    || fallbackModel?.trim()
    || 'gemini-3.1-flash-lite';
}

/**
 * Gera um token JWT para autenticação com a API da Zhipu AI (GLM).
 *
 * A API Key da Zhipu AI tem formato: {id}.{secret}
 * O JWT é gerado usando HMAC-SHA256 com o secret como chave.
 *
 * @param apiKey - API Key completa no formato "{id}.{secret}"
 * @param expSeconds - Validade do token em segundos (padrão: 3600 = 1 hora)
 * @returns Token JWT string
 */
export function generateZhipuToken(apiKey: string, expSeconds: number = 3600): string {
  const dotIndex = apiKey.indexOf('.');
  if (dotIndex === -1) {
    throw new Error('Formato de API Key Zhipu AI inválido. Esperado: {id}.{secret}');
  }

  const id = apiKey.substring(0, dotIndex);
  const secret = apiKey.substring(dotIndex + 1);

  const header = JSON.stringify({ alg: 'HS256', sign_type: 'SIGN' });

  const now = Date.now();
  const payload = JSON.stringify({
    api_key: id,
    exp: now + expSeconds * 1000,
    timestamp: now,
  });

  function base64url(str: string): string {
    return Buffer.from(str, 'utf-8')
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');
  }

  const encodedHeader = base64url(header);
  const encodedPayload = base64url(payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', secret)
    .update(signingInput)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${signingInput}.${signature}`;
}
