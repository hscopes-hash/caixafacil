/**
 * ai-vision.ts — Módulo de chamadas de IA Vision (OCR) via Vertex AI
 *
 * Provedor exclusivo: Vertex AI (Cloud Run ADC)
 *
 * Otimizações:
 * - Compressão de imagem via sharp (2048px, qualidade 92%)
 * - responseMimeType: "application/json" para Gemini
 * - Timeout unificado com AbortController
 * - Token cache do metadata server (3600s)
 * - Mapeamento de modelos obsoletos via VERTEX_MODEL_MAP
 */

import sharp from 'sharp';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { getModel } from '@/lib/zhipu-auth';

// ============================================
// CONFIGURAÇÃO PADRÃO
// ============================================

export const AI_TIMEOUT = 55000; // 55s
export const OCR_TIMEOUT = 30000; // 30s (OCR é rápido)
export const DEFAULT_MODEL = 'gemini-2.5-flash';

export const VERTEX_PROJECT = 'utopian-splicer-255210';
export const VERTEX_LOCATIONS = ['us-central1', 'southamerica-east1'];
// Regiões para chamadas de vision/OCR (multimodal) — southamerica-east1 NÃO suporta vision
export const VERTEX_LOCATIONS_VISION = ['us-central1'];

// ============================================
// MAPA DE MODELOS VERTEX
// ============================================

const VERTEX_MODEL_MAP: Record<string, string> = {
  'gemini-2.0-flash-001': 'gemini-2.5-flash',
  'gemini-2.5-flash-lite': 'gemini-2.5-flash',
  'gemini-3.1-flash': 'gemini-2.5-flash',
  'gemini-3.1-flash-lite': 'gemini-2.5-flash',
  'gemini-3.1-pro': 'gemini-2.5-pro',
  'gemini-3.5-flash': 'gemini-2.5-flash',
};

export function getVertexModel(model?: string | null): string {
  const name = model?.trim() || DEFAULT_MODEL;
  return VERTEX_MODEL_MAP[name] || name;
}

// ============================================
// COMPRESSÃO DE IMAGEM
// ============================================

/**
 * Comprime mantendo alta qualidade para OCR (2048px, 92% JPEG).
 * Preserva detalhes de dígitos em displays.
 */
export async function compressImage(base64DataUrl: string): Promise<string> {
  try {
    const matches = base64DataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) return base64DataUrl;

    const mimeType = matches[1];
    const buffer = Buffer.from(matches[2], 'base64');
    const inputSize = buffer.length;

    if (inputSize < 500_000) {
      return base64DataUrl;
    }

    const compressed = await sharp(buffer)
      .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer();

    const outputSize = compressed.length;
    const reduction = ((1 - outputSize / inputSize) * 100).toFixed(0);
    console.log(`[COMPRESS] ${inputSize} -> ${outputSize} bytes (${reduction}% reducao)`);

    return `data:image/jpeg;base64,${compressed.toString('base64')}`;
  } catch (err) {
    console.warn('[COMPRESS] Falha ao comprimir, enviando original:', err);
    return base64DataUrl;
  }
}

// ============================================
// VERTEX AI — TOKEN DO METADATA SERVER / SA JSON
// ============================================

let _vertexTokenCache: { token: string; expiresAt: number } | null = null;
let _vertexTokenFetching: Promise<string | null> | null = null;

let _saCredentials: any = null;

/**
 * Retorna as credenciais da Service Account, se configuradas via
 * GOOGLE_APPLICATION_CREDENTIALS_JSON (string JSON completa).
 * Esse é o caminho recomendado para rodar fora do Cloud Run (ex: Vercel).
 */
function getServiceAccountCredentials(): any | null {
  if (_saCredentials) return _saCredentials;
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) return null;
  try {
    _saCredentials = JSON.parse(raw);
    return _saCredentials;
  } catch {
    console.warn('[VERTEX] GOOGLE_APPLICATION_CREDENTIALS_JSON inválido (JSON malformado)');
    _saCredentials = null;
    return null;
  }
}

function base64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Troca um JWT assinado com a private key da SA por um access_token OAuth2.
 * Equivalente ao que google-auth-library faz internamente, mas sem dependência extra.
 */
async function getAccessTokenFromServiceAccount(): Promise<string | null> {
  const sa = getServiceAccountCredentials();
  if (!sa || !sa.private_key || !sa.client_email) return null;

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const header = { alg: 'RS256', typ: 'JWT', kid: sa.private_key_id };
  const encodedHeader = base64url(Buffer.from(JSON.stringify(header)));
  const encodedPayload = base64url(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(sa.private_key, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const assertion = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '<no body>');
    console.warn('[VERTEX] Falha ao obter token via SA JSON:', res.status, text);
    return null;
  }

  const data = await res.json() as { access_token?: string; expires_in?: number };
  return data.access_token ?? null;
}

