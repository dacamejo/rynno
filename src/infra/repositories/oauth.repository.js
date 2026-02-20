const { encryptToken, decryptToken } = require('../../tokenCrypto');

function createOAuthRepository({ query, fallbackState, persistFallbackState }) {
  return {
    async upsertUser({ userId, email = null, spotifyUserId = null, locale = null, timezone = 'UTC' }) {
      if (query) {
        const result = await query(
          `INSERT INTO users (user_id, email, spotify_user_id, locale, timezone, updated_at)
           VALUES ($1,$2,$3,$4,$5,NOW())
           ON CONFLICT (user_id) DO UPDATE SET
             email = COALESCE(EXCLUDED.email, users.email),
             spotify_user_id = COALESCE(EXCLUDED.spotify_user_id, users.spotify_user_id),
             locale = COALESCE(EXCLUDED.locale, users.locale),
             timezone = COALESCE(EXCLUDED.timezone, users.timezone),
             updated_at = NOW()
           RETURNING user_id, email, spotify_user_id, locale, timezone;`,
          [userId, email, spotifyUserId, locale, timezone]
        );
        return result.rows[0];
      }

      fallbackState.users[userId] = {
        user_id: userId,
        email,
        spotify_user_id: spotifyUserId,
        locale,
        timezone,
        updated_at: new Date().toISOString()
      };
      await persistFallbackState();
      return fallbackState.users[userId];
    },

    async saveOAuthToken({ userId, provider, accessToken, refreshToken, scope, tokenType, expiresAt, metadata = {} }) {
      const encryptedAccessToken = encryptToken(accessToken);
      const encryptedRefreshToken = refreshToken ? encryptToken(refreshToken) : null;

      if (query) {
        await query(
          `INSERT INTO oauth_tokens
          (user_id, provider, access_token_ciphertext, refresh_token_ciphertext, scope, token_type, expires_at, last_refreshed_at, metadata, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8,NOW())
          ON CONFLICT (user_id, provider) DO UPDATE SET
            access_token_ciphertext = EXCLUDED.access_token_ciphertext,
            refresh_token_ciphertext = COALESCE(EXCLUDED.refresh_token_ciphertext, oauth_tokens.refresh_token_ciphertext),
            scope = EXCLUDED.scope,
            token_type = EXCLUDED.token_type,
            expires_at = EXCLUDED.expires_at,
            last_refreshed_at = NOW(),
            metadata = EXCLUDED.metadata,
            updated_at = NOW();`,
          [userId, provider, encryptedAccessToken, encryptedRefreshToken, scope, tokenType, expiresAt, metadata]
        );
        return;
      }

      fallbackState.oauthTokens[`${provider}:${userId}`] = {
        userId,
        provider,
        accessTokenCiphertext: encryptedAccessToken,
        refreshTokenCiphertext: encryptedRefreshToken,
        scope,
        tokenType,
        expiresAt,
        metadata,
        lastRefreshedAt: new Date().toISOString()
      };
      await persistFallbackState();
    },

    async getOAuthToken(userId, provider) {
      if (query) {
        const result = await query('SELECT * FROM oauth_tokens WHERE user_id = $1 AND provider = $2', [userId, provider]);
        if (result.rowCount === 0) {
          return null;
        }

        const row = result.rows[0];
        return {
          userId: row.user_id,
          provider: row.provider,
          accessToken: decryptToken(row.access_token_ciphertext),
          refreshToken: row.refresh_token_ciphertext ? decryptToken(row.refresh_token_ciphertext) : null,
          scope: row.scope,
          tokenType: row.token_type,
          expiresAt: row.expires_at,
          lastRefreshedAt: row.last_refreshed_at,
          metadata: row.metadata || {}
        };
      }

      const entry = fallbackState.oauthTokens[`${provider}:${userId}`];
      if (!entry) {
        return null;
      }

      return {
        userId: entry.userId,
        provider: entry.provider,
        accessToken: decryptToken(entry.accessTokenCiphertext),
        refreshToken: entry.refreshTokenCiphertext ? decryptToken(entry.refreshTokenCiphertext) : null,
        scope: entry.scope,
        tokenType: entry.tokenType,
        expiresAt: entry.expiresAt,
        lastRefreshedAt: entry.lastRefreshedAt,
        metadata: entry.metadata || {}
      };
    }
  };
}

module.exports = { createOAuthRepository };
