# Backend Architecture Overview

This document captures the concrete service design for the pieces Daniel asked for: the trip parser service, the Spotify OAuth layer, the relational schema that wires everything together, and the Render deployment configuration that will host it all. It builds on the parser spec (`parser-spec.md`), the data-point model (`data-points.md`), and the OAuth blueprint (`oauth-flows.md`).

## Parser Service

### Goals & placement
- Accept SBB share links, Google Maps shares, and manual journey entries, normalize them into the canonical `Trip` schema described in `parser-spec.md`, and persist the results so downstream services (playlist builder, reminder mailer, analytics) can act on them.
- Surface a deterministic API so the PWA/Share Target handler can queue parsing jobs without embedding transport-specific logic.
- Keep Swiss-focus enrichment hooks (region tags, transport category cues, prognosis data) for the first phase while allowing adapters to be swapped or expanded later.

### API surface
| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/v1/trips/ingest` | `POST` | Accepts either a share URL (`sbb`, `google`, etc.) or manual payload. Returns normalized trip preview + `tripId`. |
| `/api/v1/trips/:tripId/status` | `GET` | Reports parsing status (queued, complete, error) along with validation errors or enrichment notes. |
| `/api/v1/trips/:tripId/refresh` | `POST` | Re-run the adapter (optionally scheduled) to pick up new prognoses or schedule changes. |

Payloads are JSON. For share links the `source` field guides adapter selection, `payload` contains the raw URL along with user session metadata (language, tags, preferred regions). Manual submissions provide the same fields but with explicit `from`, `to`, `date`, `time`, and `provider` hints.

### Adapter structure
1. **Router:** detect the `source` (SBB share URL pattern, Google Maps share, manual). If the Web Share Target lands on `/share`, we record the raw URL and hit `/api/v1/trips/ingest` asynchronously.
2. **Adapter interface:** each adapter (SBB, Google, manual, future SNCF/Trenitalia) implements:
   - Parsing to extract canonical inputs (`from`, `to`, `date`, `time`, optional `journeyId`).
   - Enrichment hooks (e.g., `transport.opendata.ch` call for SBB, optional Google Directions fetch for Maps shares).
   - Canonical field mapping into `Trip.legs` + metadata (region, language, tags, `energyCue`).
3. **Validation pipeline:** ensures at least one leg with duration, positive total duration, valid `departureTime`/`arrivalTime`, and `locale` detection. When validation fails we keep the trip in an `error` state and surface details so the UI can prompt for clarification.
4. **Metadata & telemetry:** we store both the stripped canonical JSON and the raw payload for auditing (e.g., store `rawPayload` JSONB). We also log adapter runtime metrics for monitoring.

### Enrichment & heuristics
- Swiss region mapping by station name (Lausanne → `Lake Geneva`, Lugano → `Italian-speaking`, etc.).
- Transport category mapping to `energyCue` (IC/IR → `high`, RegioExpress → `medium`, S-Bahn/tram → `calm`).
- Delay detection via the `prognosis` data from the transport API or, for Google, by comparing the published arrival time to the parsed `duration`.
- Optional weather context (via stubbed API) can be appended to each trip before persisting if the front end requests it.

### Resilience & scaling
- Parsing is CPU/light I/O bound. We'll queue jobs via an in-process worker pool initially (thanks to Render’s small-to-medium concurrency), but the API is stateless so we can later offload to queueing services (Redis/managed queue).
- Rate-limit calls to `transport.opendata.ch` (cache station lookups, reuse previous trip data when `journeyId` matches).
- Retry logic around HTTP failures with exponential backoff (max 3 attempts) and `Retry-After` respect.

## Spotify OAuth Service

### Endpoints
| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/auth/spotify` | `GET` | Redirects to Spotify `/authorize` with configured scopes. Embeds `state` tying to pending `tripId` or user session. |
| `/auth/spotify/callback` | `GET` | Handles redirect, validates `state`, exchanges authorization code for tokens, stores them, and posts a status update (webhook or UI event). |
| `/api/spotify/refresh` | `POST` | Internal-only endpoint (protected by API key) that refreshes access tokens before the playlist builder runs. |
| `/api/spotify/tokens/:userId` | `GET` | Returns token metadata (without secrets) for diagnostics. |

