/**
 * ai-vision.ts — Módulo de chamadas de IA Vision (OCR) via Vertex AI
 *
 * Provedor exclusivo: Vertex AI (Cloud Run ADC)
 *
 * Otimizações:
 * - Compressão de imagem via sharp (2048px, qualidade 92%)
 * - responseMimeType: "application/json" para Gemini
 * - Timeout unificado com AbortController
 * - Token cache do metadata server (3600s)
 * - Mapeamento de modelos obsoletos via VERTEX_MODEL_MAP
 */

import sharp from 'sharp';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { getModel } from '@/lib/zhipu-auth';

// ============================================
// CONFIGURAÇÃO PADRÃO
// ============================================

export const AI_TIMEOUT = 55000; // 55s
export const OCR_TIMEOUT = 30000; // 30s (OCR é rápido)
export const DEFAULT_MODEL = 'gemini-2.5-flash';

export const VERTEX_PROJECT = 'utopian-splicer-255210';
export const VERTEX_LOCATIONS = ['us-central1', 'southamerica-east1'];
// Regiões para chamadas de vision/OCR (multimodal) — southamerica-east1 NÃO suporta vision
export const VERTEX_LOCATIONS_VISION = ['us-central1'];

// ============================================
// MAPA DE MODELOS VERTEX
// ============================================

const VERTEX_MODEL_MAP: Record<string, string> = {
  'gemini-2.0-flash-001': 'gemini-2.5-flash',
  'gemini-2.5-flash-lite': 'gemini-2.5-flash',
  'gemini-3.1-flash': 'gemini-2.5-flash',
  'gemini-3.1-flash-lite': 'gemini-2.5-flash',
  'gemini-3.1-pro': 'gemini-2.5-pro',
  'gemini-3.5-flash': 'gemini-2.5-flash',
};

export function getVertexModel(model?: string | null): string {
  const name = model?.trim() || DEFAULT_MODEL;
  return VERTEX_MODEL_MAP[name] || name;
}

// ============================================
// COMPRESSÃO DE IMAGEM
// ============================================

/**
 * Detecta a região de interesse (ROI) — área do display LCD/LED na foto.
 * Displays têm alto contraste (dígito aceso vs fundo apagado) e ocupam
 * uma região retangular grande na foto.
 *
 * Algoritmo:
 * 1. Redimensiona para 200px (análise rápida)
 * 2. Converte para tons de cinza
 * 3. Calcula variância por linha (linhas com display têm alta variância)
 * 4. Encontra faixa vertical com maior variância concentrada
 * 5. Faz crop vertical (top/bottom) para focar no display
 *
 * Retorna { top, height } em proporção (0-1) ou null se não detectar.
 */
