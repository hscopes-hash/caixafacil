import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/cielo/testar
 * Testa as credenciais Cielo da empresa (sandbox ou produção)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { empresaId } = body;

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId é obrigatório' }, { status: 400 });
    }

    const empresa = await db.empresa.findUnique({
      where: { id: empresaId },
      select: {
        cieloMerchantId: true,
        cieloMerchantKey: true,
        cieloAmbiente: true,
        nome: true,
      },
    });

    if (!empresa?.cieloMerchantId || !empresa?.cieloMerchantKey) {
      return NextResponse.json({
        success: false,
        mensagem: 'Cielo nao configurada',
        detalhe: 'Preencha o Merchant ID e Merchant Key nas configuracoes',
      });
    }

    const isSandbox = empresa.cieloAmbiente !== 'production';
    const baseUrl = isSandbox
      ? 'https://apisandbox.cielo.com.br'
      : 'https://api.cielo.com.br';

    const startMs = Date.now();

    // Consultar uma transação inexistente para validar credenciais (endpoint GET /1/sales/{merchantOrderId})
    const testOrderId = `TEST-${Date.now()}`;
    const response = await fetch(`${baseUrl}/1/sales/${testOrderId}`, {
      method: 'GET',
      headers: {
        'MerchantId': empresa.cieloMerchantId,
        'MerchantKey': empresa.cieloMerchantKey,
        'Content-Type': 'application/json',
        'RequestId': `test-${Date.now()}`,
      },
      // Timeout de 10s
      signal: AbortSignal.timeout(10000),
    });

    const elapsed = Date.now() - startMs;

    // Se retornar 404, as credenciais são válidas (transação não encontrada = autenticou)
    if (response.status === 404) {
      return NextResponse.json({
        success: true,
        mensagem: 'Credenciais Cielo validadas com sucesso',
        detalhe: `Ambiente: ${isSandbox ? 'SANDBOX' : 'PRODUCAO'}. Conexão OK (${elapsed}ms)`,
        tempoMs: elapsed,
        ambiente: isSandbox ? 'sandbox' : 'production',
        merchantId: empresa.cieloMerchantId,
      });
    }

    if (response.status === 401) {
      return NextResponse.json({
        success: false,
        mensagem: 'Credenciais inválidas',
        detalhe: 'Merchant ID ou Merchant Key incorretos',
        tempoMs: elapsed,
      });
    }

    const data = await response.json().catch(() => ({}));
    return NextResponse.json({
      success: response.status >= 200 && response.status < 500,
      mensagem: response.ok ? 'Conexão OK' : `Erro HTTP ${response.status}`,
      detalhe: JSON.stringify(data).substring(0, 200),
      tempoMs: elapsed,
    });
  } catch (error: any) {
    if (error.name === 'TimeoutError') {
      return NextResponse.json({
        success: false,
        mensagem: 'Timeout na conexao com Cielo',
        detalhe: 'Verifique a conexao e o ambiente (sandbox/producao)',
        tempoMs: 10000,
      });
    }
    console.error('[CIELO TEST ERROR]', error);
    return NextResponse.json({
      success: false,
      mensagem: 'Erro ao testar conexao',
      detalhe: error.message,
    }, { status: 500 });
  }
}
