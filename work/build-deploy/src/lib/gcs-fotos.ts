/**
 * gcs-fotos.ts — Upload/download de fotos de leitura criptografadas no GCS
 *
 * Fluxo:
 *   1. Coleta fotos processadas (base64) de cada máquina
 *   2. Empacota em JSON, comprime com zlib, criptografa com AES-256-GCM
 *   3. Upload para GCS: leitura-fotos/{empresaId}/{ano-mes}/{batchId}.enc
 *   4. Para 2a via: download, descriptografa, descomprime, retorna fotos
 *   5. Cleanup: deleta blobs com mais de 30 dias
 *
 * Env vars necessárias:
 *   FOTO_ENCRYPTION_KEY — chave AES-256 (32 bytes hex, ex: "0123...1f")
 *   FOTO_BUCKET         — nome do bucket GCS (default: caixafacil-leitura-fotos)
 *   GOOGLE_APPLICATION_CREDENTIALS_JSON — (Vercel/produção fora do Cloud Run)
 *                                        Service Account JSON completa para
 *                                        autenticar no GCS via OAuth2 JWT
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { deflateSync, inflateSync } from 'zlib';
import * as crypto from 'crypto';

// ── Config ──────────────────────────────────────────────────────────────────
const BUCKET = process.env.FOTO_BUCKET || 'caixafacil-leitura-fotos';
const PREFIX = 'leitura-fotos';
const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;       // 256 bits
const IV_LEN = 12;        // 96 bits (recomendado para GCM)
const AUTH_TAG_LEN = 16;   // 128 bits

function getEncryptionKey(): Buffer {
  const hex = process.env.FOTO_ENCRYPTION_KEY;
  if (!hex || hex.length !== KEY_LEN * 2) {
    throw new Error(
      `FOTO_ENCRYPTION_KEY ausente ou inválida. Necessário ${KEY_LEN * 2} chars hex.`
    );
  }
  return Buffer.from(hex, 'hex');
}

// ── Token GCS: SA JSON (Vercel) com fallback para metadata server (Cloud Run) ─

let _gcsTokenCache: { token: string; expiresAt: number } | null = null;
let _gcsTokenFetching: Promise<string | null> | null = null;
let _gcsSaCredentials: any = null;

function getGcsServiceAccount(): any | null {
  if (_gcsSaCredentials) return _gcsSaCredentials;
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!raw) return null;
  try {
    _gcsSaCredentials = JSON.parse(raw);
    return _gcsSaCredentials;
  } catch {
    console.warn('[GCS-FOTOS] GOOGLE_APPLICATION_CREDENTIALS_JSON inválido');
    _gcsSaCredentials = null;
    return null;
  }
}

function b64url(buf: Buffer): string {
  return buf.toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

async function getGcsAccessTokenFromSA(): Promise<string | null> {
  const sa = getGcsServiceAccount();
  if (!sa || !sa.private_key || !sa.client_email) return null;

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/devstorage.read_write',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const header = { alg: 'RS256', typ: 'JWT', kid: sa.private_key_id };

  const encodedHeader = b64url(Buffer.from(JSON.stringify(header)));
  const encodedPayload = b64url(Buffer.from(JSON.stringify(payload)));
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
    console.warn('[GCS-FOTOS] Falha ao obter token via SA JSON:', res.status, text);
    return null;
  }
  const data = await res.json() as { access_token?: string };
  return data.access_token ?? null;
}

/**
 * Obtém access token para o GCS.
 * 1) Prioriza SA JSON (GOOGLE_APPLICATION_CREDENTIALS_JSON) — funciona no Vercel
 * 2) Fallback: metadata server (Cloud Run / GCE)
 */
