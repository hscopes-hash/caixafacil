import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { SUPER_ADMIN_EMAIL } from '@/lib/saas-config';

// Atualizar empresa
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      adminEmail,
      bloqueada,
      motivoBloqueio,
      // Campos completos de edicao
      nome,
      cnpj,
      email,
      telefone,
      endereco,
      cidade,
      estado,
      plano,
      isDemo,
      diasDemo,
      dataVencimento,
      ativa,
      pixChaveTipo,
      pixChave,
      pixMerchantNome,
      pixMerchantCidade,
      pixBancoNome,
      telegramBotToken,
      mercadopagoAccessToken,
      mercadopagoPublicKey,
      permiteEditarLeituraAnterior,
      cieloMerchantId,
      cieloMerchantKey,
      cieloAmbiente,
      cieloEstabelecimento,
      cieloMcc,
      cieloClientId,
      cieloClientSecret,
    } = body;

    // Verificar se e o admin master
    if (adminEmail !== SUPER_ADMIN_EMAIL) {
      return NextResponse.json(
        { error: 'Acesso negado' },
        { status: 403 }
      );
    }

    // Se apenas bloqueia/desbloqueia (campos minimos), nao tocar nos demais
    if (bloqueada !== undefined && !nome) {
      const data: Record<string, unknown> = { bloqueada };
      if (motivoBloqueio !== undefined) data.motivoBloqueio = motivoBloqueio;
      const empresa = await db.empresa.update({
        where: { id },
        data,
      });
      return NextResponse.json(empresa);
    }

    // Edicao completa
    const empresa = await db.empresa.update({
      where: { id },
      data: {
        nome,
        cnpj: cnpj || null,
        email: email || null,
        telefone: telefone || null,
        endereco: endereco || null,
        cidade: cidade || null,
        estado: estado || null,
        plano,
        isDemo,
        diasDemo,
        dataVencimento: dataVencimento ? new Date(dataVencimento) : null,
        ativa,
        bloqueada,
        motivoBloqueio,
        pixChaveTipo: pixChaveTipo || null,
        pixChave: pixChave || null,
        pixMerchantNome: pixMerchantNome || null,
        pixMerchantCidade: pixMerchantCidade || null,
        pixBancoNome: pixBancoNome || null,
        telegramBotToken: telegramBotToken || null,
        mercadopagoAccessToken: mercadopagoAccessToken || null,
        mercadopagoPublicKey: mercadopagoPublicKey || null,
      }
    });

    return NextResponse.json(empresa);
  } catch (error) {
    console.error('Erro ao atualizar empresa:', error);
    return NextResponse.json(
      { error: 'Erro ao atualizar empresa' },
      { status: 500 }
    );
  }
}

// Excluir empresa
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const adminEmail = searchParams.get('adminEmail');

    // Verificar se e o admin master
    if (adminEmail !== SUPER_ADMIN_EMAIL) {
      return NextResponse.json(
        { error: 'Acesso negado' },
        { status: 403 }
      );
    }

    await db.empresa.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao excluir empresa:', error);
    return NextResponse.json(
      { error: 'Erro ao excluir empresa' },
      { status: 500 }
    );
  }
}
