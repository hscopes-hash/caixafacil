import { NextRequest, NextResponse } from 'next/server';
import { getGcsAccessToken } from '@/lib/gcs-fotos';

const BUCKET = process.env.FOTO_BUCKET || 'caixafacil-leitura-fotos';

/**
 * POST /api/leituras/cleanup-fotos-gcs
 *
 * Lista e deleta todos os blobs no prefix 'leitura-fotos/' do GCS.
 * Fotos individuais não são mais usadas — apenas PDFs.
 * Também limpa fotoGcsPath do banco (opcional via query ?clearDb=true).
 */
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clearDb = searchParams.get('clearDb') === 'true';

    const token = await getGcsAccessToken();

    // Listar todos os objetos no prefix 'leitura-fotos/'
    const deletedPaths: string[] = [];
    const errors: string[] = [];
    let pageToken: string | undefined;

    do {
      const url = `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o?prefix=leitura-fotos/&maxResults=500${pageToken ? `&pageToken=${pageToken}` : ''}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const text = await res.text();
        return NextResponse.json(
          { error: `Erro ao listar objetos: ${res.status} - ${text.substring(0, 200)}` },
          { status: 500 }
        );
      }

      const data = await res.json();
      const items = data.items || [];

      for (const item of items) {
        const objectName = item.name;
        try {
          const delRes = await fetch(
            `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(objectName)}`,
            { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
          );
          if (delRes.ok || delRes.status === 404) {
            deletedPaths.push(objectName);
          } else {
            errors.push(`${objectName}: ${delRes.status}`);
          }
        } catch (e) {
          errors.push(`${objectName}: ${e instanceof Error ? e.message : 'erro'}`);
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    // Se clearDb=true, limpar fotoGcsPath do banco
    if (clearDb) {
      const { db } = await import('@/lib/db');
      const result = await db.$executeRawUnsafe(`UPDATE leituras SET "fotoGcsPath" = NULL WHERE "fotoGcsPath" IS NOT NULL`);
      console.log(`[CLEANUP-FOTOS-GCS] ${result} leituras tiveram fotoGcsPath limpo`);
    }

    return NextResponse.json({
      success: true,
      deleted: deletedPaths.length,
      errors: errors.length,
      errorDetails: errors.slice(0, 10),
      clearedFromDb: clearDb,
    });
  } catch (error) {
    console.error('[CLEANUP-FOTOS-GCS] Erro:', error);
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
