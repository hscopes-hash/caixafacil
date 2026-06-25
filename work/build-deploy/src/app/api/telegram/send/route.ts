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
//   primeiraFotoComoDocumento?: boolean
//
// O bot token vem da empresa (telegramBotToken).
// O chat ID vem do cliente (telegramGroupId).
// ============================================

interface SendRequest {
  empresaId: string;
  clienteId: string;
  mensagem: string;
  fotos?: string[];
  primeiraFotoComoDocumento?: boolean;
}

async function getTelegramBotToken(empresaId: string): Promise<string | null> {
  try {
    const empresa = await prisma.empresa.findUnique({
      where: { id: empresaId },
      select: { telegramBotToken: true },
    });
    return empresa?.telegramBotToken || null;
  } catch (err) {
    console.error('[Telegram] Erro ao buscar bot token:', err);
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
  } catch (err) {
    console.error('[Telegram] Erro ao buscar group ID:', err);
    return null;
  }
}

// Enviar mensagem de texto
async function sendTelegramText(botToken: string, chatId: string, text: string): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[Telegram] Enviando sendMessage...');
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
      const errMsg = `sendMessage: ${data.description || 'erro desconhecido'} (code ${data.error_code || '?'})`;
      console.error('[Telegram] sendMessage error:', errMsg);
      return { success: false, error: errMsg };
    }
    console.log('[Telegram] sendMessage OK');
    return { success: true };
  } catch (error) {
    const errMsg = `sendMessage exception: ${error instanceof Error ? error.message : String(error)}`;
    console.error('[Telegram]', errMsg);
    return { success: false, error: errMsg };
  }
}

// Constrói multipart/form-data manualmente a partir de campos
function buildMultipartFormData(fields: Array<{ name: string; value: string | Buffer; filename?: string; contentType?: string }>): { body: Buffer; contentType: string } {
  const boundary = `----CaixaFacilBoundary${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const parts: Buffer[] = [];

  for (const field of fields) {
    parts.push(Buffer.from(`--${boundary}\r\n`));
    if (field.filename) {
      parts.push(Buffer.from(
        `Content-Disposition: form-data; name="${field.name}"; filename="${field.filename}"\r\n` +
        `Content-Type: ${field.contentType || 'application/octet-stream'}\r\n\r\n`
      ));
      parts.push(field.value as Buffer);
      parts.push(Buffer.from('\r\n'));
    } else {
      parts.push(Buffer.from(
        `Content-Disposition: form-data; name="${field.name}"\r\n\r\n`
      ));
      parts.push(Buffer.from(String(field.value)));
      parts.push(Buffer.from('\r\n'));
    }
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

// Enviar foto individual (aceita base64 data URL ou URL HTTP)
async function sendTelegramPhoto(
  botToken: string,
  chatId: string,
  photoSource: string,
  caption?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Se é data URL (base64)
    if (photoSource.startsWith('data:')) {
      const base64Data = photoSource.split(',')[1];
      if (!base64Data) {
        return { success: false, error: 'foto base64 vazia' };
      }
      const buffer = Buffer.from(base64Data, 'base64');
      console.log(`[Telegram] sendPhoto base64: ${buffer.length} bytes`);

      const mimeMatch = photoSource.match(/data:(image\/\w+);/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const ext = mimeType === 'image/png' ? 'png' : 'jpg';
      const fileName = `foto_${Date.now()}.${ext}`;

      const fields: Array<{ name: string; value: string | Buffer; filename?: string; contentType?: string }> = [
        { name: 'chat_id', value: chatId },
      ];
      if (caption) fields.push({ name: 'caption', value: caption });
      fields.push({ name: 'photo', value: buffer, filename: fileName, contentType: mimeType });

      const { body, contentType } = buildMultipartFormData(fields);

      const resp = await fetch(
        `https://api.telegram.org/bot${botToken}/sendPhoto`,
        {
          method: 'POST',
          headers: {
            'Content-Type': contentType,
            'Content-Length': body.length.toString(),
          },
          body: new Uint8Array(body),
        }
      );
      const data = await resp.json();
      if (!data.ok) {
        const errMsg = `sendPhoto: ${data.description || 'erro'} (code ${data.error_code || '?'})`;
        console.error('[Telegram]', errMsg);
        return { success: false, error: errMsg };
      }
      console.log('[Telegram] sendPhoto OK');
      return { success: true };
    }

    // URL HTTP — usa FormData nativo (caso simples, sem binário)
    console.log('[Telegram] sendPhoto URL HTTP');
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
      const errMsg = `sendPhoto URL: ${data.description || 'erro'} (code ${data.error_code || '?'})`;
      console.error('[Telegram]', errMsg);
      return { success: false, error: errMsg };
    }
    console.log('[Telegram] sendPhoto URL OK');
    return { success: true };
  } catch (error) {
    const errMsg = `sendPhoto exception: ${error instanceof Error ? error.message : String(error)}`;
    console.error('[Telegram]', errMsg);
    return { success: false, error: errMsg };
  }
}

