import { NextRequest, NextResponse } from 'next/server';
import { callAIMultiImage, loadEmpresaAIConfig, extractContent } from '@/lib/ai-vision';
import { enforcePlan } from '@/lib/plan-enforcement';

const SYSTEM_PROMPT = `Você é OCR de displays eletrônicos de máquinas de arcade.
Receberá 2 imagens recortadas de uma câmera apontando para um display.
Retorne EXATAMENTE no formato JSON: {"entrada":"NNNN","saida":"NNNN"}

Regras:
- Apenas dígitos numéricos (0-9)
- Mantenha zeros à esquerda (ex: 0042, não 42)
- Displays de 7 segmentos: o "1" não tem barra esquerda, o "7" pode ter traço inferior
- Se não conseguir ler um dos valores, coloque "" (vazio)
- NÃO retorne nada além do JSON, sem explicação`;

export async function POST(req: NextRequest) {
  try {
    const { imageBase64Entrada, imageBase64Saida, nomeEntrada, nomeSaida, empresaId } = await req.json();

    if (!imageBase64Entrada && !imageBase64Saida) {
      return NextResponse.json({ error: 'Pelo menos uma imagem é obrigatória' }, { status: 400 });
    }

    if (!empresaId) {
      return NextResponse.json({ error: 'empresaId é obrigatório' }, { status: 400 });
    }

    const planCheck = await enforcePlan(empresaId, { feature: 'recIA' }, req);
    if (planCheck.error) return NextResponse.json({ error: planCheck.error }, { status: 403 });

    // Buscar configurações de IA da empresa
    const { llmModel, llmApiKey } = await loadEmpresaAIConfig(empresaId);

    if (!llmApiKey) {
      return NextResponse.json(
        { error: 'API Key de IA não configurada. Configure nas Config. SaaS do sistema.' },
        { status: 400 }
      );
    }

    const textPrompt = `Imagem 1 (${nomeEntrada || 'Entrada'}): extraia o número visível no display${imageBase64Saida ? `\nImagem 2 (${nomeSaida || 'Saída'}): extraia o número visível no display` : ''}
Responda no formato: {"entrada":"NNNN","saida":"NNNN"}`;

    // Montar array de imagens
    const images: Array<{ base64: string; mimeType?: string }> = [];
    if (imageBase64Entrada) {
      images.push({ base64: imageBase64Entrada, mimeType: 'image/jpeg' });
    }
    if (imageBase64Saida) {
      images.push({ base64: imageBase64Saida, mimeType: 'image/jpeg' });
    }

    // Usar módulo compartilhado (com timeout 30s + responseMimeType + response_format)
    const result = await callAIMultiImage(SYSTEM_PROMPT, textPrompt, images, llmApiKey, llmModel, {
      temperature: 0,
      maxTokens: 30,
      timeout: 30000, // 30s (OCR é rápido)
      jsonMode: true,
      responseFormat: true,
    });

    const texto = result.content.trim() || '{}';

    // Extrair JSON da resposta
    const match = texto.match(/\{[^}]+\}/);
    const resultado = match ? JSON.parse(match[0]) : {};

    return NextResponse.json({
      entrada: resultado.entrada || '',
      saida: resultado.saida || '',
    });
  } catch (error) {
    console.error('Erro OCR:', error);
    // OCR retorna vazio em caso de erro (degradação graciosa)
    return NextResponse.json({ entrada: '', saida: '' }, { status: 500 });
  }
}
