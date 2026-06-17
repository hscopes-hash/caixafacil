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
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { deflateSync, inflateSync } from 'zlib';

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

// ── Token GCS via metadata server (Cloud Run) ou fallback JWT ────────────────

async function getGcsAccessToken(): Promise<string> {
  // No Cloud Run, o metadata server fornece token automaticamente
  try {
    const res = await fetch(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      {
        headers: { 'Metadata-Flavor': 'Google' },
        signal: AbortSignal.timeout(5000),
      }
    );
    if (res.ok) {
      const data = await res.json();
      return data.access_token as string;
    }
  } catch {
    // Metadata server indisponível (dev local) — continua sem token
  }

  throw new Error('Metadata server indisponível — necessário Cloud Run para autenticar no GCS');
}

// ── GCS REST helpers ─────────────────────────────────────────────────────

async function gcsUpload(bucket: string, objectName: string, data: Buffer): Promise<void> {
  const token = await getGcsAccessToken();
  const res = await fetch(
    `https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=media&name=${encodeURIComponent(objectName)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/octet-stream',
      },
      body: data,
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GCS upload falhou (${res.status}): ${text}`);
  }
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