### Authorization flow
- Request scopes: `playlist-modify-private`, `playlist-modify-public`, `user-read-private`, `user-library-read` (per `oauth-flows.md`).
- Client uses Authorization Code flow; we store the `refresh_token`, `access_token`, `scope`, and `expires_at` (Unix timestamp).
- `state` contains a signed payload referencing the user session, trip ID, and redirect URL so we can continue the playlist generation after login.
- Spotify’s Feb 2026 migration requires: the connected developer account must be Premium, we must register as a single client ID, limit test users (extend quota for production), and honor the renamed endpoints (`/playlists/{id}/items`, `/me/library`). We'll enforce these via the integration tests and release gating.

### Token lifecycle & storage
- Persist tokens in `oauth_tokens` (see schema below) with encryption at rest (Render-managed DB + optional field-level encryption via libs like `node-jose`).
- Background cron job refreshes tokens ~10 minutes before expiry. On `401` from Spotify we trigger an immediate refresh attempt, fallback to user re-auth if the refresh token is revoked.
- On refresh failure (expired refresh token, `invalid_grant`), we emit an event so the reminder/playlist pipeline can nudge the user (via email or UI) to re-auth.
- All token operations log the `scope`, `expires_in`, and Spotify response for observability (Render logs / log drain). Access tokens are never returned to the client.

### Security & compliance
- Use CSRF protection for `/auth/spotify` by validating `state` and storing it in a signed cookie.
- Keep secrets (client ID/secret, signing key) in Render Environment Groups.
- Rate limit the callback endpoint to prevent replay attacks.

## Database Schema

Rendering a schema in Postgres notation (Drizzle/SQL works the same) helps keep migrations deterministic.

### Core tables

#### `users`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | User identity (could be anonymous guest). |
| `email` | `text` | Optional, used for reminders. |
| `preferred_locale` | `text` | E.g., `de-CH`, `fr-CH`. |
| `created_at`, `updated_at` | `timestamptz` | Standard timestamps. |
| `metadata` | `jsonb` | External IDs (e.g., Spotify user ID). |

#### `trips`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY DEFAULT gen_random_uuid()` | Trip reference used across services. |
| `user_id` | `uuid REFERENCES users(id)` | Nullable (guest trips). |
| `source` | `text` | `sbb`, `google`, `manual`. |
| `status` | `text` | `pending`, `complete`, `error`. |
| `canonical` | `jsonb NOT NULL` | Full canonical trip (legs, tags, duration, metadata). |
| `raw_payload` | `jsonb` | Raw share URL or manual input for debugging. |
| `first_departure`, `final_arrival` | `timestamptz` | Derived from `canonical`. |
| `total_duration_seconds` | `integer` | Cached aggregate. |
| `locale`, `preferred_regions`, `preferred_languages` | `text[]` | Useful for filtering. |
| `tags` | `text[]` | `family`, `solo`, etc. |
| `created_at`, `updated_at` | `timestamptz` | Timestamps. |
| `parse_errors` | `jsonb` | Validation issues.

Indexes: `(user_id)`, `(status)`, `gin(canonical)` for queries on legs, and `(first_departure)` for schedulers.

#### `trip_legs`
Some workloads benefit from leg-level access rather than JSON scans.
- `id`, `trip_id REFERENCES trips(id)`, `leg_index`, `mode`, `departure_time`, `arrival_time`, `duration_seconds`, `from_station`, `to_station`, `platform`, `energy_cue`, `prognosis` (jsonb).
- Add composite index on `(trip_id, leg_index)`.

#### `spotify_playlists`
| Column | Type | Notes |
| --- | --- | --- |
| `id` | `uuid PRIMARY KEY` |
| `trip_id` | `uuid REFERENCES trips(id)` | Unique constraint (one playlist per trip). |
| `owner_user_id` | `uuid REFERENCES users(id)` | Denormalized for quick lookups. |
| `playlist_id` | `text` | Spotify ID. |
| `playlist_url` | `text` | External link. |
| `seed_data` | `jsonb` | Which genres/artists/energy cues were used. |
| `created_at`, `updated_at` | `timestamptz` |

