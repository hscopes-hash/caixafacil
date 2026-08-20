import { NextRequest, NextResponse } from 'next/server';

const BUCKET = process.env.FOTO_BUCKET || 'caixafacil-leitura-fotos';

/**
 * GET /api/leituras/download-pdf?gcsPath=...
 *
 * Baixa o PDF do relatório do GCS e retorna como base64.
 * Não descriptografa — o PDF foi salvo sem criptografia.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const gcsPath = searchParams.get('gcsPath');

    if (!gcsPath) {
      return NextResponse.json({ error: 'gcsPath é obrigatório' }, { status: 400 });
    }

    // Importar getGcsAccessToken dinamicamente para evitar problemas de inicialização
    const { getGcsAccessToken } = await import('@/lib/gcs-fotos');

    const token = await getGcsAccessToken();
    console.log(`[DOWNLOAD-PDF] Baixando: ${gcsPath}`);

    const res = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(gcsPath)}?alt=media`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error(`[DOWNLOAD-PDF] Falhou (${res.status}): ${text.substring(0, 500)}`);
      return NextResponse.json(
        { error: `GCS download falhou (${res.status})` },
        { status: 500 }
      );
    }

    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:application/pdf;base64,${base64}`;

    console.log(`[DOWNLOAD-PDF] Sucesso: ${gcsPath} (${(buffer.length / 1024).toFixed(0)}KB)`);
    return NextResponse.json({
      success: true,
      pdfBase64: dataUrl,
      size: buffer.length,
    });
  } catch (error) {
    console.error('[DOWNLOAD-PDF] Erro:', error);
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
