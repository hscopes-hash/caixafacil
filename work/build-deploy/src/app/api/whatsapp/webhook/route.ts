import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Garantir que a tabela existe (compatibilidade com DB sem migration)
async function ensureSchema() {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "fotos_pendentes" (
        "id" TEXT NOT NULL,
        "empresaId" TEXT NOT NULL,
        "clienteId" TEXT,
        "whatsappRemetente" TEXT NOT NULL,
        "imagemBase64" TEXT NOT NULL,
        "mensagemId" TEXT,
        "status" TEXT NOT NULL DEFAULT 'pendente',
        "importadaEm" TIMESTAMP(3),
        "observacoes" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "fotos_pendentes_pkey" PRIMARY KEY ("id")
      );
      CREATE INDEX IF NOT EXISTS "fotos_pendentes_empresaId_idx" ON "fotos_pendentes"("empresaId");
      CREATE INDEX IF NOT EXISTS "fotos_pendentes_clienteId_idx" ON "fotos_pendentes"("clienteId");
      CREATE INDEX IF NOT EXISTS "fotos_pendentes_whatsappRemetente_idx" ON "fotos_pendentes"("whatsappRemetente");
      CREATE UNIQUE INDEX IF NOT EXISTS "fotos_pendentes_mensagemId_key" ON "fotos_pendentes"("mensagemId");
    `);
  } catch (err) {
    console.warn('[WhatsApp Webhook] ensureSchema:', err);
  }
}

// Obter tokens do config_saas ou ENV vars (fallback)
async function getWhatsAppConfig() {
  try {
    const configs = await prisma.$queryRawUnsafe(`SELECT * FROM "config_saas" LIMIT 1`) as any[];
    const c = configs[0] || {};
    return {
      verifyToken: c.whatsappVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN || 'caixafacil_webhook_2026',
      accessToken: c.whatsappAccessToken || process.env.WHATSAPP_ACCESS_TOKEN || '',
      numero: c.whatsappNumero || '',
    };
  } catch {
    return {
      verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'caixafacil_webhook_2026',
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || '',
      numero: '',
    };
  }
}

// ============================================
// GET — Verificação do webhook (Meta exige)
// Quando você configura o webhook no Meta Developer,
// ele envia um GET com hub.mode, hub.verify_token e hub.challenge
// ============================================
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  const { verifyToken } = await getWhatsAppConfig();

  if (mode === 'subscribe' && token === verifyToken) {
    console.log('[WhatsApp] Webhook verificado com sucesso');
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'application/plain' },
    });
  }

  console.log('[WhatsApp] Falha na verificação do webhook:', { mode, token, challenge });
  return NextResponse.json({ error: 'Verificação falhou' }, { status: 403 });
}

// ============================================
// POST — Receber mensagens do WhatsApp
// Processa fotos recebidas e salva como pendentes
// ============================================
export async function POST(request: NextRequest) {
  try {
    await ensureSchema();
    const body = await request.json();

    // Log para debug (sem a imagem em base64)
    console.log('[WhatsApp] Evento recebido:', JSON.stringify(body).substring(0, 500));

    // Verificar se é um evento do WhatsApp
    const entry = body.entry?.[0];
    if (!entry) {
      return NextResponse.json({ status: 'ok' });
    }

    const changes = entry.changes?.[0];
    if (!changes?.value) {
      return NextResponse.json({ status: 'ok' });
    }

    const messages = changes.value.messages;
    const contacts = changes.value.contacts;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ status: 'ok' });
    }

    // Processar cada mensagem
    for (const msg of messages) {
      // Apenas processar mensagens com mídia (imagem)
      if (msg.type !== 'image') {
        console.log(`[WhatsApp] Mensagem tipo "${msg.type}" ignorada (somente imagens são processadas)`);
        continue;
      }

      // Extrair dados do remetente
      const whatsappRemetente = msg.from; // formato: 5511999999999
      const remetenteNome = contacts?.[0]?.profile?.name || 'Desconhecido';

      // Verificar deduplicação pelo ID da mensagem
      const mensagemId = msg.id;
      const existente = await prisma.fotoPendente.findUnique({
        where: { mensagemId: mensagemId || undefined },
      });
      if (existente) {
        console.log(`[WhatsApp] Mensagem ${mensagemId} já processada (deduplicação)`);
        continue;
      }

      // Baixar a imagem da URL do WhatsApp
      const image = msg.image;
      if (!image?.id) {
        console.log('[WhatsApp] Imagem sem ID, ignorando');
        continue;
      }

      const imagemBase64 = await baixarImagemWhatsApp(image.id);

      if (!imagemBase64) {
        console.log('[WhatsApp] Falha ao baixar imagem:', image.id);
        continue;
      }

      // Buscar cliente pelo número WhatsApp cadastrado
      // Normaliza o número: remove +55, 55, espaços, traços, parênteses
      const numeroNormalizado = normalizarNumero(whatsappRemetente);

      const cliente = await prisma.cliente.findFirst({
        where: {
          whatsapp: { not: null },
        },
        select: { id: true, nome: true, empresaId: true, whatsapp: true },
      });

      // Buscar em todas as empresas — filtra pelo número normalizado
      const todosClientes = await prisma.cliente.findMany({
        where: { whatsapp: { not: null } },
        select: { id: true, nome: true, empresaId: true, whatsapp: true },
      });

      const clienteEncontrado = todosClientes.find(c =>
        normalizarNumero(c.whatsapp || '') === numeroNormalizado
      );

      if (!clienteEncontrado) {
        console.log(`[WhatsApp] Nenhum cliente cadastrado com WhatsApp ${whatsappRemetente} (nome: ${remetenteNome})`);
        // Salvar mesmo assim como pendente sem vincular a cliente
        // O operador poderá vincular depois
      }

      // Salvar como foto pendente
      await prisma.fotoPendente.create({
        data: {
          empresaId: clienteEncontrado?.empresaId || 'unknown',
          clienteId: clienteEncontrado?.id || null,
          whatsappRemetente: whatsappRemetente,
          imagemBase64: imagemBase64,
          mensagemId: mensagemId,
          status: 'pendente',
        },
      });

      console.log(`[WhatsApp] Foto salva como pendente — Remetente: ${whatsappRemetente} (${remetenteNome})${clienteEncontrado ? ` → Cliente: ${clienteEncontrado.nome}` : ' → Cliente não encontrado'}`);
    }

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('[WhatsApp] Erro ao processar webhook:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

// ============================================
// Baixar imagem da API do WhatsApp usando token permanente
// ============================================
async function baixarImagemWhatsApp(mediaId: string): Promise<string | null> {
  try {
    const { accessToken } = await getWhatsAppConfig();
    if (!accessToken) {
      console.error('[WhatsApp] Access Token não configurado. Configure em CONFIG SAAS > WhatsApp Business ou defina WHATSAPP_ACCESS_TOKEN no servidor.');
      return null;
    }

    // Passo 1: Obter URL da mídia
    const urlRes = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!urlRes.ok) {
      console.error(`[WhatsApp] Erro ao obter URL da mídia ${mediaId}:`, await urlRes.text());
      return null;
    }

    const mediaData = await urlRes.json();
    const mediaUrl = mediaData.url;
    const mimeType = mediaData.mime_type || 'image/jpeg';

    if (!mediaUrl) {
      console.error('[WhatsApp] URL da mídia não encontrada:', mediaData);
      return null;
    }

    // Passo 2: Baixar a imagem
    const imgRes = await fetch(mediaUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!imgRes.ok) {
      console.error('[WhatsApp] Erro ao baixar imagem:', await imgRes.text());
      return null;
    }

    const arrayBuffer = await imgRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = `data:${mimeType};base64,${buffer.toString('base64')}`;

    return base64;
  } catch (error) {
    console.error('[WhatsApp] Erro ao baixar imagem:', error);
    return null;
  }
}

// ============================================
// Normalizar número WhatsApp para comparação
// Remove tudo que não é dígito, adiciona código país se necessário
// ============================================
function normalizarNumero(numero: string): string {
  // Remove tudo que não é dígito
  let digits = numero.replace(/\D/g, '');

  // Se começa com 55 (Brasil) e tem 13 dígitos (55 + 11 + 9 + 8), está completo
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits;
  }

  // Se tem 11 dígitos (celular sem código país)
  if (digits.length === 11) {
    return '55' + digits;
  }

  // Se tem 10 dígitos (fixo sem código país)
  if (digits.length === 10) {
    return '55' + digits;
  }

  // Se tem 12 dígitos (sem o 9 do celular mas com código país)
  if (digits.length === 12 && digits.startsWith('55')) {
    // Tentar com 9 na frente do número local
    const ddd = digits.substring(2, 4);
    const numeroLocal = digits.substring(4);
    if (numeroLocal.length === 8) {
      return '55' + ddd + '9' + numeroLocal;
    }
  }

  // Fallback: retorna como está
  return digits;
}
