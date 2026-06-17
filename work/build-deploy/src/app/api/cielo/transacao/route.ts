import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/cielo/transacao
 * Cria uma transação de cartão (crédito/débito) via Cielo API 3.0
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      empresaId,
      valor,
      descricao,
      nome,
      cpfCnpj,
      email,
      cartaoNumero,
      cartaoValidade,  // MM/YYYY
      cartaoCvv,
      cartaoBandeira, // Visa, Master, Elo, Banricompras
      cartaoTipo,     // CreditCard, DebitCard
      parcelas,
      clienteId,
    } = body;

    if (!valor || valor <= 0) {
      return NextResponse.json({ error: 'Valor obrigatorio' }, { status: 400 });
    }
    if (!cartaoNumero || !cartaoValidade || !cartaoCvv) {
      return NextResponse.json({ error: 'Dados do cartao obrigatorios' }, { status: 400 });
    }

    const empresa = await db.empresa.findUnique({
      where: { id: empresaId },
      select: {
        cieloMerchantId: true,
        cieloMerchantKey: true,
        cieloAmbiente: true,
        cieloMcc: true,
        cieloEstabelecimento: true,
        nome: true,
      },
    });

    if (!empresa?.cieloMerchantId || !empresa?.cieloMerchantKey) {
      return NextResponse.json({ error: 'Cielo nao configurada nesta empresa' }, { status: 400 });
    }

    const isSandbox = empresa.cieloAmbiente !== 'production';
    const baseUrl = isSandbox
      ? 'https://apisandbox.cielo.com.br'
      : 'https://api.cielo.com.br';

    const merchantOrderId = `CF-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    const cieloBody: Record<string, any> = {
      MerchantOrderId: merchantOrderId,
      Payment: {
        Type: cartaoTipo === 'DebitCard' ? 'DebitCard' : 'CreditCard',
        Amount: Math.round(Number(valor) * 100), // Cielo usa centavos
        Currency: 'BRL',
        Country: 'BRA',
        SoftDescriptor: (empresa.cieloEstabelecimento || empresa.nome || 'CxFacil').substring(0, 13),
        Installments: cartaoTipo === 'DebitCard' ? 1 : (parseInt(parcelas) || 1),
        Capture: true,
        Authenticate: false,
        Recurrent: false,
        CreditCard: {
          CardNumber: cartaoNumero.replace(/\D/g, ''),
          Holder: nome || 'Pagador',
          ExpirationDate: cartaoValidade.replace(/\D/g, '').substring(0, 6),
          SecurityCode: cartaoCvv,
          Brand: cartaoBandeira || 'Visa',
        },
      },
    };

    // Customer data
    if (nome || email) {
      cieloBody.Customer = {
        Name: (nome || '').substring(0, 100),
        Email: (email || '').substring(0, 100),
        Identity: cpfCnpj ? cpfCnpj.replace(/\D/g, '') : undefined,
        IdentityType: cpfCnpj && cpfCnpj.replace(/\D/g, '').length <= 11 ? 'CPF' : 'CNPJ',
      };
    }

    const mpResponse = await fetch(`${baseUrl}/1/sales`, {
      method: 'POST',
      headers: {
        'MerchantId': empresa.cieloMerchantId,
        'MerchantKey': empresa.cieloMerchantKey,
        'Content-Type': 'application/json',
        'RequestId': merchantOrderId,
      },
      body: JSON.stringify(cieloBody),
      signal: AbortSignal.timeout(30000),
    });

    if (!mpResponse.ok) {
      const errorData = await mpResponse.json().catch(() => ({}));
      console.error('[CIELO TRANSACAO ERROR]', mpResponse.status, errorData);
      return NextResponse.json(
        { error: `Erro Cielo: ${errorData[0]?.Message || errorData.Message || 'Falha ao processar pagamento'}` },
        { status: 502 }
      );
    }

    const payment = await mpResponse.json();

    return NextResponse.json({
      success: true,
      payment: {
        merchantOrderId: payment.MerchantOrderId,
        paymentId: payment.Payment?.PaymentId?.toString(),
        tid: payment.Payment?.Tid,
        status: payment.Payment?.Status,
        statusMessage: getStatusMessage(payment.Payment?.Status),
        returnCode: payment.Payment?.ReturnCode,
        returnMessage: payment.Payment?.ReturnMessage,
        authorizationCode: payment.Payment?.AuthorizationCode,
        amount: payment.Payment?.Amount,
        capturedAmount: payment.Payment?.CapturedAmount,
        brand: payment.Payment?.Brand,
        installmentCount: payment.Payment?.Installments,
        tipo: cartaoTipo || 'CreditCard',
      },
    });
  } catch (error: any) {
    if (error.name === 'TimeoutError') {
      return NextResponse.json({ error: 'Timeout na conexao com Cielo' }, { status: 504 });
    }
    console.error('[CIELO TRANSACAO ERROR]', error);
    return NextResponse.json({ error: `Erro interno: ${error.message}` }, { status: 500 });
  }
}

function getStatusMessage(status?: number): string {
  const map: Record<number, string> = {
    1: 'Pagamento autorizado',
    2: 'Pagamento completo',
    3: 'Pagamento negado',
    5: 'Pagamento em andamento',
    6: 'Pagamento cancelado',
    7: 'Pagamento estornado',
    8: 'Pagamento em chargeback',
    9: 'Pagamento em contestação',
    10: 'Pagamento em pré-autorização',
    11: 'Pagamento pré-autorizado',
    12: 'Pagamento pendente',
    13: 'Pagamento abortado',
    14: 'Pagamento em cancelamento',
    15: 'Pagamento cancelado por antifraude',
  };
  return status ? (map[status] || `Status ${status}`) : '';
}
