import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/mercadopago/testar-empresa
 * Testa se as credenciais do Mercado Pago da empresa estao validas.
 * Faz uma chamada simples a API do MP para verificar o access token.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { empresaId } = body;

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId obrigatorio' }, { status: 400 });
    }

    const empresa = await db.empresa.findUnique({
      where: { id: empresaId },
      select: {
        mercadopagoAccessToken: true,
        mercadopagoPublicKey: true,
        nome: true
      }
    });

    if (!empresa) {
      return NextResponse.json({ error: 'Empresa nao encontrada' }, { status: 404 });
    }

    if (!empresa.mercadopagoAccessToken) {
      return NextResponse.json({
        success: false,
        mensagem: 'Access Token nao configurado',
        detalhe: 'Preencha o Access Token do Mercado Pago nas configuracoes da empresa.'
      });
    }

    // Testar access token fazendo GET no /v1/users/me
    const inicio = performance.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    let response: Response;
    try {
      response = await fetch('https://api.mercadopago.com/v1/users/me', {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Authorization': `Bearer ${empresa.mercadopagoAccessToken}`
        }
      });
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError?.name === 'AbortError') {
        return NextResponse.json({
          success: false,
          mensagem: 'Tempo esgotado ao conectar com Mercado Pago',
          detalhe: 'Verifique sua conexao com a internet e tente novamente.'
        });
      }
      throw fetchError;
    } finally {
      clearTimeout(timeoutId);
    }

    const tempoMs = Math.round(performance.now() - inicio);
    const responseData = await response.json().catch(() => null);

    if (!response.ok) {
      const mpMessage = responseData?.message || '';
      const mpError = responseData?.error || '';

      if (response.status === 401 || response.status === 403) {
        return NextResponse.json({
          success: false,
          mensagem: 'Access Token invalido ou expirado',
          detalhe: 'O token informado nao e valido. Gere um novo token no painel do Mercado Pago.',
          tempoMs
        });
      }

      return NextResponse.json({
        success: false,
        mensagem: `Erro ao autenticar (${response.status})`,
        detalhe: mpMessage || mpError || 'Erro desconhecido ao verificar credenciais.',
        tempoMs
      });
    }

    // Token valido - retornar info da conta
    const nickname = responseData?.nickname || '';
    const email = responseData?.email || '';
    const userType = responseData?.user_type || '';

    return NextResponse.json({
      success: true,
      mensagem: 'Conexao com Mercado Pago OK!',
      detalhe: `Conta verificada: ${nickname || email}${userType ? ` (${userType})` : ''}`,
      tempoMs,
      conta: {
        nickname,
        email,
        userType
      },
      publicKey: empresa.mercadopagoPublicKey ? true : false,
      publicKeyAlert: empresa.mercadopagoPublicKey ? null : 'Public Key nao configurada. Necessaria para checkout no navegador.'
    });

  } catch (error: any) {
    console.error('[MP TEST ERROR]', error);
    return NextResponse.json({
      success: false,
      mensagem: 'Erro ao testar conexao',
      detalhe: error.message || 'Erro desconhecido'
    });
  }
}