export async function getVertexAccessToken(): Promise<string | null> {
  if (_vertexTokenCache && Date.now() < _vertexTokenCache.expiresAt) {
    return _vertexTokenCache.token;
  }

  if (_vertexTokenFetching) {
    return _vertexTokenFetching;
  }

  _vertexTokenFetching = (async () => {
    try {
      // 1) Prioriza SA JSON quando configurada (caminho para Vercel/produção fora do Cloud Run)
      const saToken = await getAccessTokenFromServiceAccount();
      if (saToken) {
        _vertexTokenCache = {
          token: saToken,
          expiresAt: Date.now() + 55 * 60 * 1000, // 55min (token OAuth2 dura 1h)
        };
        return saToken;
      }

      // 2) Fallback: metadata server (funciona em Cloud Run / GCE / GKE)
      const res = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
        headers: { 'Metadata-Flavor': 'Google' },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        console.warn('[VERTEX] Metadata server indisponivel e SA JSON nao configurada. Configure GOOGLE_APPLICATION_CREDENTIALS_JSON para usar IA no Vercel.');
        return null;
      }

      const data = await res.json();
      const token = data.access_token;
      const expiresIn = (data.expires_in || 3600) * 1000;

      _vertexTokenCache = {
        token,
        expiresAt: Date.now() + expiresIn - 60_000,
      };

      return token;
    } catch {
      console.warn('[VERTEX] Nao foi possivel obter token (metadata server e SA JSON falharam)');
      return null;
    } finally {
      _vertexTokenFetching = null;
    }
  })();

  return _vertexTokenFetching;
}

// ============================================
// VERTEX AI — CHAMADA POR REGIÃO
// ============================================

export async function tryVertexAIRegion(
  region: string,
  accessToken: string,
  model: string,
  contents: any[],
  generationConfig: Record<string, any>,
  signal: AbortSignal,
): Promise<{ content: string } | null> {
  const url = `https://${region}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT}/locations/${region}/publishers/google/models/${model}:generateContent`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contents, generationConfig }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`[VERTEX ${region}] Erro ${response.status} modelo ${model}: ${errText.substring(0, 300)}`);
      return null;
    }

    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const finishReason = data?.candidates?.[0]?.finishReason;

    if (content) {
      if (finishReason === 'MAX_TOKENS') {
        console.warn(`[VERTEX ${region}] Resposta TRUNCADA (MAX_TOKENS) — content.length=${content.length}, modelo=${model}`);
      }
      console.log(`[VERTEX ${region}] Sucesso com modelo ${model} (finish: ${finishReason || 'ok'}, ${content.length} chars)`);
      return { content };
    }

    console.warn(`[VERTEX ${region}] Resposta vazia — finishReason: ${finishReason}`);
    return null;
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
    console.warn(`[VERTEX ${region}] Falha: ${err.message}`);
    return null;
  }
}

// ============================================
// OPÇÕES DE CHAMADA
// ============================================

export interface CallAIOptions {
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  jsonMode?: boolean;
}

// ============================================
// CHAMADA ÚNICA À IA (Vertex AI) — VISION/OCR
// ============================================

