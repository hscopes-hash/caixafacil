import { NextResponse } from 'next/server';
import { getVertexAccessToken } from '@/lib/ai-vision';

// GET /api/diag-vertex
// Verifica se a SA JSON está configurada e se consegue obter access token do Vertex AI.
// NÃO exige auth — retorna apenas diagnósticos, sem expor tokens.
export async function GET() {
  const saJsonRaw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  const hasSaJson = !!saJsonRaw;
  const saJsonLen = saJsonRaw?.length || 0;

  let token: string | null = null;
  let tokenError: string | null = null;
  try {
    token = await getVertexAccessToken();
  } catch (e: unknown) {
    tokenError = e instanceof Error ? e.message : String(e);
  }

  // Testa chamada real ao Vertex AI (Gemini 2.5 Flash)
  let geminiOk: boolean | null = null;
  let geminiError: string | null = null;
  if (token) {
    try {
      const project = 'utopian-splicer-255210';
      const url = `https://us-central1-aiplatform.googleapis.com/v1/projects/${project}/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Responda apenas: OK' }] }],
          generationConfig: { maxOutputTokens: 10, temperature: 0 },
        }),
      });
      geminiOk = res.ok;
      if (!res.ok) {
        const text = await res.text();
        geminiError = `${res.status} ${text.slice(0, 200)}`;
      }
    } catch (e: unknown) {
      geminiError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    sa: {
      has_GOOGLE_APPLICATION_CREDENTIALS_JSON: hasSaJson,
      saJsonLen,
    },
    token: {
      obtained: !!token,
      length: token?.length || 0,
      error: tokenError,
    },
    gemini: {
      ok: geminiOk,
      error: geminiError,
    },
  });
}
