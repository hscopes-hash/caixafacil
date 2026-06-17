import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/mercadopago/config?empresaId=uuid
 * Retorna a configuração do Mercado Pago da empresa (public key, ativo, etc.)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const empresaId = searchParams.get('empresaId');

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId é obrigatório' }, { status: 400 });
    }

    const empresa = await db.empresa.findUnique({
      where: { id: empresaId },
      select: {
        mercadopagoAccessToken: true,
        mercadopagoPublicKey: true
      }
    });

    if (!empresa) {
      return NextResponse.json({ error: 'Empresa não encontrada' }, { status: 404 });
    }

    const isConfigured = !!(empresa.mercadopagoAccessToken && empresa.mercadopagoPublicKey);

    return NextResponse.json({
      configurado: isConfigured,
      publicKey: isConfigured ? empresa.mercadopagoPublicKey : null,
      temAccessToken: !!empresa.mercadopagoAccessToken
    });

  } catch (error: any) {
    console.error('[MP CONFIG ERROR]', error);
    return NextResponse.json({ error: `Erro interno: ${error.message}` }, { status: 500 });
  }
}
