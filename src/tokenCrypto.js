const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function deriveKey(secret) {
  return crypto.createHash('sha256').update(secret).digest();
}

function resolveSecret() {
  return process.env.TOKEN_ENCRYPTION_KEY || 'rynno-dev-token-key-change-me';
}

function encryptToken(plainText) {
  if (!plainText) {
    return null;
  }

  const iv = crypto.randomBytes(12);
  const key = deriveKey(resolveSecret());
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString('base64'),
    content: encrypted.toString('base64'),
    tag: authTag.toString('base64')
  });
}

function decryptToken(payload) {
  if (!payload) {
    return null;
  }

  const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const iv = Buffer.from(parsed.iv, 'base64');
  const content = Buffer.from(parsed.content, 'base64');
  const authTag = Buffer.from(parsed.tag, 'base64');

  const key = deriveKey(resolveSecret());
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(content), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = {
  encryptToken,
  decryptToken
};
