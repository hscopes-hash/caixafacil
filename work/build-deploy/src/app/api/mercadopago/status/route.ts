import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/mercadopago/status?id=12345&empresaId=uuid
 * Verifica o status de um pagamento PIX no Mercado Pago
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get('id');
    const empresaId = searchParams.get('empresaId');

    if (!paymentId) {
      return NextResponse.json({ error: 'ID do pagamento é obrigatório' }, { status: 400 });
    }

    // Buscar empresa
    const empresa = await db.empresa.findUnique({
      where: { id: empresaId || '' },
      select: { mercadopagoAccessToken: true }
    });

    if (!empresa?.mercadopagoAccessToken) {
      return NextResponse.json({ error: 'Mercado Pago não configurado' }, { status: 400 });
    }

    // Consultar status no Mercado Pago
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${empresa.mercadopagoAccessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!mpResponse.ok) {
      return NextResponse.json({ error: 'Pagamento não encontrado no Mercado Pago' }, { status: 404 });
    }

    const payment = await mpResponse.json();

    const statusData = {
      id: payment.id?.toString(),
      status: payment.status,
      statusDetail: payment.status_detail,
      transactionAmount: payment.transaction_amount,
      dateApproved: payment.date_approved || null,
      dateCreated: payment.date_created,
      dateOfExpiration: payment.date_of_expiration,
      payer: payment.payer ? {
        email: payment.payer.email,
        firstName: payment.payer.first_name,
        lastName: payment.payer.last_name,
        identification: payment.payer.identification
      } : null
    };

    // Se pago, registrar pagamento no sistema
    if (payment.status === 'approved' && empresaId) {
      // Verificar se já foi registrado
      const pagamentoExistente = await db.pagamento.findFirst({
        where: {
          observacoes: { contains: `MP:${paymentId}` }
        }
      });

      if (!pagamentoExistente) {
        // Buscar cliente pelo cpf do payer
        let cliente: any = null;
        if (payment.payer?.identification?.number && empresaId) {
          cliente = await db.cliente.findFirst({
            where: {
              empresaId,
              cpfCnpj: { contains: payment.payer.identification.number }
            }
          });
        }

        if (cliente) {
          await db.pagamento.create({
            data: {
              clienteId: cliente.id,
              valor: payment.transaction_amount || 0,
              dataVencimento: new Date().toISOString().split('T')[0],
              dataPagamento: payment.date_approved ? new Date(payment.date_approved) : new Date(),
              status: 'PAGO',
              formaPagamento: 'PIX',
              observacoes: `MP:${paymentId}`
            }
          });
        }
      }
    }

    return NextResponse.json({
      success: true,
      payment: statusData
    });

  } catch (error: any) {
    console.error('[MP STATUS ERROR]', error);
    return NextResponse.json({ error: `Erro interno: ${error.message}` }, { status: 500 });
  }
}
