import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ============================================
// POST — Enviar extrato (texto) + fotos para grupo Telegram
//
// Body:
//   empresaId: string
//   clienteId: string
//   mensagem: string        (texto do extrato)
//   fotos: string[]         (array de data URLs ou URLs HTTP das fotos — base64 ou https)
//
// O bot token vem da empresa (telegramBotToken).
// O chat ID vem do cliente (telegramGroupId).
// ============================================

interface SendRequest {
  empresaId: string;
  clienteId: string;
  mensagem: string;
  fotos?: string[];
  // Se true, envia a PRIMEIRA foto como documento (sem compressão) ao invés de photo.
  // Usado para relatórios com texto que precisam manter legibilidade.
  // Telegram comprime JPGs enviados via sendPhoto, mas NÃO comprime via sendDocument.
  primeiraFotoComoDocumento?: boolean;
}

async function getTelegramBotToken(empresaId: string): Promise<string | null> {
  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { telegramBotToken: true },
    });
    return empresa?.telegramBotToken || null;
  } catch {
    return null;
  }
}

async function getTelegramGroupId(clienteId: string): Promise<string | null> {
  try {
    const cliente = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { telegramGroupId: true },
    });
    return cliente?.telegramGroupId || null;
  } catch {
    return null;
  }
}

// Enviar mensagem de texto
async function sendTelegramText(botToken: string, chatId: string, text: string): Promise<boolean> {
  try {
    const resp = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'HTML',
        }),
      }
    );
    const data = await resp.json();
    if (!data.ok) {
      console.error('[Telegram] sendMessage error:', data.description);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Telegram] sendMessage exception:', error);
    return false;
  }
}

