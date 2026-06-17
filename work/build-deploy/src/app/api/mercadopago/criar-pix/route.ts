import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/mercadopago/criar-pix
 * Cria uma cobrança PIX via API do Mercado Pago
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { valor, descricao, email, cpfCnpj, nome, empresaId } = body;

    if (!valor || valor <= 0) {
      return NextResponse.json({ error: 'Valor é obrigatório e deve ser maior que zero' }, { status: 400 });
    }

    // Buscar empresa para obter o access token
    const empresa = await db.empresa.findUnique({
      where: { id: empresaId },
      select: { mercadopagoAccessToken: true, mercadopagoPublicKey: true, nome: true, email: true }
    });

    if (!empresa?.mercadopagoAccessToken) {
      return NextResponse.json(
        { error: 'Mercado Pago não configurado para esta empresa. Configure o Access Token nas configurações.' },
        { status: 400 }
      );
    }

    // Criar pagamento PIX no Mercado Pago
    // payer.email é obrigatório pelo MP — usar email do cliente ou da empresa
    const payerEmail = email && email.includes('@') ? email
      : empresa.email
      || `${empresa.nome.replace(/\s+/g, '.').toLowerCase()}@email.temp`;
    const payerNome = nome || 'Pagador';
    const nomeParts = payerNome.split(' ');
    const payerFirstName = nomeParts[0] || 'Pagador';
    const payerLastName = nomeParts.slice(1).join(' ') || '';

    const payer: Record<string, any> = {
      email: payerEmail,
      first_name: payerFirstName,
      last_name: payerLastName,
    };
    if (cpfCnpj) {
      payer.identification = {
        type: cpfCnpj.replace(/\D/g, '').length <= 11 ? 'CPF' : 'CNPJ',
        number: cpfCnpj.replace(/\D/g, '')
      };
    }

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${empresa.mercadopagoAccessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      },
      body: JSON.stringify({
        transaction_amount: Number(valor),
        description: descricao || `Cobrança CaixaFácil - ${empresa.nome}`,
        payment_method_id: 'pix',
        payer
      })
    });

    if (!mpResponse.ok) {
      const errorData = await mpResponse.json().catch(() => ({}));
      console.error('[MP PIX ERROR]', mpResponse.status, errorData);
      return NextResponse.json(
        { error: `Erro Mercado Pago: ${errorData.message || 'Falha ao criar pagamento'}` },
        { status: 502 }
      );
    }

    const payment = await mpResponse.json();

    // Extrair dados do PIX
    const pixData = {
      id: payment.id?.toString(),
      status: payment.status,
      statusDetail: payment.status_detail,
      qrCode: payment.point_of_interaction?.transaction_data?.qr_code || '',
      qrCodeBase64: payment.point_of_interaction?.transaction_data?.qr_code_base64 || '',
      ticketUrl: payment.point_of_interaction?.transaction_data?.ticket_url || '',
      transactionAmount: payment.transaction_amount,
      dateCreated: payment.date_created,
      dateOfExpiration: payment.date_of_expiration
    };

    return NextResponse.json({
      success: true,
      payment: pixData,
      publicKey: empresa.mercadopagoPublicKey
    });

  } catch (error: any) {
    console.error('[MP PIX ERROR]', error);
    return NextResponse.json({ error: `Erro interno: ${error.message}` }, { status: 500 });
  }
}