async function detectarROIDisplay(buffer: Buffer): Promise<{ top: number; height: number } | null> {
  try {
    const meta = await sharp(buffer).metadata();
    const origW = meta.width || 200;
    const origH = meta.height || 200;
    const scale = Math.min(1, 200 / Math.max(origW, origH));
    const w = Math.round(origW * scale);
    const h = Math.round(origH * scale);

    const { data: gray } = await sharp(buffer)
      .resize(w, h, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Calcular variância de cada linha horizontal
    const varianciaLinhas = new Float64Array(h);
    for (let y = 0; y < h; y++) {
      let sum = 0;
      const row = new Float64Array(w);
      for (let x = 0; x < w; x++) {
        row[x] = gray[y * w + x];
        sum += row[x];
      }
      const mean = sum / w;
      let varSum = 0;
      for (let x = 0; x < w; x++) {
        varSum += (row[x] - mean) ** 2;
      }
      varianciaLinhas[y] = varSum / w;
    }

    // Encontrar variância média
    let mediaVar = 0;
    for (let y = 0; y < h; y++) mediaVar += varianciaLinhas[y];
    mediaVar /= h;

    // Threshold: linhas com variância > 1.5x média são consideradas "display"
    const threshold = mediaVar * 1.5;

    // Encontrar maior faixa contínua de linhas "display"
    let melhorInicio = 0;
    let melhorTamanho = 0;
    let inicioAtual = -1;
    let tamanhoAtual = 0;

    for (let y = 0; y < h; y++) {
      if (varianciaLinhas[y] > threshold) {
        if (inicioAtual === -1) inicioAtual = y;
        tamanhoAtual++;
      } else {
        if (tamanhoAtual > melhorTamanho) {
          melhorTamanho = tamanhoAtual;
          melhorInicio = inicioAtual;
        }
        inicioAtual = -1;
        tamanhoAtual = 0;
      }
    }
    // Verificar última faixa
    if (tamanhoAtual > melhorTamanho) {
      melhorTamanho = tamanhoAtual;
      melhorInicio = inicioAtual;
    }

    // Só fazer crop se a faixa for significativa (≥30% da altura)
    if (melhorTamanho < h * 0.3) {
      console.log(`[ROI] Faixa de display muito pequena: ${melhorTamanho}/${h} — não farei crop`);
      return null;
    }

    // Adicionar margem de 15% em cima e embaixo para não cortar dígitos
    const margem = Math.round(melhorTamanho * 0.15);
    let top = Math.max(0, melhorInicio - margem);
    let bottom = Math.min(h, melhorInicio + melhorTamanho + margem);

    // Converter para proporção (0-1)
    const topProp = top / h;
    const heightProp = (bottom - top) / h;

    console.log(`[ROI] Display detectado: top=${(topProp * 100).toFixed(0)}% height=${(heightProp * 100).toFixed(0)}%`);
    return { top: topProp, height: heightProp };
  } catch (err) {
    console.warn('[ROI] Erro ao detectar display:', err);
    return null;
  }
}

/**
 * Avalia a nitidez da imagem usando Variância do Laplaciano.
 * 
 * Método padrão da literatura para detecção de blur/foco:
 * - Aplica kernel Laplaciano (segunda derivada) que destaca bordas
 * - Calcula a variância dos valores resultantes
 * - Imagens nítidas têm alta variância (muitas bordas acentuadas)
 * - Imagens borradas/tremidas têm baixa variância (bordas suavizadas)
 * 
 * Análise em 2 níveis:
 * 1. Global — variância média de toda a imagem
 * 2. Por região (grid 3x3) — detecta foco desigual
 * 
 * Retorna { global, regioesBorradas, totalRegioes, ilegivel, motivo }
 */
export async function avaliarNitidez(buffer: Buffer): Promise<{
  global: number;
  regioesBorradas: number;
  totalRegioes: number;
  ilegivel: boolean;
  motivo: string;
}> {
  try {
    // Redimensionar para análise (max 400px — literatura usa 200-500px)
    const meta = await sharp(buffer).metadata();
    const origW = meta.width || 400;
    const origH = meta.height || 400;
    const scale = Math.min(1, 400 / Math.max(origW, origH));
    const w = Math.round(origW * scale);
    const h = Math.round(origH * scale);

    // Obter pixels em tons de cinza (1 byte por pixel)
    const { data: gray } = await sharp(buffer)
      .resize(w, h, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // === ANÁLISE GLOBAL ===
    let sum = 0, sumSq = 0;
    const count = (w - 2) * (h - 2);
    const laplacian = new Float64Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        const val = 4 * gray[idx]
          - gray[idx - 1]
          - gray[idx + 1]
          - gray[idx - w]
          - gray[idx + w];
        laplacian[idx] = val;
        sum += val;
      }
    }
    const mean = sum / count;
    let variance = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        variance += (laplacian[y * w + x] - mean) ** 2;
      }
    }
    variance /= count;

    // === ANÁLISE POR REGIÃO (grid 3x3) ===
    // Detecta foco desigual — parte nítida, parte borrada
    const zoneW = Math.floor(w / 3);
    const zoneH = Math.floor(h / 3);
    const THRESHOLD_REGIAO = 80; // abaixo disso = borrada
    let regioesBorradas = 0;
    const totalRegioes = 9;

    for (let zy = 0; zy < 3; zy++) {
      for (let zx = 0; zx < 3; zx++) {
        let zSum = 0, zSq = 0, zCnt = 0;
        const x0 = zx * zoneW + 1;
        const x1 = Math.min((zx + 1) * zoneW, w - 1);
        const y0 = zy * zoneH + 1;
        const y1 = Math.min((zy + 1) * zoneH, h - 1);

        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const idx = y * w + x;
            zSum += laplacian[idx];
            zSq += laplacian[idx] * laplacian[idx];
            zCnt++;
          }
        }
        if (zCnt > 0) {
          const zMean = zSum / zCnt;
          const zVar = zSq / zCnt - zMean * zMean;
          if (zVar < THRESHOLD_REGIAO) regioesBorradas++;
        }
      }
    }

    // === DECISÃO ===
    // Thresholds calibrados:
    // - Global < 50: muito borrada (tremida/foco perdido) — recusa
    // - Regiões borradas >= 5 (de 9): foco desigual severo — recusa
    // - Global < 100 AND regiões borradas >= 3: levemente borrada mas
    //   com áreas suficientes afetadas — recusa
    const THRESHOLD_GLOBAL_BORRADA = 50;
    const THRESHOLD_REGIOES_CRITICO = 5;
    const THRESHOLD_REGIOES_MODERADO = 3;

    let ilegivel = false;
    let motivo = '';

    if (variance < THRESHOLD_GLOBAL_BORRADA) {
      ilegivel = true;
      motivo = `Foto ilegível — imagem muito borrada/tremida (nitidez global: ${variance.toFixed(0)})`;
    } else if (regioesBorradas >= THRESHOLD_REGIOES_CRITICO) {
      ilegivel = true;
      motivo = `Foto ilegível — foco desigual severo (${regioesBorradas}/${totalRegioes} regiões borradas)`;
    } else if (variance < 100 && regioesBorradas >= THRESHOLD_REGIOES_MODERADO) {
      ilegivel = true;
      motivo = `Foto ilegível — imagem parcialmente borrada (nitidez global: ${variance.toFixed(0)}, ${regioesBorradas}/${totalRegioes} regiões borradas)`;
    }

    console.log(`[NITIDEZ] Global: ${variance.toFixed(0)}, regiões borradas: ${regioesBorradas}/${totalRegioes}${ilegivel ? ' → ILEGÍVEL' : ' → OK'}`);

    return { global: variance, regioesBorradas, totalRegioes, ilegivel, motivo };
  } catch (err) {
    console.warn('[NITIDEZ] Erro ao avaliar nitidez:', err);
    return { global: 0, regioesBorradas: 0, totalRegioes: 0, ilegivel: false, motivo: '' };
  }
}