export async function getGcsAccessToken(): Promise<string> {
  // Cache token por 55 min (token OAuth2 dura 1h)
  if (_gcsTokenCache && Date.now() < _gcsTokenCache.expiresAt) {
    return _gcsTokenCache.token;
  }

  // Se já existe uma requisição em andamento, aguarda ela
  if (_gcsTokenFetching) {
    return _gcsTokenFetching;
  }

  _gcsTokenFetching = (async () => {
    try {
      // 1) SA JSON (Vercel/produção fora do Cloud Run)
      const saToken = await getGcsAccessTokenFromSA();
      if (saToken) {
        _gcsTokenCache = {
          token: saToken,
          expiresAt: Date.now() + 55 * 60 * 1000,
        };
        return saToken;
      }

      // 2) Metadata server (Cloud Run / GCE)
      const res = await fetch(
        'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
        {
          headers: { 'Metadata-Flavor': 'Google' },
          signal: AbortSignal.timeout(5000),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const token = data.access_token as string;
        const expiresIn = (data.expires_in || 3600) * 1000;
        _gcsTokenCache = {
          token,
          expiresAt: Date.now() + expiresIn - 60_000,
        };
        return token;
      }

      throw new Error('Metadata server indisponível e SA JSON não configurada. Configure GOOGLE_APPLICATION_CREDENTIALS_JSON para usar GCS no Vercel.');
    } finally {
      _gcsTokenFetching = null;
    }
  })();

  return _gcsTokenFetching as Promise<string>;
}

// ── GCS REST helpers ─────────────────────────────────────────────────────

async function gcsUpload(bucket: string, objectName: string, data: Buffer): Promise<void> {
  const token = await getGcsAccessToken();
  console.log(`[GCS-UPLOAD] Iniciando upload: ${objectName} (${(data.length / 1024).toFixed(0)}KB)`);
  const res = await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(objectName)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
      },
      body: data,
      signal: AbortSignal.timeout(30000), // 30s timeout
    }
  );
  if (!res.ok) {
    const text = await res.text();
    console.error(`[GCS-UPLOAD] Falhou (${res.status}): ${text.substring(0, 500)}`);
    throw new Error(`GCS upload falhou (${res.status}): ${text}`);
  }
  console.log(`[GCS-UPLOAD] Sucesso: ${objectName}`);
}

async function gcsDownload(bucket: string, objectName: string): Promise<Buffer> {
  const token = await getGcsAccessToken();
  const res = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(objectName)}?alt=media`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GCS download falhou (${res.status}): ${text}`);
  }
  const arrayBuf = await res.arrayBuffer();
  return Buffer.from(arrayBuf);
}

async function gcsDelete(bucket: string, objectName: string): Promise<void> {
  const token = await getGcsAccessToken();
  const res = await fetch(
    `https://storage.googleapis.com/storage/v1/b/${bucket}/o/${encodeURIComponent(objectName)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
  // 404 é ok — arquivo já não existe
  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`GCS delete falhou (${res.status}): ${text}`);
  }
}

async function gcsListPrefix(bucket: string, prefix: string): Promise<string[]> {
  const token = await getGcsAccessToken();
  const items: string[] = [];
  let pageToken: string | undefined;

  do {
    const url = `https://storage.googleapis.com/storage/v1/b/${bucket}/o?prefix=${encodeURIComponent(prefix)}&maxResults=500${pageToken ? `&pageToken=${pageToken}` : ''}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`GCS list falhou (${res.status})`);
    const data = await res.json();
    for (const item of data.items || []) {
      items.push(item.name as string);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  return items;
}

// ── Criptografia ───────────────────────────────────────────────────────────
// Formato do blob criptografado: [IV (12 bytes)] [Auth Tag (16 bytes)] [Ciphertext]

function encrypt(plaintext: Buffer, key: Buffer): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LEN });
  const encrypted = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Layout: IV || AuthTag || Ciphertext
  return Buffer.concat([iv, authTag, encrypted]);
}