#### `oauth_tokens`
Holds Spotify tokens (and future providers).
- `id`, `user_id REFERENCES users(id)`, `provider` (`spotify`, `google`, etc.), `access_token`, `refresh_token`, `scope`, `expires_at`, `meta jsonb` (for raw payload). `access_token` can be encrypted using `pgcrypto`.
- Unique constraint on `(user_id, provider)`.

#### `reminders`
- `id`, `trip_id REFERENCES trips(id)`, `type` (`email`, `push`), `status`, `send_at`, `payload jsonb`, `sent_at`.
- Index on `status`, `(type, send_at)`.

### Observability tables
- `events` (optional) stores timeline updates (parse completed, playlist ready, reminder sent) as structured JSON for auditing.
- `rate_limits` for tracking Spotify API usage per user and backoff thresholds.

### Migration guidance
- Use a migration tool (Drizzle, Knex, Flyway) and have Render run migrations before each deployment (pre-deploy hook). This ensures schema evolves alongside the service.
- Keep `schema_version` table (or rely on migration logs) and allow rollbacks by keeping migration scripts idempotent.

## Render Deployment Details

### Services & topology
1. **Web Service (`rynno-backend`):** Node/Express backend listening on `$PORT`. Auto-deploys from `main` with branch previews for feature branches. Runs behind Render’s HTTPS load balancer with autoscaling (min 1, max 4) and concurrency tuned to ~25 requests per instance.
2. **Cron Job (`trip-refresh`):** Fires every 5 minutes to refresh upcoming trips (check `first_departure` for today + buffer) and update prognoses or replan playlists if needed.
3. **Managed PostgreSQL:** Dev tier for now, auto-backed up. Keep connection string in environment variables (e.g., `DATABASE_URL`). Enable `pg_stat_statements` for diagnosing slow queries.
4. **Redis Cache (optional later):** Use Render Redis or external provider for session caching or job locking.
5. **Static Site / PWA (optional):** Can be deployed either on the same Web Service or via Render Static Site service if we’d rather separate front-end assets. Use Render CDN for geodistributed delivery.

### Environment & secrets
- Define environment groups: `development`, `staging`, `production`, `preview`. Each group holds `DATABASE_URL`, `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET`, `JWT_SIGNING_KEY`, `REDIS_URL`, `WEBHOOK_SECRET`, etc.
- Use Render’s built-in secret rotation to update `SPOTIFY_CLIENT_SECRET` without code changes.
- Store long-lived secrets (Spotify refresh tokens) encrypted at rest, not in logs.

### Monitoring & reliability
- **Health checks:** configure Render health check to call `/health` and `/api/v1/trips/ingest` (with a lightweight payload) so deployments fail fast if parsing breaks.
- **Logging:** stream to Render Logs + optional Logflare/Datadog drain. Tag logs with correlation IDs (`tripId`, `userId`).
- **Alerts:** tie Render alerts to log patterns (`invalid_grant`, `rate limit exceeded`) and high error rates from parser adapters.
- **Autoscaling:** use Render’s CPU-based autoscaling for the backend service; keep the Cron job at a fixed instance size.

### Deployment flow
1. `main` → Render auto-deploy (hook runs migrations, seeds canonical data if needed, then starts service).
2. Feature branches → Render Preview service (makes manual QA easy). Provide preview URLs to stakeholders.
3. On production: ensure `SPOTIFY_CLIENT_ID` is whitelisted by Spotify for the fully-owned premium account; disable preview-specific secrets there.
4. Post-deploy: run smoke tests (parser ingest sample SBB link, Spotify OAuth handshake) as part of pipeline (Render webhooks or separate CI).

### Future ops
- Add Render Health Checks for Cron jobs (e.g., ensure refresh job last run < 10 minutes).
- Consider using Render Private Services if we split off sensitive operations (e.g., confidential batch jobs) from the public Web Service.
- Maintain a `deployments.md` doc linking to Render service IDs and environment variables to avoid forgetting where each secret lives.

---

Let me know if you’d like a sequence diagram or ADR derived from this plan so we can merge with the roadmap.
