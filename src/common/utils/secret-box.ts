import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

// Criptografia simétrica (AES-256-GCM) para segredos guardados no banco, como
// o client_secret do iFood/Keeta. Valores sem o prefixo "enc:" (gravados pelo
// legado em texto puro) são devolvidos como estão.
const PREFIX = 'enc:';

const keyFrom = (secret: string) =>
  createHash('sha256').update(secret).digest();

export function encryptSecret(value: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return (
    PREFIX +
    Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64')
  );
}

export function decryptSecret(value: string, secret: string): string {
  if (!value.startsWith(PREFIX)) return value;
  const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
  const decipher = createDecipheriv(
    'aes-256-gcm',
    keyFrom(secret),
    raw.subarray(0, 12),
  );
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([
    decipher.update(raw.subarray(28)),
    decipher.final(),
  ]).toString('utf8');
}
