import { NextRequest, NextResponse } from 'next/server';
import { getApiKeyForModel } from '@/lib/zhipu-auth';
import { callAI } from '@/lib/ai-vision';
import { db } from '@/lib/db';

export const maxDuration = 60;

// Modelos atualizados para benchmark
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GLM_MODEL = 'glm-4v-flash';

// POST /api/test-vision-compare
// Compara Gemini vs GLM no OCR de canhotos com a mesma imagem
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { empresaId, imagem, geminiKey, glmKey: glmKeyParam } = body;

    if (!imagem) {
      return NextResponse.json({ error: 'imagem obrigatoria' }, { status: 400 });
    }

    let geminiApiKey = geminiKey || null;
    let glmApiKey = glmKeyParam || null;

    // Se passou empresaId, buscar keys do banco
    if (empresaId && !geminiApiKey && !glmApiKey) {
      try {
        const empresas = await db.$queryRawUnsafe<Array<any>>(
          `SELECT "llmApiKey", "llmApiKeyGemini", "llmApiKeyGlm" FROM empresa WHERE id = $1 LIMIT 1`,
          empresaId
        );
        if (empresas?.length > 0) {
          const empresa = empresas[0];
          geminiApiKey = getApiKeyForModel(GEMINI_MODEL, empresa.llmApiKey, empresa.llmApiKeyGemini, empresa.llmApiKeyGlm);
          glmApiKey = getApiKeyForModel(GLM_MODEL, empresa.llmApiKey, empresa.llmApiKeyGemini, empresa.llmApiKeyGlm);
        }
      } catch {}
    }

    const PROMPT = `Você é um especialista em OCR de cupons fiscais brasileiros de cartão de crédito/débito.

INSTRUÇÕES CRÍTICAS:
1. Conte TODOS os cupons/canhotos visíveis na foto
2. Para cada cupom, extraia SOMENTE o valor total (campo "VALOR TOTAL")
3. IGNORE taxas de serviço ("TAXA DE SERVIÇO")
4. Cada cupom pode estar parcialmente visível

RETORNE EXCLUSIVAMENTE neste formato JSON:
{"quantidade":N,"cupons":[{"numero":1,"valor":0.00}],"total":0.00}

IMPORTANTE: O campo "total" deve ser a SOMA MATEMÁTICA CORRETA de todos os valores listados.`;

    const results: Record<string, any> = {};

    // Testar Gemini (usando modelo atualizado)
    if (geminiApiKey) {
      try {
        const start = Date.now();
        const result = await callAI(PROMPT, imagem, geminiApiKey, GEMINI_MODEL, {
          temperature: 0.1,
          maxTokens: 4000,
          jsonMode: true,
        });
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        results.gemini = { elapsed: elapsed + 's', model: GEMINI_MODEL, raw: result.content, parsed: parseCanhoto(result.content) };
      } catch (e: any) {
        results.gemini = { erro: e.message };
      }
    } else {
      results.gemini = { erro: 'API Key do Gemini não fornecida' };
    }

    // Testar GLM
    if (glmApiKey) {
      try {
        const start = Date.now();
        const result = await callAI(PROMPT, imagem, glmApiKey, GLM_MODEL, {
          temperature: 0.1,
          maxTokens: 4000,
          jsonMode: false, // GLM usa response_format, não responseMimeType
        });
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        results.glm = { elapsed: elapsed + 's', model: GLM_MODEL, raw: result.content, parsed: parseCanhoto(result.content) };
      } catch (e: any) {
        results.glm = { erro: e.message };
      }
    } else {
      results.glm = { erro: 'API Key do GLM não fornecida' };
    }

    // Comparativo
    const geminiParsed = results.gemini?.parsed;
    const glmParsed = results.glm?.parsed;

    results.comparativo = {
      gemini: geminiParsed ? {
        cupons: geminiParsed.qtd,
        soma: geminiParsed.somaReal,
        soma_ia: geminiParsed.somaIA,
        conferencia: geminiParsed.somaReal === geminiParsed.somaIA ? 'OK' : `ERRO`,
      } : null,
      glm: glmParsed ? {
        cupons: glmParsed.qtd,
        soma: glmParsed.somaReal,
        soma_ia: glmParsed.somaIA,
        conferencia: glmParsed.somaReal === glmParsed.somaIA ? 'OK' : `ERRO`,
      } : null,
    };

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function parseCanhoto(content: string) {
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Sem JSON');
    const parsed = JSON.parse(jsonMatch[0]);
    const cupons = parsed.cupons || [];
    const valores = cupons.map((c: any) => parseFloat(c.valor || 0));
    const somaReal = valores.reduce((a: number, b: number) => a + b, 0);
    const somaIA = parseFloat(parsed.total || parsed.soma || 0);
    return {
      qtd: cupons.length,
      valores,
      somaReal,
      somaIA,
    };
  } catch (e: any) {
    return { erro: e.message };
  }
}