/**
 * Detecta o ângulo de inclinação (skew) da imagem usando projection profile
 * com gradiente horizontal (Sobel).
 *
 * Melhorias vs versão anterior:
 * - Usa gradiente horizontal (Sobel) em vez de pixels brutos — mais robusto
 *   para detectar bordas de texto/dígitos (display LCD/LED)
 * - Resolução maior (600px em vez de 400px) — mais precisão
 * - Refinamento em 3 níveis: 1° → 0.5° → 0.25° (era só 2 níveis)
 * - Threshold de 1° para 0.5° (corrige inclinações leves)
 * - Usa coeficiente de variação (CV = std/mean) em vez de variância absoluta
 *   — mais robusto a diferenças de brilho (backlight desigual)
 *
 * Retorna o ângulo em graus (0 se não detectar).
 */
async function detectarSkew(buffer: Buffer): Promise<number> {
  try {
    // Redimensionar para análise (max 600px — mais resolução = mais precisão)
    const meta = await sharp(buffer).metadata();
    const origW = meta.width || 600;
    const origH = meta.height || 600;
    const scale = Math.min(1, 600 / Math.max(origW, origH));
    const w = Math.round(origW * scale);
    const h = Math.round(origH * scale);

    // Obter pixels em tons de cinza (1 byte por pixel)
    const { data: gray } = await sharp(buffer)
      .resize(w, h, { fit: 'fill' })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // === Pré-computar gradiente horizontal (Sobel X) ===
    // Bordas verticais (gradiente X forte) são ideais para projection profile
    // — linhas de texto têm muitas bordas verticais que ficam alinhadas quando
    // a imagem está reta. Se inclinada, as bordas ficam espalhadas entre linhas.
    const gradX = new Float64Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = y * w + x;
        // Sobel X: [-1 0 1; -2 0 2; -1 0 1]
        const val = -gray[idx - w - 1] - 2 * gray[idx - 1] - gray[idx + w - 1]
                  + gray[idx - w + 1] + 2 * gray[idx + 1] + gray[idx + w + 1];
        gradX[idx] = Math.abs(val);
      }
    }

    // Função helper: medir qualidade do alinhamento em um ângulo
    // Usa coeficiente de variação (CV = std/mean) — robusto a brilho desigual
    const medirAlinhamento = (angulo: number): number => {
      const rad = angulo * Math.PI / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const cx = w / 2;
      const cy = h / 2;

      // Para cada linha y, somar os gradientes dos pixels dessa linha
      const somaLinhas = new Float64Array(h);
      for (let y = 0; y < h; y++) {
        let soma = 0;
        for (let x = 0; x < w; x++) {
          // Rotacionar ponto de volta para a imagem original
          const rx = Math.round((x - cx) * cos + (y - cy) * sin + cx);
          const ry = Math.round(-(x - cx) * sin + (y - cy) * cos + cy);
          if (rx >= 0 && rx < w && ry >= 0 && ry < h) {
            soma += gradX[ry * w + rx];
          }
        }
        somaLinhas[y] = soma;
      }

      // Calcular coeficiente de variação (std/mean) — maior = mais alinhado
      let sum = 0;
      for (let y = 0; y < h; y++) sum += somaLinhas[y];
      const mean = sum / h;
      if (mean < 1e-6) return 0; // evita divisão por zero
      let sqSum = 0;
      for (let y = 0; y < h; y++) {
        sqSum += (somaLinhas[y] - mean) ** 2;
      }
      const std = Math.sqrt(sqSum / h);
      return std / mean; // CV
    };

    // === Nível 1: teste de -10 a +10 graus (passo 1°) ===
    let melhorAngulo = 0;
    let melhorCV = medirAlinhamento(0);

    for (let angulo = -10; angulo <= 10; angulo++) {
      if (angulo === 0) continue; // já testado
      const cv = medirAlinhamento(angulo);
      if (cv > melhorCV) {
        melhorCV = cv;
        melhorAngulo = angulo;
      }
    }

    // === Nível 2: refinar com passo de 0.5° perto do melhor ângulo ===
    for (let angulo = melhorAngulo - 1; angulo <= melhorAngulo + 1; angulo += 0.5) {
      if (angulo === melhorAngulo) continue;
      const cv = medirAlinhamento(angulo);
      if (cv > melhorCV) {
        melhorCV = cv;
        melhorAngulo = angulo;
      }
    }

    // === Nível 3: refinar com passo de 0.25° (alta precisão) ===
    for (let angulo = melhorAngulo - 0.5; angulo <= melhorAngulo + 0.5; angulo += 0.25) {
      if (angulo === melhorAngulo) continue;
      const cv = medirAlinhamento(angulo);
      if (cv > melhorCV) {
        melhorCV = cv;
        melhorAngulo = angulo;
      }
    }

    // Arredondar para 2 casas decimais
    melhorAngulo = Math.round(melhorAngulo * 100) / 100;

    console.log(`[Deskew-backend] Ângulo detectado: ${melhorAngulo}° (CV=${melhorCV.toFixed(4)})`);
    return melhorAngulo;
  } catch (err) {
    console.warn('[Deskew-backend] Erro ao detectar skew:', err);
    return 0;
  }
}