// Enviar documento (arquivo) — NÃO comprime a imagem
async function sendTelegramDocument(
  botToken: string,
  chatId: string,
  photoSource: string,
  caption?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!photoSource.startsWith('data:')) {
      // URL HTTP — sendDocument não suporta URL, precisa ser arquivo
      console.warn('[Telegram] sendDocument recebeu URL, usando sendPhoto fallback');
      return await sendTelegramPhoto(botToken, chatId, photoSource, caption);
    }

    const base64Data = photoSource.split(',')[1];
    if (!base64Data) {
      return { success: false, error: 'documento base64 vazio' };
    }
    const buffer = Buffer.from(base64Data, 'base64');
    console.log(`[Telegram] sendDocument base64: ${buffer.length} bytes`);

    const mimeMatch = photoSource.match(/data:(image\/\w+);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const ext = mimeType === 'image/png' ? 'png' : 'jpg';
    const fileName = `relatorio_${Date.now()}.${ext}`;

    const fields: Array<{ name: string; value: string | Buffer; filename?: string; contentType?: string }> = [
      { name: 'chat_id', value: chatId },
    ];
    if (caption) fields.push({ name: 'caption', value: caption });
    fields.push({ name: 'document', value: buffer, filename: fileName, contentType: mimeType });

    const { body, contentType } = buildMultipartFormData(fields);

    const resp = await fetch(
      `https://api.telegram.org/bot${botToken}/sendDocument`,
      {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'Content-Length': body.length.toString(),
        },
        body: new Uint8Array(body),
      }
    );
    const data = await resp.json();
    if (!data.ok) {
      const errMsg = `sendDocument: ${data.description || 'erro'} (code ${data.error_code || '?'})`;
      console.error('[Telegram]', errMsg);
      console.warn('[Telegram] Tentando sendPhoto como fallback...');
      const fallback = await sendTelegramPhoto(botToken, chatId, photoSource, caption);
      return fallback.success
        ? { success: true }
        : { success: false, error: `${errMsg}; fallback sendPhoto também falhou: ${fallback.error}` };
    }
    console.log('[Telegram] sendDocument OK');
    return { success: true };
  } catch (error) {
    const errMsg = `sendDocument exception: ${error instanceof Error ? error.message : String(error)}`;
    console.error('[Telegram]', errMsg);
    console.warn('[Telegram] Tentando sendPhoto como fallback após exceção...');
    try {
      const fallback = await sendTelegramPhoto(botToken, chatId, photoSource, caption);
      return fallback.success
        ? { success: true }
        : { success: false, error: `${errMsg}; fallback sendPhoto falhou: ${fallback.error}` };
    } catch (fallbackErr) {
      return { success: false, error: `${errMsg}; fallback exception: ${fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)}` };
    }
  }
}

