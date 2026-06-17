import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/mercadopago/tokenizar-cartao
 * Tokeniza um cartao de credito/debito via API do Mercado Pago.
 * O access token fica seguro no backend.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cardNumber, cardHolderName, cardExpiryMonth, cardExpiryYear, securityCode, empresaId } = body;

    if (!cardNumber || !cardHolderName || !cardExpiryMonth || !cardExpiryYear || !securityCode) {
      return NextResponse.json({ error: 'Todos os dados do cartao sao obrigatorios' }, { status: 400 });
    }

    // Buscar empresa para obter o access token
    const empresa = await db.empresa.findUnique({
      where: { id: empresaId },
      select: { mercadopagoAccessToken: true, mercadopagoPublicKey: true }
    });

    if (!empresa?.mercadopagoAccessToken) {
      return NextResponse.json(
        { error: 'Mercado Pago nao configurado para esta empresa.' },
        { status: 400 }
      );
    }

    // Tokenizar cartao via Mercado Pago API
    const mpResponse = await fetch('https://api.mercadopago.com/v1/card_tokens', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${empresa.mercadopagoAccessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `token-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      },
      body: JSON.stringify({
        card_number: cardNumber.replace(/\D/g, ''),
        cardholder_name: cardHolderName,
        card_expiration_month: cardExpiryMonth.padStart(2, '0'),
        card_expiration_year: cardExpiryYear.length === 2 ? `20${cardExpiryYear}` : cardExpiryYear,
        security_code: securityCode
      })
    });

    if (!mpResponse.ok) {
      const errorData = await mpResponse.json().catch(() => ({}));
      console.error('[MP TOKENIZE ERROR]', mpResponse.status, errorData);
      return NextResponse.json(
        { error: `Erro ao tokenizar: ${errorData.message || 'Dados invalidos'}` },
        { status: 502 }
      );
    }

    const tokenData = await mpResponse.json();

    return NextResponse.json({
      success: true,
      token: tokenData.id,
      cardBrand: tokenData.card?.issuer?.name || tokenData.first_six_digits?.startsWith('4') ? 'visa' : 'master',
      lastFourDigits: tokenData.last_four_digits
    });

  } catch (error: any) {
    console.error('[MP TOKENIZE ERROR]', error);
    return NextResponse.json({ error: `Erro interno: ${error.message}` }, { status: 500 });
  }
}