/**
 * Comprime e melhora a imagem para OCR (2048px, JPEG 85%).
 *
 * Otimizado para telas LCD/LED — pipeline enxuto pois fotos borradas
 * já são rejeitadas por avaliarNitidez() antes de chegar aqui.
 *
 * - Deskew automático (corrige inclinação de -10 a +10 graus)
 * - Upscale para 2048px (suficiente para texto renderizado em LCD/LED)
 * - Kernel lanczos3 (preserva bordas de texto)
 * - Normalise (estica histograma para contraste máximo)
 * - Modulate: saturação +30% (realça telas coloridas)
 * - Sharpen leve (fotos nítidas já têm bordas boas)
 * - JPEG 85 (fotos nítidas toleram mais compressão)
 *
 * Benchmark: ~450ms vs ~1574ms do pipeline anterior (3,5x mais rápido)
 */
export async function compressImage(base64DataUrl: string): Promise<string> {
  try {
    const matches = base64DataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) return base64DataUrl;

    const buffer = Buffer.from(matches[2], 'base64');
    const inputSize = buffer.length;

    // 1. Detectar e corrigir inclinação (deskew) — ANTES das outras melhorias
    let bufferProcessado = buffer;
    try {
      const anguloSkew = await detectarSkew(buffer);
      if (Math.abs(anguloSkew) >= 0.5) {
        console.log(`[COMPRESS] Deskew: corrigindo ${anguloSkew}° de inclinação`);
        bufferProcessado = await sharp(buffer)
          .rotate(anguloSkew, { background: '#ffffff' })
          .toBuffer();
      } else {
        console.log(`[COMPRESS] Deskew: ângulo ${anguloSkew}° — muito pequeno (< 0.5°), não precisa corrigir`);
      }
    } catch (err) {
      console.warn('[COMPRESS] Deskew falhou, usando imagem original:', err);
    }

    // 2. Detectar ROI (região do display) e fazer crop vertical
    // Aumenta resolução efetiva dos dígitos — crítico para diferenciar 0 de 8
    try {
      const roi = await detectarROIDisplay(bufferProcessado);
      if (roi) {
        const meta = await sharp(bufferProcessado).metadata();
        const cropTop = Math.floor(meta.height * roi.top);
        const cropHeight = Math.floor(meta.height * roi.height);
        if (cropHeight > 0 && cropTop >= 0 && cropTop + cropHeight <= meta.height) {
          console.log(`[COMPRESS] Crop ROI: top=${cropTop} height=${cropHeight} (de ${meta.height})`);
          bufferProcessado = await sharp(bufferProcessado)
            .extract({ left: 0, top: cropTop, width: meta.width, height: cropHeight })
            .toBuffer();
        }
      }
    } catch (err) {
      console.warn('[COMPRESS] Crop ROI falhou, usando imagem completa:', err);
    }

    // 3. Pipeline enxuto — fotos nítidas não precisam de median/sharpen forte
    const compressed = await sharp(bufferProcessado)
      // Remove canal alpha (se houver) e converte para RGB consistente
      .removeAlpha()
      // Upscale para 2048px (após crop, dígitos ficam com resolução maior)
      // Kernel lanczos3 preserva bordas de texto
      .resize(2048, 2048, { fit: 'inside', kernel: 'lanczos3' })
      // Normaliza contraste (estica histograma) — realça texto LCD/LED
      .normalise()
      // Aumenta saturação em 30% — realça telas coloridas
      .modulate({ saturation: 1.3 })
      // Sharpen LEVE — fotos nítidas já têm bordas boas, só realça levemente
      .sharpen({ sigma: 1.0, m1: 0.5, m2: 0.3 })
      // JPEG 85 — fotos nítidas toleram mais compressão
      // chromaSubsampling 4:4:4 preserva crominância (importante para telas coloridas)
      .jpeg({ quality: 85, chromaSubsampling: '4:4:4' })
      .toBuffer();

    const outputSize = compressed.length;
    const reduction = inputSize > 0
      ? ((1 - outputSize / inputSize) * 100).toFixed(0)
      : '0';
    console.log(`[COMPRESS] ${inputSize} -> ${outputSize} bytes (${reduction}% redução, deskew + upscale 2048 lanczos3 + normalise + saturação + sharpen leve + JPEG 85)`);

    return `data:image/jpeg;base64,${compressed.toString('base64')}`;
  } catch (err) {
    console.warn('[COMPRESS] Falha ao processar, enviando original:', err);
    return base64DataUrl;
  }
}

