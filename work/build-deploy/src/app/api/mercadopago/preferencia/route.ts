import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/mercadopago/preferencia
 * Cria uma preferência de checkout no Mercado Pago para cobranças POS.
 * Usa as credenciais (access token) da empresa.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { valor, descricao, email, cpfCnpj, nome, empresaId } = body;

    if (!valor || valor <= 0) {
      return NextResponse.json({ error: 'Valor obrigatorio e deve ser maior que zero' }, { status: 400 });
    }

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId obrigatorio' }, { status: 400 });
    }

    // Buscar empresa para obter as credenciais do MP
    const empresa = await db.empresa.findUnique({
      where: { id: empresaId },
      select: {
        mercadopagoAccessToken: true,
        mercadopagoPublicKey: true,
        nome: true,
      },
    });

    if (!empresa?.mercadopagoAccessToken) {
      return NextResponse.json(
        { error: 'Mercado Pago nao configurado para esta empresa.' },
        { status: 400 },
      );
    }

    // Criar preferência no Mercado Pago
    const preferencia = {
      items: [
        {
          id: `cobranca-${Date.now()}`,
          title: descricao || `Cobranca - ${empresa.nome}`,
          quantity: 1,
          unit_price: parseFloat(Number(valor).toFixed(2)),
          currency_id: 'BRL',
        },
      ],
      payer: {
        email: email || '',
        first_name: nome?.split(' ')[0] || '',
        last_name: nome?.split(' ').slice(1).join(' ') || '',
        identification: cpfCnpj
          ? {
              type: cpfCnpj.replace(/\D/g, '').length <= 11 ? 'CPF' : 'CNPJ',
              number: cpfCnpj.replace(/\D/g, ''),
            }
          : undefined,
      },
      back_urls: {
        success: `${process.env.NEXT_PUBLIC_APP_URL || 'https://caixafaciloficial.web.app'}/?payment=success`,
        failure: `${process.env.NEXT_PUBLIC_APP_URL || 'https://caixafaciloficial.web.app'}/?payment=failure`,
        pending: `${process.env.NEXT_PUBLIC_APP_URL || 'https://caixafaciloficial.web.app'}/?payment=pending`,
      },
      auto_return: 'approved',
      external_reference: `cobranca|${empresaId}|${Date.now()}`,
      metadata: {
        empresa_id: empresaId,
        tipo: 'cobranca_pos',
      },
    };

    const mpController = new AbortController();
    const mpTimeout = setTimeout(() => mpController.abort(), 15000);

    let mpResponse: Response;
    try {
      mpResponse = await fetch('https://api.mercadopago.com/checkout/preferences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${empresa.mercadopagoAccessToken}`,
          'X-Idempotency-Key': `cobranca-${empresaId}-${Date.now()}`,
        },
        body: JSON.stringify(preferencia),
        signal: mpController.signal,
      });
    } catch (mpError: any) {
      clearTimeout(mpTimeout);
      console.error('[MP PREFERENCIA] Erro de conexao:', mpError?.message);
      return NextResponse.json(
        { error: 'Falha ao conectar com Mercado Pago. Tente novamente.' },
        { status: 504 },
      );
    }
    clearTimeout(mpTimeout);

    if (!mpResponse.ok) {
      const errorData = await mpResponse.json().catch(() => ({}));
      console.error('[MP PREFERENCIA] Erro MP:', mpResponse.status, errorData);
      return NextResponse.json(
        { error: `Erro Mercado Pago: ${errorData.message || 'Falha ao criar preferencia'}` },
        { status: 502 },
      );
    }

    const mpData = await mpResponse.json();

    return NextResponse.json({
      success: true,
      id: mpData.id,
      publicKey: empresa.mercadopagoPublicKey || '',
      init_point: mpData.init_point,
      sandbox_init_point: mpData.sandbox_init_point,
    });
  } catch (error: any) {
    console.error('[MP PREFERENCIA] Erro:', error);
    return NextResponse.json({ error: `Erro interno: ${error.message}` }, { status: 500 });
  }
}
