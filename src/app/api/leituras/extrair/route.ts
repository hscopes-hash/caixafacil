import { NextRequest, NextResponse } from 'next/server';

// Extrair valores de leitura de uma imagem usando Google Gemini (gratuito)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imagem, nomeEntrada, nomeSaida, apiKey: bodyApiKey, model: bodyModel } = body;

    if (!imagem) {
      return NextResponse.json(
        { error: 'Imagem é obrigatória' },
        { status: 400 }
      );
    }

    // Validar formato da imagem
    if (!imagem.startsWith('data:image/')) {
      return NextResponse.json(
        { error: 'Formato de imagem inválido. Envie uma imagem em base64.' },
        { status: 400 }
      );
    }

    // Configurações da API Gemini (prioridade: body > env)
    const apiKey = bodyApiKey?.trim() || process.env.LLM_API_KEY?.trim();
    const model = bodyModel?.trim() || process.env.LLM_MODEL?.trim() || 'gemini-2.5-flash-lite';

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API Key não configurada. Configure LLM_API_KEY no Vercel. Obtenha em: https://aistudio.google.com/apikey' },
        { status: 500 }
      );
    }

    console.log('=== DEBUG GEMINI ===');
    console.log('Modelo:', model);
    console.log('API Key (primeiros 10 chars):', apiKey.substring(0, 10));
    console.log('API Key (últimos 5 chars):', apiKey.substring(apiKey.length - 5));
    console.log('===================');

    // Prompt otimizado para leitura de contadores
    const prompt = `Analise esta foto de um contador de máquina de entretenimento.

A máquina tem dois displays:
- "${nomeEntrada || 'E'}" = Contador de ENTRADA (moedas inseridas)
- "${nomeSaida || 'S'}" = Contador de SAÍDA (moedas pagas)

Sua tarefa:
1. Identifique os números exibidos nos displays
2. O display de ENTRADA geralmente mostra um número maior
3. O display de SAÍDA geralmente mostra um número menor

REGRA IMPORTANTE PARA VALORES MONETÁRIOS:
- Quando o número exibido no display tiver formato de moeda (com ponto ou vírgula como separador decimal, ex: "2.324,00" ou "1234.56"), retorne APENAS os algarismos numéricos, removendo todo e qualquer ponto e vírgula.
- Exemplo 1: se o display mostra "2.324,00", retorne "232400". Se mostra "1.234,56", retorne "123456".
- Exemplo 2: se o display mostra "12.34", retorne "1234".
- Exemplo 3: se o display mostra "0,50", retorne "050" ou "50".
- Se o número NÃO tiver separador decimal (é um contador inteiro), retorne o número como está (ex: "1234").
- Os valores devem ser retornados como STRING entre aspas no JSON, para preservar todos os dígitos incluindo zeros à esquerda.

Responda APENAS com este JSON (sem markdown, sem explicações):
{"entrada": "STRING_COM_APENAS_DIGITOS_OU_NULL", "saida": "STRING_COM_APENAS_DIGITOS_OU_NULL", "confianca": PERCENTUAL_0_100, "observacoes": "texto breve"}`;

    // Extrair dados da imagem base64
    const base64Data = imagem.split(',')[1];
    const mimeType = imagem.split(';')[0].split(':')[1];

    // Montar payload para Gemini API
    const payload = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 200,
      }
    };

    // URL correta para Gemini API
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    
    console.log('URL completa:', url.replace(apiKey, 'API_KEY_HIDDEN'));

    // Fazer chamada para a API Gemini
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    console.log('Status:', response.status);
    console.log('Resposta:', responseText.substring(0, 500));

    if (!response.ok) {
      try {
        const errorJson = JSON.parse(responseText);
        const errorMsg = errorJson?.error?.message || responseText;
        
        if (response.status === 400) {
          return NextResponse.json(
            { error: `Erro 400: ${errorMsg}` },
            { status: 500 }
          );
        }
        
        if (response.status === 401 || response.status === 403) {
          return NextResponse.json(
            { error: 'API Key inválida. Verifique sua chave em https://aistudio.google.com/apikey' },
            { status: 500 }
          );
        }
        
        if (response.status === 404) {
          return NextResponse.json(
            { error: `Modelo "${model}" não encontrado. Modelos válidos: gemini-2.0-flash, gemini-2.5-flash, gemini-2.5-pro` },
            { status: 500 }
          );
        }
        
        if (response.status === 429) {
          return NextResponse.json(
            { error: 'Limite de requisições atingido (15/min). Aguarde 1 minuto.' },
            { status: 500 }
          );
        }
        
        return NextResponse.json(
          { error: `Erro ${response.status}: ${errorMsg}` },
          { status: 500 }
        );
      } catch {
        return NextResponse.json(
          { error: `Erro ${response.status}: ${responseText.substring(0, 200)}` },
          { status: 500 }
        );
      }
    }

    const data = JSON.parse(responseText);
    
    // Extrair conteúdo da resposta do Gemini
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      // Verificar se foi bloqueado por segurança
      if (data?.promptFeedback?.blockReason) {
        return NextResponse.json(
          { error: `Imagem bloqueada: ${data.promptFeedback.blockReason}` },
          { status: 500 }
        );
      }
      
      return NextResponse.json(
        { error: 'Resposta vazia da IA' },
        { status: 500 }
      );
    }

    console.log('Conteúdo:', content);

    // Tentar extrair o JSON da resposta
    let resultado;
    try {
      let cleanContent = content
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();
      
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        resultado = JSON.parse(jsonMatch[0]);
      } else {
        resultado = JSON.parse(cleanContent);
      }
    } catch {
      return NextResponse.json(
        { error: 'Erro ao processar resposta. Tente outra foto.', rawResponse: content },
        { status: 500 }
      );
    }

    // Função para sanitizar valor: remove ponto e vírgula, mantém todos os algarismos
    // Exemplo: "2.324,00" → 232400 | "1234.56" → 123456 | "1234" → 1234
    const sanitizarValor = (valor: any): number | null => {
      if (valor === null || valor === undefined || valor === 'null') return null;
      // Converter para string, remover tudo que não for dígito
      const digitos = String(valor).replace(/\D/g, '');
      if (!digitos) return null;
      return parseInt(digitos, 10);
    };

    resultado.entrada = sanitizarValor(resultado.entrada);
    resultado.saida = sanitizarValor(resultado.saida);
    if (typeof resultado.confianca !== 'number') {
      resultado.confianca = 0;
    }

    return NextResponse.json({
      success: true,
      entrada: resultado.entrada,
      saida: resultado.saida,
      confianca: resultado.confianca,
      observacoes: resultado.observacoes || ''
    });

  } catch (error) {
    console.error('Erro:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json(
      { error: `Erro: ${errorMessage}` },
      { status: 500 }
    );
  }
}