/**
 * Comprime imagem para OCR com pipeline AGRESSIVO — para foto individual.
 *
 * Mais lento mas mais preciso — usado quando o usuário processa uma foto
 * de cada vez (não em lote). Resolução maior e sharpen mais forte para
 * diferenciar dígitos ambíguos (0 vs 8, 3 vs 8, 5 vs 6).
 *
 * - Deskew automático (threshold 0.5°)
 * - Sem crop ROI (usa imagem completa para não perder contexto)
 * - Upscale 2560px (vs 2048px do rápido)
 * - Kernel lanczos3
 * - Normalise + saturação +30%
 * - Median filter 3x3 (remove ruído)
 * - Sharpen FORTE (sigma 1.5 vs 1.0)
 * - JPEG 95 (vs 85)
 */
export async function compressImageAgressiva(base64DataUrl: string): Promise<string> {
  try {
    const matches = base64DataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!matches) return base64DataUrl;

    const buffer = Buffer.from(matches[2], 'base64');
    const inputSize = buffer.length;

    // 1. Deskew
    let bufferProcessado = buffer;
    try {
      const anguloSkew = await detectarSkew(buffer);
      if (Math.abs(anguloSkew) >= 0.5) {
        console.log(`[COMPRESS-AGRESSIVO] Deskew: ${anguloSkew}°`);
        bufferProcessado = await sharp(buffer)
          .rotate(anguloSkew, { background: '#ffffff' })
          .toBuffer();
      }
    } catch (err) {
      console.warn('[COMPRESS-AGRESSIVO] Deskew falhou:', err);
    }

    // 2. Pipeline agressivo — máxima qualidade para diferenciar dígitos
    const compressed = await sharp(bufferProcessado)
      .removeAlpha()
      // Upscale 2560px — mais resolução que 2048px
      .resize(2560, 2560, { fit: 'inside', kernel: 'lanczos3' })
      .normalise()
      .modulate({ saturation: 1.3 })
      // Median filter — remove ruído de sensor
      .median(3)
      // Sharpen FORTE — realça bordas de dígitos ambíguos
      .sharpen({ sigma: 1.5, m1: 1.0, m2: 0.8 })
      // JPEG 95 — mínima compressão
      .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
      .toBuffer();

    const outputSize = compressed.length;
    const reduction = inputSize > 0
      ? ((1 - outputSize / inputSize) * 100).toFixed(0)
      : '0';
    console.log(`[COMPRESS-AGRESSIVO] ${inputSize} -> ${outputSize} bytes (${reduction}% redução, deskew + 2560px + median + sharpen forte + JPEG 95)`);

    return `data:image/jpeg;base64,${compressed.toString('base64')}`;
  } catch (err) {
    console.warn('[COMPRESS-AGRESSIVO] Falha, usando original:', err);
    return base64DataUrl;
  }
}

