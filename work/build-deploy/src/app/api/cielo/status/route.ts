import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/cielo/status?paymentId=xxx&empresaId=xxx
 * Consulta o status de uma transação Cielo
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get('paymentId');
    const empresaId = searchParams.get('empresaId');

    if (!paymentId || !empresaId) {
      return NextResponse.json({ error: 'paymentId e empresaId obrigatorios' }, { status: 400 });
    }

    const empresa = await db.empresa.findUnique({
      where: { id: empresaId },
      select: { cieloMerchantId: true, cieloMerchantKey: true, cieloAmbiente: true },
    });

    if (!empresa?.cieloMerchantId || !empresa?.cieloMerchantKey) {
      return NextResponse.json({ error: 'Cielo nao configurada' }, { status: 400 });
    }

    const isSandbox = empresa.cieloAmbiente !== 'production';
    const baseUrl = isSandbox
      ? 'https://apisandbox.cielo.com.br'
      : 'https://api.cielo.com.br';

    const response = await fetch(`${baseUrl}/1/sales/${paymentId}`, {
      method: 'GET',
      headers: {
        'MerchantId': empresa.cieloMerchantId,
        'MerchantKey': empresa.cieloMerchantKey,
        'Content-Type': 'application/json',
        'RequestId': `status-${Date.now()}`,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ paymentId, status: 0, statusMessage: 'Transacao nao encontrada' });
      }
      return NextResponse.json({ error: `Erro Cielo: HTTP ${response.status}` }, { status: 502 });
    }

    const data = await response.json();
    const p = data.Payment || {};

    return NextResponse.json({
      paymentId,
      merchantOrderId: data.MerchantOrderId,
      status: p.Status,
      statusMessage: getStatusMessage(p.Status),
      returnCode: p.ReturnCode,
      returnMessage: p.ReturnMessage,
      authorizationCode: p.AuthorizationCode,
      amount: p.Amount,
      capturedAmount: p.CapturedAmount,
      brand: p.Brand,
      tid: p.Tid,
      tipo: p.Type,
      lastFourDigits: p.CreditCard?.Last4Digits,
      holder: p.CreditCard?.Holder,
    });
  } catch (error: any) {
    console.error('[CIELO STATUS ERROR]', error);
    return NextResponse.json({ error: `Erro: ${error.message}` }, { status: 500 });
  }
}

function getStatusMessage(status?: number): string {
  const map: Record<number, string> = {
    1: 'Autorizado', 2: 'Pago', 3: 'Negado',
    5: 'Em andamento', 6: 'Cancelado', 7: 'Estornado',
    10: 'Pre-autorizado', 12: 'Pendente',
  };
  return status ? (map[status] || `Status ${status}`) : '';
}
