import { NextRequest, NextResponse } from 'next/server';
import { uploadFotosLeitura } from '@/lib/gcs-fotos';

/**
 * POST /api/leituras/upload-fotos
 *
 * Recebe array de fotos processadas (base64) e faz upload criptografado para o GCS.
 * Body: { fotos: [{ maquinaId, codigo, fotoBase64 }], empresaId, clienteId }
 * Returns: { gcsPath, batchId }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fotos, empresaId, clienteId } = body;

    if (!fotos || !Array.isArray(fotos) || fotos.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma foto fornecida' },
        { status: 400 }
      );
    }

    if (!empresaId || !clienteId) {
      return NextResponse.json(
        { error: 'empresaId e clienteId são obrigatórios' },
        { status: 400 }
      );
    }

    // Validar formato das fotos
    const fotosValidadas = fotos.filter(
      (f: any) => f.maquinaId && f.codigo && f.fotoBase64
    );

    if (fotosValidadas.length === 0) {
      return NextResponse.json(
        { error: 'Nenhuma foto válida encontrada' },
        { status: 400 }
      );
    }

    const result = await uploadFotosLeitura(empresaId, clienteId, fotosValidadas);

    return NextResponse.json({
      success: true,
      gcsPath: result.gcsPath,
      batchId: result.batchId,
      fotosSalvas: fotosValidadas.length,
    });
  } catch (error) {
    console.error('Erro ao upload fotos:', error);
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Erro ao salvar fotos no GCS', details: msg },
      { status: 500 }
    );
  }
}