// ============================================
// VERTEX AI — TOKEN DO METADATA SERVER / SA JSON
// ============================================

let _vertexTokenCache: { token: string; expiresAt: number } | null = null;
let _vertexTokenFetching: Promise<string | null> | null = null;

let _saCredentials: any = null;

/**
 * Retorna as credenciais da Service Account, se configuradas via
 * GOOGLE_APPLICATION_CREDENTIALS_JSON (string JSON completa).
 * Esse é o caminho recomendado para rodar fora do Cloud Run (ex: Vercel).
 */
function getServiceAccountCredentials(): any | null {
  if (_saCredentials) return _saCredentials;
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) return null;
  try {
    _saCredentials = JSON.parse(raw);
    return _saCredentials;
  } catch {
    console.warn('[VERTEX] GOOGLE_APPLICATION_CREDENTIALS_JSON inválido (JSON malformado)');
    _saCredentials = null;
    return null;
  }
}

function base64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Troca um JWT assinado com a private key da SA por um access_token OAuth2.
 * Equivalente ao que google-auth-library faz internamente, mas sem dependência extra.
 */
async function getAccessTokenFromServiceAccount(): Promise<string | null> {
  const sa = getServiceAccountCredentials();
  if (!sa || !sa.private_key || !sa.client_email) return null;

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const header = { alg: 'RS256', typ: 'JWT', kid: sa.private_key_id };
  const encodedHeader = base64url(Buffer.from(JSON.stringify(header)));
  const encodedPayload = base64url(Buffer.from(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(sa.private_key, 'base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const assertion = `${signingInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '<no body>');
    console.warn('[VERTEX] Falha ao obter token via SA JSON:', res.status, text);
    return null;
  }

  const data = await res.json() as { access_token?: string; expires_in?: number };
  return data.access_token ?? null;
}

export async function getVertexAccessToken(): Promise<string | null> {
  if (_vertexTokenCache && Date.now() < _vertexTokenCache.expiresAt) {
    return _vertexTokenCache.token;
  }

  if (_vertexTokenFetching) {
    return _vertexTokenFetching;
  }

  _vertexTokenFetching = (async () => {
    try {
      // 1) Prioriza SA JSON quando configurada (caminho para Vercel/produção fora do Cloud Run)
      const saToken = await getAccessTokenFromServiceAccount();
      if (saToken) {
        _vertexTokenCache = {
          token: saToken,
          expiresAt: Date.now() + 55 * 60 * 1000, // 55min (token OAuth2 dura 1h)
        };
        return saToken;
      }

      // 2) Fallback: metadata server (funciona em Cloud Run / GCE / GKE)
      const res = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
        headers: { 'Metadata-Flavor': 'Google' },
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        console.warn('[VERTEX] Metadata server indisponivel e SA JSON nao configurada. Configure GOOGLE_APPLICATION_CREDENTIALS_JSON para usar IA no Vercel.');
        return null;
      }

      const data = await res.json();
      const token = data.access_token;
      const expiresIn = (data.expires_in || 3600) * 1000;

      _vertexTokenCache = {
        token,
        expiresAt: Date.now() + expiresIn - 60_000,
      };

      return token;
    } catch {
      console.warn('[VERTEX] Nao foi possivel obter token (metadata server e SA JSON falharam)');
      return null;
    } finally {
      _vertexTokenFetching = null;
    }
  })();

  return _vertexTokenFetching;
}

// ============================================
// VERTEX AI — CHAMADA POR REGIÃO
// ============================================

export async function tryVertexAIRegion(
  region: string,
  accessToken: string,
  model: string,
  contents: any[],
  generationConfig: Record<string, any>,
  signal: AbortSignal,
): Promise<{ content: string } | null> {
  const url = `https://${region}-aiplatform.googleapis.com/v1/projects/${VERTEX_PROJECT}/locations/${region}/publishers/google/models/${model}:generateContent`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ contents, generationConfig }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`[VERTEX ${region}] Erro ${response.status} modelo ${model}: ${errText.substring(0, 300)}`);
      return null;
    }

    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const finishReason = data?.candidates?.[0]?.finishReason;

    if (content) {
      if (finishReason === 'MAX_TOKENS') {
        console.warn(`[VERTEX ${region}] Resposta TRUNCADA (MAX_TOKENS) — content.length=${content.length}, modelo=${model}`);
      }
      console.log(`[VERTEX ${region}] Sucesso com modelo ${model} (finish: ${finishReason || 'ok'}, ${content.length} chars)`);
      return { content };
    }

    console.warn(`[VERTEX ${region}] Resposta vazia — finishReason: ${finishReason}`);
    return null;
  } catch (err: any) {
    if (err.name === 'AbortError') throw err;
    console.warn(`[VERTEX ${region}] Falha: ${err.message}`);
    return null;
  }
}

