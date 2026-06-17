import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/mercadopago/bin-lookup
 * Consulta BIN (primeiros 6 digitos) para bandeira, emissor e parcelas.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bin = searchParams.get('bin')?.replace(/\D/g, '').substring(0, 6);
    const valor = searchParams.get('valor');
    const empresaId = searchParams.get('empresaId');

    if (!bin || bin.length !== 6) {
      return NextResponse.json({ error: 'BIN invalido (6 digitos obrigatorios)' }, { status: 400 });
    }

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId obrigatorio' }, { status: 400 });
    }

    // Buscar empresa para obter o access token
    const empresa = await db.empresa.findUnique({
      where: { id: empresaId },
      select: { mercadopagoAccessToken: true }
    });

    if (!empresa?.mercadopagoAccessToken) {
      return NextResponse.json(
        { error: 'Mercado Pago nao configurado' },
        { status: 400 }
      );
    }

    const amount = valor ? Number(valor) : 0;

    // Get payment methods (card brands) for Brazil
    const methodsResponse = await fetch(
      `https://api.mercadopago.com/v1/payment_methods?marketplace=NONE&locale=pt-BR`,
      {
        headers: {
          'Authorization': `Bearer ${empresa.mercadopagoAccessToken}`
        }
      }
    );

    if (!methodsResponse.ok) {
      return NextResponse.json({ error: 'Erro ao consultar metodos de pagamento' }, { status: 502 });
    }

    const paymentMethods = await methodsResponse.json();

    // Find matching payment method by BIN
    let matchedMethod: any = null;
    for (const method of paymentMethods) {
      if (method.payment_type_id !== 'credit_card' && method.payment_type_id !== 'debit_card') continue;
      if (method.settings && method.settings.length > 0) {
        for (const setting of method.settings) {
          if (setting.bin && setting.bin.pattern) {
            const regex = new RegExp(setting.bin.pattern);
            if (regex.test(bin) && setting.bin.exclusion?.pattern && !new RegExp(setting.bin.exclusion.pattern).test(bin)) {
              matchedMethod = method;
              break;
            } else if (regex.test(bin) && !setting.bin.exclusion?.pattern) {
              matchedMethod = method;
              break;
            }
          }
        }
      }
      if (matchedMethod) break;
    }

    if (!matchedMethod) {
      // Fallback: detect by BIN prefix
      let detectedMethod = 'visa';
      if (bin.startsWith('5') && parseInt(bin[1]) >= 1 && parseInt(bin[1]) <= 5) detectedMethod = 'master';
      if (bin.startsWith('3') && ['4','5','6','7'].includes(bin[1])) detectedMethod = 'amex';
      if (bin.startsWith('50') || bin.startsWith('63') || bin.startsWith('65')) detectedMethod = 'elo';
      if (bin.startsWith('38') || bin.startsWith('60')) detectedMethod = 'hipercard';

      const fallbackMethod = paymentMethods.find((m: any) => m.id === detectedMethod);

      return NextResponse.json({
        success: true,
        paymentMethodId: detectedMethod,
        paymentTypeId: 'credit_card',
        brand: { id: detectedMethod, name: detectedMethod },
        issuer: null,
        installments: amount > 0 ? [{ installments: 1, installmentAmount: amount, totalAmount: amount, recommendedMessage: `1x de R$ ${amount.toFixed(2)} (a vista)` }] : []
      });
    }

    // Get installment options
    let installments: any[] = [];
    if (amount > 0 && matchedMethod.payment_type_id === 'credit_card') {
      const installmentsUrl = `https://api.mercadopago.com/v1/payment_methods/installments?bin=${bin}&amount=${amount}&payment_type_id=credit_card`;
      try {
        const installmentsResponse = await fetch(installmentsUrl, {
          headers: { 'Authorization': `Bearer ${empresa.mercadopagoAccessToken}` }
        });
        if (installmentsResponse.ok) {
          const installmentsData = await installmentsResponse.json();
          if (installmentsData.length > 0 && installmentsData[0].payer_costs) {
            installments = installmentsData[0].payer_costs.map((pc: any) => ({
              installments: pc.installments,
              installmentAmount: pc.installment_amount,
              totalAmount: pc.total_amount,
              recommendedMessage: pc.recommended_message
            }));
          }
        }
      } catch (e) {
        console.error('[MP INSTALLMENTS ERROR]', e);
      }
    }

    return NextResponse.json({
      success: true,
      paymentMethodId: matchedMethod.id,
      paymentTypeId: matchedMethod.payment_type_id,
      brand: {
        id: matchedMethod.id,
        name: matchedMethod.name
      },
      issuer: matchedMethod.issuer ? {
        id: matchedMethod.issuer.id,
        name: matchedMethod.issuer.name
      } : null,
      installments
    });

  } catch (error: any) {
    console.error('[MP BIN LOOKUP ERROR]', error);
    return NextResponse.json({ error: `Erro interno: ${error.message}` }, { status: 500 });
  }
}