// Enviar foto individual (aceita base64 data URL ou URL HTTP)
async function sendTelegramPhoto(
  botToken: string,
  chatId: string,
  photoSource: string,
  caption?: string
): Promise<boolean> {
  try {
    // Se é data URL (base64), converter para Buffer
    if (photoSource.startsWith('data:')) {
      const base64Data = photoSource.split(',')[1];
      const buffer = Buffer.from(base64Data, 'base64');

      // Extrair mime type
      const mimeMatch = photoSource.match(/data:(image\/\w+);/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const ext = mimeType === 'image/png' ? 'png' : 'jpg';

      const formData = new FormData();
      formData.append('chat_id', chatId);
      const blob = new Blob([buffer], { type: mimeType });
      formData.append('photo', blob, `foto_${Date.now()}.${ext}`);
      if (caption) formData.append('caption', caption);

      const resp = await fetch(
        `https://api.telegram.org/bot${botToken}/sendPhoto`,
        { method: 'POST', body: formData }
      );
      const data = await resp.json();
      if (!data.ok) {
        console.error('[Telegram] sendPhoto error:', data.description);
        return false;
      }
      return true;
    }

    // Se é URL HTTP, usar directly
    const formData = new FormData();
    formData.append('chat_id', chatId);
    formData.append('photo', photoSource);
    if (caption) formData.append('caption', caption);

    const resp = await fetch(
      `https://api.telegram.org/bot${botToken}/sendPhoto`,
      { method: 'POST', body: formData }
    );
    const data = await resp.json();
    if (!data.ok) {
      console.error('[Telegram] sendPhoto (URL) error:', data.description);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Telegram] sendPhoto exception:', error);
    return false;
  }
}

// Enviar documento (arquivo) — NÃO comprime a imagem.
// Usado para relatórios com texto que precisam manter legibilidade.
// O Telegram recebe o arquivo original e o usuário pode ampliar/zoom sem perda.
async function sendTelegramDocument(
  botToken: string,
  chatId: string,
  photoSource: string,
  caption?: string
): Promise<boolean> {
  try {
    if (!photoSource.startsWith('data:')) {
      // URL HTTP — sendDocument não suporta URL, precisa ser arquivo
      // Fallback para sendPhoto
      return await sendTelegramPhoto(botToken, chatId, photoSource, caption);
    }

    const base64Data = photoSource.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');

    const mimeMatch = photoSource.match(/data:(image\/\w+);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const ext = mimeType === 'image/png' ? 'png' : 'jpg';

    const formData = new FormData();
    formData.append('chat_id', chatId);
    const blob = new Blob([buffer], { type: mimeType });
    // Nome do arquivo com timestamp para evitar colisões
    formData.append('document', blob, `relatorio_${Date.now()}.${ext}`);
    if (caption) formData.append('caption', caption);

    const resp = await fetch(
      `https://api.telegram.org/bot${botToken}/sendDocument`,
      { method: 'POST', body: formData }
    );
    const data = await resp.json();
    if (!data.ok) {
      console.error('[Telegram] sendDocument error:', data.description);
      // Fallback para sendPhoto se sendDocument falhar
      console.warn('[Telegram] Tentando sendPhoto como fallback...');
      return await sendTelegramPhoto(botToken, chatId, photoSource, caption);
    }
    return true;
  } catch (error) {
    console.error('[Telegram] sendDocument exception:', error);
    return false;
  }
}

// Enviar múltiplas fotos como álbum (media group)
async function sendTelegramMediaGroup(
  botToken: string,
  chatId: string,
  photoSources: string[]
): Promise<boolean> {
  try {
    const media: { type: string; media: string; caption?: string }[] = [];

    for (let i = 0; i < photoSources.length; i++) {
      const src = photoSources[i];

      if (src.startsWith('data:')) {
        // Para base64, precisa enviar uma por uma (media group não suporta upload multipart misto)
        return false; // fallback para envio individual
      }

      media.push({
        type: 'photo',
        media: src,
        caption: i === 0 ? 'Fotos da leitura' : undefined,
      });
    }

    if (media.length === 0) return false;

    const resp = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMediaGroup`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          media,
        }),
      }
    );
    const data = await resp.json();
    if (!data.ok) {
      console.error('[Telegram] sendMediaGroup error:', data.description);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Telegram] sendMediaGroup exception:', error);
    return false;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: SendRequest = await request.json();
    const { empresaId, clienteId, mensagem, fotos, primeiraFotoComoDocumento } = body;

    // Validações
    if (!empresaId || !clienteId) {
      return NextResponse.json({ success: false, error: 'empresaId e clienteId são obrigatórios' }, { status: 400 });
    }

    // Obter bot token da empresa
    const botToken = await getTelegramBotToken(empresaId);
    if (!botToken) {
      return NextResponse.json({ success: false, error: 'Telegram Bot Token não configurado. Configure nas Configurações da Empresa.' }, { status: 400 });
    }

    // Obter group ID do cliente
    const groupId = await getTelegramGroupId(clienteId);
    if (!groupId) {
      return NextResponse.json({ success: false, error: 'Cliente não possui Grupo Telegram cadastrado.' }, { status: 400 });
    }

    const resultados: { tipo: string; sucesso: boolean }[] = [];

    // 1) Enviar texto do extrato
    if (mensagem) {
      // Formatar como texto mono para melhor leitura
      const textoFormatado = `<pre>${mensagem}</pre>`;
      const ok = await sendTelegramText(botToken, groupId, textoFormatado);
      resultados.push({ tipo: 'texto', sucesso: ok });
    }

    // 2) Enviar fotos
    if (fotos && fotos.length > 0) {
      // Caption para a primeira foto (extrato) — contexto para o destinatário
      const caption = mensagem
        ? undefined // se já enviou texto, não repetir
        : undefined; // caption vazio por padrão (extrato já tem conteúdo visual)

      // Se primeiraFotoComoDocumento = true, envia a PRIMEIRA foto via
      // sendDocument (sem compressão) para manter legibilidade do relatório.
      // As demais fotos continuam sendo enviadas via sendPhoto (com tarja).
      if (primeiraFotoComoDocumento && fotos.length > 0) {
        // Primeira foto como documento (alta resolução, sem compressão)
        const okDoc = await sendTelegramDocument(botToken, groupId, fotos[0], caption);
        resultados.push({ tipo: 'documento_1', sucesso: okDoc });

        // Demais fotos como photo normal (são as fotos das máquinas com tarja)
        for (let i = 1; i < fotos.length; i++) {
          const ok = await sendTelegramPhoto(botToken, groupId, fotos[i]);
          resultados.push({ tipo: `foto_${i + 1}`, sucesso: ok });
          // Delay entre envios para evitar rate limit (30 msg/s)
          await new Promise(r => setTimeout(r, 500));
        }
      } else {
        // Comportamento padrão: todas via sendPhoto
        // Verificar se todas são URLs HTTP (pode usar media group)
        const allAreUrls = fotos.every(f => f.startsWith('http'));

        if (allAreUrls && fotos.length > 1) {
          // Tentar enviar como álbum
          const ok = await sendTelegramMediaGroup(botToken, groupId, fotos);
          if (ok) {
            resultados.push({ tipo: 'fotos_album', sucesso: true });
          } else {
            // Fallback: enviar uma por uma
            for (let i = 0; i < fotos.length; i++) {
              const ok = await sendTelegramPhoto(botToken, groupId, fotos[i], i === 0 ? caption : undefined);
              resultados.push({ tipo: `foto_${i + 1}`, sucesso: ok });
            }
          }
        } else {
          // Enviar uma por uma (base64 precisa de upload multipart)
          for (let i = 0; i < fotos.length; i++) {
            const ok = await sendTelegramPhoto(botToken, groupId, fotos[i], i === 0 ? caption : undefined);
            resultados.push({ tipo: `foto_${i + 1}`, sucesso: ok });
            // Delay entre envios para evitar rate limit (30 msg/s)
            if (i < fotos.length - 1) {
              await new Promise(r => setTimeout(r, 500));
            }
          }
        }
      }
    }

    const todosOk = resultados.every(r => r.sucesso);
    const erros = resultados.filter(r => !r.sucesso);

    return NextResponse.json({
      success: todosOk,
      mensagem: todosOk ? 'Enviado com sucesso!' : 'Enviado com alguns erros',
      resultados,
      erros: erros.length > 0 ? erros.map(e => e.tipo) : undefined,
    });
  } catch (error) {
    console.error('[Telegram] Erro geral:', error);
    return NextResponse.json({ success: false, error: 'Erro interno do servidor' }, { status: 500 });
  }
}
