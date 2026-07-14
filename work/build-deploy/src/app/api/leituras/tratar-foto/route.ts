import { NextRequest, NextResponse } from 'next/server';
import { compressImageAgressiva, _ultimaCompressaoAgressivaInfo } from '@/lib/ai-vision';

/**
 * Endpoint TEMPORÁRIO para debug visual.
 * Processa a foto (deskew + nitidez + inversão) e retorna a imagem processada
 * para o usuário ver o que a IA está recebendo.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imagem } = body;

    if (!imagem) {
      return NextResponse.json({ error: 'Imagem é obrigatória' }, { status: 400 });
    }

    if (!imagem.startsWith('data:image/')) {
      return NextResponse.json({ error: 'Formato de imagem inválido' }, { status: 400 });
    }

    console.log('[TRATAR-FOTO] Processando imagem para preview visual...');

    // Processar imagem (mesmo pipeline agressivo do OCR)
    const imagemProcessada = await compressImageAgressiva(imagem);

    console.log(`[TRATAR-FOTO] Processamento concluído. Inverteu: ${_ultimaCompressaoAgressivaInfo.inverteuCores}, Brilho: ${_ultimaCompressaoAgressivaInfo.brilhoMedio}`);

    return NextResponse.json({
      success: true,
      imagemProcessada,
      debug: {
        inverteuCores: _ultimaCompressaoAgressivaInfo.inverteuCores,
        brilhoMedio: _ultimaCompressaoAgressivaInfo.brilhoMedio,
        tamanhoOriginal: imagem.length,
        tamanhoProcessado: imagemProcessada.length,
      },
    });
  } catch (error) {
    console.error('[TRATAR-FOTO] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: `Erro: ${errorMessage}` }, { status: 500 });
  }
}
