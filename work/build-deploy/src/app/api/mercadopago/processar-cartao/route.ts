import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/mercadopago/processar-cartao
 * Processa pagamento com cartao de credito/debito via Mercado Pago.
 * Se isNfc=true, tokeniza e paga em um passo (para aproximacao NFC).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      token, paymentMethodId, valor, descricao, email, cpfCnpj, nome,
      installments, issuerId, empresaId, clienteId, captureMethod,
      cardData, isNfc
    } = body;

    if (!valor || valor <= 0) {
      return NextResponse.json({ error: 'Valor invalido' }, { status: 400 });
    }

    // Buscar empresa para obter o access token
    const empresa = await db.empresa.findUnique({
      where: { id: empresaId },
      select: {
        mercadopagoAccessToken: true,
        mercadopagoPublicKey: true,
        nome: true
      }
    });

    if (!empresa?.mercadopagoAccessToken) {
      return NextResponse.json(
        { error: 'Mercado Pago nao configurado para esta empresa.' },
        { status: 400 }
      );
    }

    let cardToken = token;

    // NFC: tokenize card on backend (one step)
    if (isNfc && cardData) {
      const tokenResponse = await fetch('https://api.mercadopago.com/v1/card_tokens', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${empresa.mercadopagoAccessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `nfc-token-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        },
        body: JSON.stringify({
          card_number: cardData.cardNumber.replace(/\D/g, ''),
          cardholder_name: cardData.cardHolderName,
          card_expiration_month: cardData.cardExpiryMonth.padStart(2, '0'),
          card_expiration_year: cardData.cardExpiryYear.length === 2 ? `20${cardData.cardExpiryYear}` : cardData.cardExpiryYear,
          security_code: cardData.securityCode
        })
      });

      if (!tokenResponse.ok) {
        const errData = await tokenResponse.json().catch(() => ({}));
        return NextResponse.json({ error: `Erro NFC tokenizacao: ${errData.message || 'Falha'}` }, { status: 502 });
      }

      const tokenResult = await tokenResponse.json();
      cardToken = tokenResult.id;
    }

    if (!cardToken) {
      return NextResponse.json({ error: 'Token do cartao nao fornecido' }, { status: 400 });
    }

    // Determine payment method
    const methodId = cardData?.cardBrand || paymentMethodId || 'visa';

    // Create payment via Mercado Pago
    const mpPaymentBody: any = {
      transaction_amount: Number(valor),
      description: descricao || `Cobranca CaixaFacil - ${empresa.nome}`,
      payment_method_id: methodId,
      token: cardToken,
      installments: installments || 1,
      capture: true,
      statement_descriptor: 'CAIXAFACIL',
      payer: {
        email: email || '',
        first_name: nome?.split(' ')[0] || '',
        last_name: nome?.split(' ').slice(1).join(' ') || '',
        identification: cpfCnpj ? {
          type: cpfCnpj.length <= 11 ? 'CPF' : 'CNPJ',
          number: cpfCnpj.replace(/\D/g, '')
        } : undefined
      }
    };

    // Add issuer for certain cards (ELO, Hipercard, etc.)
    if (issuerId) {
      mpPaymentBody.issuer_id = issuerId;
    }

    // Capture method for NFC/contactless
    if (captureMethod) {
      mpPaymentBody.capture_method = captureMethod;
    }

    const mpResponse = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${empresa.mercadopagoAccessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      },
      body: JSON.stringify(mpPaymentBody)
    });

    if (!mpResponse.ok) {
      const errorData = await mpResponse.json().catch(() => ({}));
      console.error('[MP CARD PAYMENT ERROR]', mpResponse.status, errorData);
      return NextResponse.json(
        { error: `Erro Mercado Pago: ${errorData.message || 'Falha no pagamento'}` },
        { status: 502 }
      );
    }

    const payment = await mpResponse.json();

    // Extract payment data
    const paymentData = {
      id: payment.id?.toString(),
      status: payment.status,
      statusDetail: payment.status_detail,
      transactionAmount: payment.transaction_amount,
      paymentMethodId: payment.payment_method_id,
      paymentTypeId: payment.payment_type_id,
      cardLastFourDigits: payment.card?.last_four_digits,
      installments: payment.installments,
      authorizationCode: payment.authorization_code,
      dateApproved: payment.date_approved,
      dateCreated: payment.date_created,
      payer: payment.payer ? {
        email: payment.payer.email,
        firstName: payment.payer.first_name,
        lastName: payment.payer.last_name,
        identification: payment.payer.identification
      } : null
    };

    // If approved, register payment in the system
    if (payment.status === 'approved' && clienteId) {
      try {
        let formaPagSistema: string = 'OUTROS';
        if (payment.payment_type_id === 'credit_card') formaPagSistema = 'CARTAO_CREDITO';
        else if (payment.payment_type_id === 'debit_card') formaPagSistema = 'CARTAO_DEBITO';
        else if (payment.payment_method_id === 'pix') formaPagSistema = 'PIX';

        await db.pagamento.create({
          data: {
            clienteId,
            valor: payment.transaction_amount || 0,
            dataVencimento: new Date().toISOString().split('T')[0],
            dataPagamento: payment.date_approved ? new Date(payment.date_approved) : new Date(),
            status: 'PAGO',
            formaPagamento: formaPagSistema as any,
            observacoes: `Pagamento MP - ID: ${payment.id} | ${payment.payment_method_id}${payment.card?.last_four_digits ? ` ****${payment.card.last_four_digits}` : ''}${payment.installments > 1 ? ` | ${payment.installments}x` : ''}`,
          },
        });
        console.log(`[MP CARD PAYMENT] Pagamento registrado - ID: ${payment.id}, Cliente: ${clienteId}, Valor: ${payment.transaction_amount}`);
      } catch (dbError: any) {
        console.error('[MP CARD PAYMENT DB ERROR]', dbError.message);
      }
    }

    return NextResponse.json({
      success: true,
      payment: paymentData
    });

  } catch (error: any) {
    console.error('[MP CARD PAYMENT ERROR]', error);
    return NextResponse.json({ error: `Erro interno: ${error.message}` }, { status: 500 });
  }
}
