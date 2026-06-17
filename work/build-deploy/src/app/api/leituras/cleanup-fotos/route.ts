import { NextRequest, NextResponse } from 'next/server';
import { cleanupFotosAntigas } from '@/lib/gcs-fotos';

/**
 * POST /api/leituras/cleanup-fotos
 *
 * Deleta pacotes de fotos com mais de 30 dias do GCS.
 * Body (opcional): { maxAgeDays: number }
 * Returns: { deletados: string[], erros: [...] }
 */
export async function POST(request: NextRequest) {
  try {
    let maxAgeDays = 30;
    try {
      const body = await request.json();
      if (body.maxAgeDays && typeof body.maxAgeDays === 'number' && body.maxAgeDays > 0) {
        maxAgeDays = body.maxAgeDays;
      }
    } catch {
      // sem body — usa default
    }

    const result = await cleanupFotosAntigas(maxAgeDays);

    return NextResponse.json({
      success: true,
      deletados: result.deletados.length,
      paths: result.deletados,
      erros: result.erros,
    });
  } catch (error) {
    console.error('Erro no cleanup de fotos:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Erro no cleanup de fotos', details: msg },
      { status: 500 }
    );
  }
}