export async function callAI(
  prompt: string,
  imagem: string,
  model: string,
  options: CallAIOptions = {}
): Promise<{ content: string }> {
  const {
    temperature = 0.1,
    maxTokens = 4096,
    timeout = AI_TIMEOUT,
    jsonMode = true,
  } = options;

  const resolvedModel = getVertexModel(model);
  const compressedImage = await compressImage(imagem);
  const base64Data = compressedImage.split(',')[1];
  const mimeType = compressedImage.split(';')[0].split(':')[1];

  const generationConfig: Record<string, any> = {
    temperature,
    maxOutputTokens: maxTokens,
  };
  if (jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }

  const contents = [{
    role: 'user',
    parts: [
      { text: prompt },
      { inline_data: { mime_type: mimeType, data: base64Data } },
    ],
  }];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const vertexToken = await getVertexAccessToken();
    if (!vertexToken) {
      throw new Error('Vertex AI indisponivel: nao foi possivel obter token do metadata server.');
    }

    let lastError: string | null = null;

    for (const region of VERTEX_LOCATIONS_VISION) {
      const result = await tryVertexAIRegion(
        region, vertexToken, resolvedModel, contents, generationConfig, controller.signal
      );
      if (result) {
        return { content: result.content };
      }
      lastError = `[VERTEX ${region}] Falhou`;
    }

    throw new Error(`Vertex AI falhou em todas as regioes (${VERTEX_LOCATIONS_VISION.join(', ')}). Ultimo erro: ${lastError}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================
// CHAMADA COM MÚLTIPLAS IMAGENS (Vertex AI) — VISION/OCR
// ============================================

export async function callAIMultiImage(
  systemPrompt: string,
  userPrompt: string,
  images: Array<{ base64: string; mimeType?: string }>,
  model: string,
  options: CallAIOptions = {}
): Promise<{ content: string }> {
  const {
    temperature = 0,
    maxTokens = 1024,
    timeout = OCR_TIMEOUT,
    jsonMode = true,
  } = options;

  const resolvedModel = getVertexModel(model);

  const compressedImages = await Promise.all(
    images.map(async (img) => {
      const dataUrl = `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}`;
      const compressed = await compressImage(dataUrl);
      const parts = compressed.split(',');
      return {
        base64: parts[1] || img.base64,
        mimeType: 'image/jpeg',
      };
    })
  );

  const generationConfig: Record<string, any> = {
    temperature,
    maxOutputTokens: maxTokens,
  };
  if (jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }

  const contents = [{
    role: 'user',
    parts: [
      { text: systemPrompt + '\n\n' + userPrompt },
      ...compressedImages.map(img => ({
        inline_data: { mime_type: img.mimeType, data: img.base64 },
      })),
    ],
  }];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const vertexToken = await getVertexAccessToken();
    if (!vertexToken) {
      throw new Error('Vertex AI indisponivel: nao foi possivel obter token do metadata server.');
    }

    let lastError: string | null = null;

    for (const region of VERTEX_LOCATIONS_VISION) {
      const result = await tryVertexAIRegion(
        region, vertexToken, resolvedModel, contents, generationConfig, controller.signal
      );
      if (result) {
        return { content: result.content };
      }
      lastError = `[VERTEX ${region}] Falhou`;
    }

    throw new Error(`Vertex AI falhou em todas as regioes (${VERTEX_LOCATIONS_VISION.join(', ')}). Ultimo erro: ${lastError}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================
// CARREGAR CONFIGURAÇÃO DE IA
// ============================================

let _aiConfigCache: { model: string; ts: number } | null = null;
const AI_CONFIG_TTL = 60_000;

export async function loadAIConfig(fallbackModel?: string) {
  const now = Date.now();

  if (_aiConfigCache && now - _aiConfigCache.ts < AI_CONFIG_TTL) {
    return { llmModel: getModel(fallbackModel, _aiConfigCache.model) };
  }

  let llmModel = getModel(fallbackModel);

  try {
    const configRows = await db.$queryRawUnsafe(
      `SELECT "llmModel" FROM "config_saas" LIMIT 1`
    ) as any[];
    const config = configRows?.[0];

    if (config?.llmModel?.trim()) {
      llmModel = getModel(fallbackModel, config.llmModel?.trim());
      _aiConfigCache = { model: config.llmModel?.trim() || '', ts: now };
    }
  } catch {
    // Usa valores padrao
  }

  return { llmModel };
}

// ============================================
// UTILITÁRIO: EXTRAÇÃO ROBUSTA DE JSON
// ============================================

/**
 * Extrai um objeto JSON de texto que pode conter markdown, texto prefixo ou JSON truncado.
 * Usa balanceamento de chaves (funciona com qualquer nível de aninhamento).
 */
export function extractJSON<T = any>(content: string): { parsed: T | null; raw: string } {
  if (!content || content.trim().length === 0) {
    return { parsed: null, raw: '' };
  }

  let clean = content
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  const firstBrace = clean.indexOf('{');
  if (firstBrace === -1) {
    return { parsed: null, raw: content };
  }

  clean = clean.substring(firstBrace);

  // Balanceamento de chaves
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];

    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') depth++;
    if (ch === '}') depth--;

    if (depth === 0) {
      end = i + 1;
      break;
    }
  }

  const jsonStr = end > 0 ? clean.substring(0, end) : clean;

  try {
    return { parsed: JSON.parse(jsonStr), raw: jsonStr };
  } catch {
    const match = content.match(/\{[^{}]*\}/);
    if (match) {
      try {
        return { parsed: JSON.parse(match[0]), raw: match[0] };
      } catch {
        // Falhou
      }
    }
    return { parsed: null, raw: jsonStr };
  }
}
