const crypto = require('crypto');

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(input) {
  const normalized = String(input || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function sign(parts, secret) {
  return base64UrlEncode(
    crypto
      .createHmac('sha256', secret)
      .update(parts.join('.'))
      .digest()
  );
}

function createAuthStateTokenService({ secret, ttlMs }) {
  if (!secret) {
    throw new Error('Missing secret for OAuth state signing.');
  }

  return {
    issue(payload) {
      const nowMs = Date.now();
      const body = {
        ...payload,
        nonce: crypto.randomBytes(16).toString('hex'),
        iat: nowMs,
        exp: nowMs + ttlMs
      };
      const encodedPayload = base64UrlEncode(JSON.stringify(body));
      const signature = sign([encodedPayload], secret);
      return `${encodedPayload}.${signature}`;
    },

    consume(token) {
      if (!token || typeof token !== 'string') {
        return null;
      }

      const [encodedPayload, providedSignature] = token.split('.');
      if (!encodedPayload || !providedSignature) {
        return null;
      }

      const expectedSignature = sign([encodedPayload], secret);
      const providedBuffer = Buffer.from(providedSignature);
      const expectedBuffer = Buffer.from(expectedSignature);
      if (providedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(providedBuffer, expectedBuffer)) {
        return null;
      }

      try {
        const payload = JSON.parse(base64UrlDecode(encodedPayload));
        if (!payload.exp || Date.now() > payload.exp) {
          return null;
        }
        return payload;
      } catch {
        return null;
      }
    }
  };
}

module.exports = { createAuthStateTokenService };