// ============================================
// OPÇÕES DE CHAMADA
// ============================================

export interface CallAIOptions {
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
  jsonMode?: boolean;
  agressivo?: boolean; // true = pipeline agressivo (2560px/JPEG95/sharpen forte)
}

// ============================================
// CHAMADA ÚNICA À IA (Vertex AI) — VISION/OCR
// ============================================

/**
 * Chama GLM-4.6v via z-ai-web-dev-sdk — alternativa ao Gemini.
 * Usa o mesmo pipeline de compressão (agressivo ou rápido).
 * 
 * Retorna { content: string } (mesmo formato do callAI).
 */
export async function callAIGLM(
  prompt: string,
  imagem: string,
  options: CallAIOptions = {}
): Promise<{ content: string }> {
  const { agressivo = false } = options;

  // Pipeline de compressão (mesmo do callAI)
  const compressedImage = agressivo
    ? await compressImageAgressiva(imagem)
    : await compressImage(imagem);

  console.log(`[GLM-4.6v] Imagem processada (${agressivo ? 'agressivo' : 'rápido'}): ${(compressedImage.length / 1024).toFixed(0)} KB`);

  // Criar config dinamicamente a partir de variáveis de ambiente
  // (SDK z-ai-web-dev-sdk lê de arquivo .z-ai-config, mas na Vercel não temos acesso)
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  
  const config = {
    baseUrl: process.env.Z_AI_BASE_URL || 'https://internal-api.z.ai/v1',
    apiKey: process.env.Z_AI_API_KEY || 'Z.ai',
    token: process.env.Z_AI_TOKEN || '',
    chatId: process.env.Z_AI_CHAT_ID || `chat-${Date.now()}`,
    userId: process.env.Z_AI_USER_ID || 'caixafacil',
  };
  
  // Escrever config temporário no home dir (SDK procura lá)
  const configPath = path.join(os.homedir(), '.z-ai-config');
  try {
    fs.writeFileSync(configPath, JSON.stringify(config));
    console.log(`[GLM-4.6v] Config escrito em ${configPath}`);
  } catch (err) {
    console.warn('[GLM-4.6v] Erro ao escrever config:', err);
  }

  // Import dinâmico para evitar carregar SDK se não usado
  const ZAI = (await import('z-ai-web-dev-sdk')).default;
  const zai = await ZAI.create();

  const response = await zai.chat.completions.createVision({
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: compressedImage } },
        ],
      },
    ],
    thinking: { type: 'disabled' },
  });

  const content = response.choices?.[0]?.message?.content || '';
  console.log(`[GLM-4.6v] Resposta recebida (${content.length} chars)`);

  if (!content) {
    throw new Error('GLM-4.6v retornou resposta vazia');
  }

  return { content };
}