// Enviar múltiplas fotos como álbum (media group) — só URLs HTTP
async function sendTelegramMediaGroup(
  botToken: string,
  chatId: string,
  photoSources: string[]
): Promise<{ success: boolean; error?: string }> {
  try {
    const media: { type: string; media: string; caption?: string }[] = [];

    for (let i = 0; i < photoSources.length; i++) {
      const src = photoSources[i];
      if (src.startsWith('data:')) {
        // Para base64, media group não suporta — fallback para envio individual
        return { success: false, error: 'media group não suporta base64' };
      }
      media.push({
        type: 'photo',
        media: src,
        caption: i === 0 ? 'Fotos da leitura' : undefined,
      });
    }

    if (media.length === 0) return { success: false, error: 'mídia vazia' };

    const resp = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMediaGroup`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, media }),
      }
    );
    const data = await resp.json();
    if (!data.ok) {
      const errMsg = `sendMediaGroup: ${data.description || 'erro'} (code ${data.error_code || '?'})`;
      console.error('[Telegram]', errMsg);
      return { success: false, error: errMsg };
    }
    console.log('[Telegram] sendMediaGroup OK');
    return { success: true };
  } catch (error) {
    const errMsg = `sendMediaGroup exception: ${error instanceof Error ? error.message : String(error)}`;
    console.error('[Telegram]', errMsg);
    return { success: false, error: errMsg };
  }
}

export async function POST(request: NextRequest) {
  console.log('[Telegram] POST recebido');
  try {
    const body: SendRequest = await request.json();
    const { empresaId, clienteId, mensagem, fotos, primeiraFotoComoDocumento } = body;

    console.log('[Telegram] Payload:', {
      empresaId: empresaId ? '✓' : '✗',
      clienteId: clienteId ? '✓' : '✗',
      mensagemLength: mensagem?.length || 0,
      fotosCount: fotos?.length || 0,
      primeiraFotoComoDocumento,
    });

    // Validações
    if (!empresaId || !clienteId) {
      return NextResponse.json({ success: false, error: 'empresaId e clienteId são obrigatórios' }, { status: 400 });
    }

    // Obter bot token da empresa
    console.log('[Telegram] Buscando bot token...');
    const botToken = await getTelegramBotToken(empresaId);
    if (!botToken) {
      return NextResponse.json({ success: false, error: 'Telegram Bot Token não configurado. Configure nas Configurações da Empresa.' }, { status: 400 });
    }
    console.log('[Telegram] Bot token OK');

    // Obter group ID do cliente
    console.log('[Telegram] Buscando group ID...');
    const groupId = await getTelegramGroupId(clienteId);
    if (!groupId) {
      return NextResponse.json({ success: false, error: 'Cliente não possui Grupo Telegram cadastrado.' }, { status: 400 });
    }
    console.log('[Telegram] Group ID OK:', groupId);

    const resultados: { tipo: string; success: boolean; error?: string }[] = [];

    // 1) Enviar texto do extrato
    if (mensagem) {
      const textoFormatado = `<pre>${mensagem}</pre>`;
      const result = await sendTelegramText(botToken, groupId, textoFormatado);
      resultados.push({ tipo: 'texto', success: result.success, error: result.error });
    }

    // 2) Enviar fotos
    if (fotos && fotos.length > 0) {
      const caption = undefined; // sempre undefined (já enviamos imagem em vez de texto)

      if (primeiraFotoComoDocumento && fotos.length > 0) {
        // TODAS as fotos enviadas como documento (sem compressão)
        // Usado para relatórios A4 divididos em partes — cada parte precisa
        // manter legibilidade, então todas vão como sendDocument.
        for (let i = 0; i < fotos.length; i++) {
          console.log(`[Telegram] Modo documento: enviando foto ${i + 1}/${fotos.length} como documento`);
          const docResult = await sendTelegramDocument(botToken, groupId, fotos[i], i === 0 ? caption : undefined);
          resultados.push({ tipo: `documento_${i + 1}`, success: docResult.success, error: docResult.error });
          if (i < fotos.length - 1) {
            await new Promise(r => setTimeout(r, 500));
          }
        }
      } else {
        // Comportamento padrão: todas via sendPhoto
        const allAreUrls = fotos.every(f => f.startsWith('http'));

        if (allAreUrls && fotos.length > 1) {
          const mgResult = await sendTelegramMediaGroup(botToken, groupId, fotos);
          if (mgResult.success) {
            resultados.push({ tipo: 'fotos_album', success: true });
          } else {
            for (let i = 0; i < fotos.length; i++) {
              const photoResult = await sendTelegramPhoto(botToken, groupId, fotos[i], i === 0 ? caption : undefined);
              resultados.push({ tipo: `foto_${i + 1}`, success: photoResult.success, error: photoResult.error });
            }
          }
        } else {
          for (let i = 0; i < fotos.length; i++) {
            console.log(`[Telegram] Enviando foto ${i + 1}/${fotos.length}`);
            const photoResult = await sendTelegramPhoto(botToken, groupId, fotos[i], i === 0 ? caption : undefined);
            resultados.push({ tipo: `foto_${i + 1}`, success: photoResult.success, error: photoResult.error });
            if (i < fotos.length - 1) {
              await new Promise(r => setTimeout(r, 500));
            }
          }
        }
      }
    }

    const todosOk = resultados.every(r => r.success);
    const erros = resultados.filter(r => !r.success);

    console.log('[Telegram] Resultado final:', { todosOk, total: resultados.length, erros: erros.length });

    return NextResponse.json({
      success: todosOk,
      mensagem: todosOk ? 'Enviado com sucesso!' : 'Enviado com alguns erros',
      resultados,
      erros: erros.length > 0 ? erros.map(e => ({ tipo: e.tipo, error: e.error })) : undefined,
      // Mensagem de erro detalhada para o frontend exibir
      errorDetail: erros.length > 0 ? erros.map(e => `${e.tipo}: ${e.error}`).join('; ') : undefined,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error('[Telegram] Erro geral (não tratado):', errMsg);
    console.error('[Telegram] Stack:', error instanceof Error ? error.stack : 'n/a');
    return NextResponse.json({ success: false, error: `Erro interno: ${errMsg}` }, { status: 500 });
  }
}
