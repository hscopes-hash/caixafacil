import { NextRequest, NextResponse } from 'next/server';
import { downloadFotosLeitura } from '@/lib/gcs-fotos';

/**
 * GET /api/leituras/download-fotos?gcsPath=...
 *
 * Baixa, descriptografa e retorna as fotos de um pacote GCS.
 * Query: gcsPath — caminho do objeto no GCS
 * Returns: { fotos: [{ maquinaId, codigo, fotoBase64 }] }
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const gcsPath = searchParams.get('gcsPath');

    if (!gcsPath) {
      return NextResponse.json(
        { error: 'gcsPath é obrigatório' },
        { status: 400 }
      );
    }

    const fotos = await downloadFotosLeitura(gcsPath);

    return NextResponse.json({
      success: true,
      fotos,
      total: fotos.length,
    });
  } catch (error) {
    console.error('Erro ao download fotos:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Erro ao recuperar fotos do GCS', details: msg },
      { status: 500 }
    );
  }
}