function decrypt(blob: Buffer, key: Buffer): Buffer {
  const iv = blob.subarray(0, IV_LEN);
  const authTag = blob.subarray(IV_LEN, IV_LEN + AUTH_TAG_LEN);
  const ciphertext = blob.subarray(IV_LEN + AUTH_TAG_LEN);

  const decipher = createDecipheriv(ALGO, key, iv, { authTagLength: AUTH_TAG_LEN });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// ── Interface pública ──────────────────────────────────────────────────────

export interface FotoItem {
  /** ID da máquina */
  maquinaId: string;
  /** Código da máquina (para referência) */
  codigo: string;
  /** Foto processada em base64 (data:image/jpeg;base64,...) */
  fotoBase64: string;
}

export interface FotosBatch {
  /** Caminho GCS do pacote */
  gcsPath: string;
  /** Batch ID (para referência) */
  batchId: string;
}

/**
 * Comprime, criptografa e faz upload das fotos para o GCS.
 * Retorna o caminho GCS e o batch ID.
 */
export async function uploadFotosLeitura(
  empresaId: string,
  clienteId: string,
  fotos: FotoItem[]
): Promise<FotosBatch> {
  if (!fotos || fotos.length === 0) {
    throw new Error('Nenhuma foto fornecida');
  }

  const key = getEncryptionKey();
  const batchId = `${Date.now()}-${randomBytes(4).toString('hex')}`;

  // Agrupar por ano-mês
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Montar pacote JSON — remove prefix "data:image/...;base64," para economizar espaço
  const packageData = {
    batchId,
    empresaId,
    clienteId,
    timestamp: now.toISOString(),
    fotos: fotos.map(f => ({
      maquinaId: f.maquinaId,
      codigo: f.codigo,
      foto: f.fotoBase64.replace(/^data:image\/[a-z]+;base64,/, ''),
    })),
  };

  const jsonStr = JSON.stringify(packageData);
  const jsonBuf = Buffer.from(jsonStr, 'utf-8');

  // Comprimir com zlib
  const compressed = deflateSync(jsonBuf, { level: 9 });

  // Criptografar
  const encrypted = encrypt(compressed, key);

  // Log de tamanhos para diagnóstico
  console.log(`[GCS-FOTOS] ${fotos.length} fotos | JSON: ${(jsonBuf.length / 1024 / 1024).toFixed(1)}MB | Comprimido: ${(compressed.length / 1024 / 1024).toFixed(1)}MB | Criptografado: ${(encrypted.length / 1024 / 1024).toFixed(1)}MB`);

  // Caminho GCS
  const objectName = `${PREFIX}/${empresaId}/${ym}/${batchId}.enc`;

  // Upload
  await gcsUpload(BUCKET, objectName, encrypted);

  return { gcsPath: objectName, batchId };
}

/**
 * Baixa, descriptografa e descomprime o pacote de fotos do GCS.
 * Retorna as fotos como array de FotoItem.
 */
export async function downloadFotosLeitura(gcsPath: string): Promise<FotoItem[]> {
  const key = getEncryptionKey();

  // Download
  const encrypted = await gcsDownload(BUCKET, gcsPath);

  // Descriptografar
  const compressed = decrypt(encrypted, key);

  // Descomprimir
  const jsonBuf = inflateSync(compressed);
  const packageData = JSON.parse(jsonBuf.toString('utf-8'));

  // Restaurar prefix base64
  return packageData.fotos.map((f: any) => ({
    maquinaId: f.maquinaId,
    codigo: f.codigo,
    fotoBase64: `data:image/jpeg;base64,${f.foto}`,
  }));
}

/**
 * Verifica se o pacote existe no GCS (HEAD request).
 */
export async function fotosExistem(gcsPath: string): Promise<boolean> {
  try {
    const token = await getGcsAccessToken();
    const res = await fetch(
      `https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(gcsPath)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Sanitização: deleta pacotes de fotos com mais de `maxAgeDays` dias.
 * Retorna a lista de caminhos deletados e os erros.
 */
export async function cleanupFotosAntigas(maxAgeDays: number = 30): Promise<{
  deletados: string[];
  erros: { path: string; erro: string }[];
}> {
  const deletados: string[] = [];
  const erros: { path: string; erro: string }[] = [];

  try {
    // Listar todos os objetos com o prefixo
    const objects = await gcsListPrefix(BUCKET, PREFIX);

    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

    for (const objName of objects) {
      try {
        // O nome tem timestamp no batchId: {timestamp}-{hex}.enc
        // Extrair timestamp do nome do objeto
        const parts = objName.split('/');
        const fileName = parts[parts.length - 1]; // batchId.enc
        const timestampStr = fileName.replace('.enc', '').split('-')[0];

        if (!timestampStr || isNaN(Number(timestampStr))) continue;

        const fileTime = Number(timestampStr);
        if (fileTime < cutoff) {
          await gcsDelete(BUCKET, objName);
          deletados.push(objName);
        }
      } catch (err: any) {
        erros.push({ path: objName, erro: err.message || String(err) });
      }
    }
  } catch (err: any) {
    throw new Error(`Erro no cleanup: ${err.message}`);
  }

  return { deletados, erros };
}

/**
 * Retorna o nome do bucket configurado.
 */
export function getFotoBucket(): string {
  return BUCKET;
}
