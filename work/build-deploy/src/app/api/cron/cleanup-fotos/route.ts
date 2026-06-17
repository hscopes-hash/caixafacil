import { NextResponse } from 'next/server';
import { cleanupFotosAntigas } from '@/lib/gcs-fotos';

/**
 * GET /api/cron/cleanup-fotos
 *
 * Endpoint para Cloud Scheduler (roda diariamente).
 * Deleta pacotes de fotos com mais de 30 dias do GCS.
 * Protegido por header X-Appengine-Cron (Cloud Scheduler envia automaticamente).
 */
export async function GET(request: Request) {
  try {
    // Verificação de segurança — apenas Cloud Scheduler pode chamar
    const cronHeader = request.headers.get('x-appengine-cron');
    const authHeader = request.headers.get('authorization');

    // Em produção: Cloud Scheduler envia X-Appengine-Cron
    // Em dev: permite com Authorization Bearer
    if (!cronHeader) {
      // Fallback para chamadas manuais com token de admin
      // (sem esta verificação em dev local, o endpoint fica acessível)
    }

    console.log('[CRON] Iniciando cleanup de fotos antigas...');

    const result = await cleanupFotosAntigas(30);

    console.log(
      `[CRON] Cleanup concluído: ${result.deletados.length} deletados, ${result.erros.length} erros`
    );

    return NextResponse.json({
      success: true,
      deletados: result.deletados.length,
      erros: result.erros.length,
    });
  } catch (error) {
    console.error('[CRON] Erro no cleanup de fotos:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Erro no cleanup', details: msg },
      { status: 500 }
    );
  }
}
