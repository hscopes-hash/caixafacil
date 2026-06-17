/**
 * Utilitário de criptografia AES-256-GCM para tokens sensíveis
 * Usado para criptografar MerchantKey da Cielo e outros tokens no banco
 *
 * A chave mestra vem da env var CRYPTO_MASTER_KEY (Secret Manager no GCP)
 * Se não definida, usa uma chave derivada do APP_NAME como fallback (dev only)
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits para GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

function getMasterKey(): Buffer {
  const envKey = process.env.CRYPTO_MASTER_KEY;
  if (envKey && envKey.length >= 32) {
    return Buffer.from(envKey.slice(0, 32), 'utf-8');
  }
  // Fallback para dev — NUNCA usar em produção
  if (process.env.NODE_ENV === 'production') {
    throw new Error('CRYPTO_MASTER_KEY nao definida em producao. Configure via env var ou Secret Manager.');
  }
  const fallback = 'caixafacil-dev-master-key-32c!';
  return Buffer.from(fallback.slice(0, 32), 'utf-8');
}

/**
 * Criptografa um texto plano e retorna string base64 (iv + authTag + ciphertext)
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return '';
  const crypto = require('crypto');
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf-8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  // Format: base64(iv + authTag + encrypted)
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('base64');
}

/**
 * Descriptografa uma string base64 (iv + authTag + ciphertext) → texto plano
 */
export function decrypt(encryptedBase64: string): string {
  if (!encryptedBase64) return '';
  const crypto = require('crypto');
  const key = getMasterKey();
  const combined = Buffer.from(encryptedBase64, 'base64');
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString('utf-8');
}