export async function callAI(
  prompt: string,
  imagem: string,
  model: string,
  options: CallAIOptions = {}
): Promise<{ content: string }> {
  const {
    temperature = 0.1,
    maxTokens = 4096,
    timeout = AI_TIMEOUT,
    jsonMode = true,
    agressivo = false,
  } = options;

  const resolvedModel = getVertexModel(model);
  // Pipeline agressivo (2560px/JPEG95/sharpen forte) para foto individual
  // Pipeline rápido (2048px/JPEG85/sharpen leve) para lote
  const compressedImage = agressivo
    ? await compressImageAgressiva(imagem)
    : await compressImage(imagem);
  const base64Data = compressedImage.split(',')[1];
  const mimeType = compressedImage.split(';')[0].split(':')[1];

  const generationConfig: Record<string, any> = {
    temperature,
    maxOutputTokens: maxTokens,
  };
  if (jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }

  const contents = [{
    role: 'user',
    parts: [
      { text: prompt },
      { inline_data: { mime_type: mimeType, data: base64Data } },
    ],
  }];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const vertexToken = await getVertexAccessToken();
    if (!vertexToken) {
      throw new Error('Vertex AI indisponivel: nao foi possivel obter token do metadata server.');
    }

    let lastError: string | null = null;

    for (const region of VERTEX_LOCATIONS_VISION) {
      const result = await tryVertexAIRegion(
        region, vertexToken, resolvedModel, contents, generationConfig, controller.signal
      );
      if (result) {
        return { content: result.content };
      }
      lastError = `[VERTEX ${region}] Falhou`;
    }

    throw new Error(`Vertex AI falhou em todas as regioes (${VERTEX_LOCATIONS_VISION.join(', ')}). Ultimo erro: ${lastError}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================
// CHAMADA COM MÚLTIPLAS IMAGENS (Vertex AI) — VISION/OCR
// ============================================

export async function callAIMultiImage(
  systemPrompt: string,
  userPrompt: string,
  images: Array<{ base64: string; mimeType?: string }>,
  model: string,
  options: CallAIOptions = {}
): Promise<{ content: string }> {
  const {
    temperature = 0,
    maxTokens = 1024,
    timeout = OCR_TIMEOUT,
    jsonMode = true,
  } = options;

  const resolvedModel = getVertexModel(model);

  const compressedImages = await Promise.all(
    images.map(async (img) => {
      const dataUrl = `data:${img.mimeType || 'image/jpeg'};base64,${img.base64}`;
      const compressed = await compressImage(dataUrl);
      const parts = compressed.split(',');
      return {
        base64: parts[1] || img.base64,
        mimeType: 'image/jpeg',
      };
    })
  );

  const generationConfig: Record<string, any> = {
    temperature,
    maxOutputTokens: maxTokens,
  };
  if (jsonMode) {
    generationConfig.responseMimeType = 'application/json';
  }

  const contents = [{
    role: 'user',
    parts: [
      { text: systemPrompt + '\n\n' + userPrompt },
      ...compressedImages.map(img => ({
        inline_data: { mime_type: img.mimeType, data: img.base64 },
      })),
    ],
  }];

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const vertexToken = await getVertexAccessToken();
    if (!vertexToken) {
      throw new Error('Vertex AI indisponivel: nao foi possivel obter token do metadata server.');
    }

    let lastError: string | null = null;

    for (const region of VERTEX_LOCATIONS_VISION) {
      const result = await tryVertexAIRegion(
        region, vertexToken, resolvedModel, contents, generationConfig, controller.signal
      );
      if (result) {
        return { content: result.content };
      }
      lastError = `[VERTEX ${region}] Falhou`;
    }

    throw new Error(`Vertex AI falhou em todas as regioes (${VERTEX_LOCATIONS_VISION.join(', ')}). Ultimo erro: ${lastError}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================
// CARREGAR CONFIGURAÇÃO DE IA
// ============================================

let _aiConfigCache: { model: string; ts: number } | null = null;
const AI_CONFIG_TTL = 60_000;

export async function loadAIConfig(fallbackModel?: string) {
  const now = Date.now();

  if (_aiConfigCache && now - _aiConfigCache.ts < AI_CONFIG_TTL) {
    return { llmModel: getModel(fallbackModel, _aiConfigCache.model) };
  }

  let llmModel = getModel(fallbackModel);

  try {
    const configRows = await db.$queryRawUnsafe(
      `SELECT "llmModel" FROM "config_saas" LIMIT 1`
    ) as any[];
    const config = configRows?.[0];

    if (config?.llmModel?.trim()) {
      llmModel = getModel(fallbackModel, config.llmModel?.trim());
      _aiConfigCache = { model: config.llmModel?.trim() || '', ts: now };
    }
  } catch {
    // Usa valores padrao
  }

  return { llmModel };
}

// ============================================
// UTILITÁRIO: EXTRAÇÃO ROBUSTA DE JSON
// ============================================

/**
 * Extrai um objeto JSON de texto que pode conter markdown, texto prefixo ou JSON truncado.
 * Usa balanceamento de chaves (funciona com qualquer nível de aninhamento).
 */
export function extractJSON<T = any>(content: string): { parsed: T | null; raw: string } {
  if (!content || content.trim().length === 0) {
    return { parsed: null, raw: '' };
  }

  let clean = content
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .trim();

  const firstBrace = clean.indexOf('{');
  if (firstBrace === -1) {
    return { parsed: null, raw: content };
  }

  clean = clean.substring(firstBrace);

  // Balanceamento de chaves
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];

    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;

    if (ch === '{') depth++;
    if (ch === '}') depth--;

    if (depth === 0) {
      end = i + 1;
      break;
    }
  }

  const jsonStr = end > 0 ? clean.substring(0, end) : clean;

  try {
    return { parsed: JSON.parse(jsonStr), raw: jsonStr };
  } catch {
    const match = content.match(/\{[^{}]*\}/);
    if (match) {
      try {
        return { parsed: JSON.parse(match[0]), raw: match[0] };
      } catch {
        // Falhou
      }
    }
    return { parsed: null, raw: jsonStr };
  }
}
