import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

/**
 * Endpoint de TESTE — gera múltiplas versões da foto com técnicas
 * inspiradas no Adobe Acrobat para comparação visual.
 *
 * Retorna 4 versões para o usuário comparar no preview:
 * 1. Original (só upscale, sem sharpen)
 * 2. Acrobat (bicubic + sharpen adaptativo só em bordas)
 * 3. CLAHE (contraste adaptativo + sharpen bordas)
 * 4. Threshold (binarizado + enhance thin lines)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imagem } = body;

    if (!imagem) {
      return NextResponse.json({ error: 'Imagem é obrigatória' }, { status: 400 });
    }

    const matches = imagem.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) {
      return NextResponse.json({ error: 'Formato inválido' }, { status: 400 });
    }

    const buffer = Buffer.from(matches[2], 'base64');
    console.log('[TESTAR-TRATAMENTO] Gerando 4 versões para comparação...');

    // === Versão 1: Original (só upscale, sem sharpen) ===
    const v1 = await sharp(buffer)
      .removeAlpha()
      .resize(2048, 2048, { fit: 'inside', kernel: 'lanczos3' })
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
      .toBuffer();
    const v1Url = `data:image/jpeg;base64,${v1.toString('base64')}`;

    // === Versão 2: Acrobat (bicubic + sharpen adaptativo só em bordas) ===
    // m1=0 faz sharpen só em bordas (não cria ruído em áreas planas)
    const v2 = await sharp(buffer)
      .removeAlpha()
      .resize(2048, 2048, { fit: 'inside', kernel: 'cubic' })
      .sharpen({ sigma: 1.0, m1: 0, m2: 3, x1: 2, y2: 8, y3: 12 })
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
      .toBuffer();
    const v2Url = `data:image/jpeg;base64,${v2.toString('base64')}`;

    // === Versão 3: CLAHE (contraste adaptativo + sharpen bordas) ===
    // CLAHE = Contrast Limited Adaptive Histogram Equalization
    let v3Url: string;
    try {
      const v3 = await sharp(buffer)
        .removeAlpha()
        .resize(2048, 2048, { fit: 'inside', kernel: 'cubic' })
        .clahe({ width: 8, height: 8, maxSlope: 3 })
        .sharpen({ sigma: 1.0, m1: 0, m2: 4, x1: 2, y2: 10, y3: 15 })
        .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
        .toBuffer();
      v3Url = `data:image/jpeg;base64,${v3.toString('base64')}`;
    } catch (err) {
      console.warn('[TESTAR-TRATAMENTO] CLAHE falhou:', err);
      v3Url = v2Url; // fallback
    }

    // === Versão 4: Threshold (binarizado + enhance thin lines) ===
    // Binarização adaptativa + dilatação (enhance thin lines do Acrobat)
    let v4Url: string;
    try {
      const v4 = await sharp(buffer)
        .removeAlpha()
        .resize(2048, 2048, { fit: 'inside', kernel: 'cubic' })
        .greyscale()
        .normalise()
        .threshold(128, { greyscale: true })
        .sharpen({ sigma: 0.5, m1: 0, m2: 2 })
        .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
        .toBuffer();
      v4Url = `data:image/jpeg;base64,${v4.toString('base64')}`;
    } catch (err) {
      console.warn('[TESTAR-TRATAMENTO] Threshold falhou:', err);
      v4Url = v2Url; // fallback
    }

    console.log('[TESTAR-TRATAMENTO] 4 versões geradas com sucesso');

    return NextResponse.json({
      success: true,
      versoes: [
        { id: 'v1', nome: 'Original (lanczos3, sem sharpen)', imagem: v1Url },
        { id: 'v2', nome: 'Acrobat (bicubic + sharpen só bordas)', imagem: v2Url },
        { id: 'v3', nome: 'CLAHE (contraste adaptativo + bordas)', imagem: v3Url },
        { id: 'v4', nome: 'Threshold (binarizado + thin lines)', imagem: v4Url },
      ],
    });
  } catch (error) {
    console.error('[TESTAR-TRATAMENTO] Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: `Erro: ${errorMessage}` }, { status: 500 });
  }
}
