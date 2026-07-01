import { NextRequest, NextResponse } from 'next/server';
import { getVertexAccessToken } from '@/lib/ai-vision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Endpoint para Google Cloud Text-to-Speech (Neural2 — voz natural)
// Usa a mesma Service Account do Vertex AI (precisa de Cloud TTS API habilitada no GCP)
// Voz: pt-BR-Neural2-A (feminina, natural) ou pt-BR-Neural2-B (masculina)
export async function POST(request: NextRequest) {
  try {
    const { text, voiceName } = await request.json();

    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'text é obrigatório' }, { status: 400 });
    }

    // Limpar texto (remover JSON, código, etc.)
    let cleanText = text;
    const jsonMatch = text.match(/\{[\s\S]*?"acao"[\s\S]*\}/);
    if (jsonMatch) {
      cleanText = text.replace(jsonMatch[0], '').trim() || 'Ação executada.';
    }
    cleanText = cleanText.replace(/```json[\s\S]*?```/g, '').replace(/```/g, '').trim();
    if (!cleanText) {
      return NextResponse.json({ error: 'texto vazio após limpeza' }, { status: 400 });
    }

    // Obter token de acesso (mesma Service Account do Vertex AI)
    const accessToken = await getVertexAccessToken();

    // Selecionar voz — Neural2 é a mais natural disponível para pt-BR
    const voice = voiceName || 'pt-BR-Neural2-A';

    const response = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: { text: cleanText.substring(0, 5000) }, // limite de 5000 chars
        voice: {
          languageCode: 'pt-BR',
          name: voice,
        },
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: 1.0,
          pitch: 0,
          volumeGainDb: 0,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('[TTS] Erro Cloud TTS:', response.status, errText.substring(0, 500));

      // Se Cloud TTS não está habilitado (403), retornar erro para usar fallback
      if (response.status === 403) {
        return NextResponse.json({
          error: 'Cloud TTS API não habilitada no GCP. Use fallback do navegador.',
          fallback: true,
        }, { status: 503 });
      }

      return NextResponse.json({
        error: `Erro Cloud TTS ${response.status}: ${errText.substring(0, 200)}`,
        fallback: true,
      }, { status: 503 });
    }

    const data = await response.json();
    const audioContent = data.audioContent; // base64 MP3

    if (!audioContent) {
      return NextResponse.json({ error: 'Resposta sem audioContent', fallback: true }, { status: 503 });
    }

    return NextResponse.json({
      audioContent,
      format: 'mp3',
      voice,
    });
  } catch (error: any) {
    console.error('[TTS] Erro:', error);
    return NextResponse.json({
      error: error.message || 'Erro interno no TTS',
      fallback: true,
    }, { status: 500 });
  }
}
